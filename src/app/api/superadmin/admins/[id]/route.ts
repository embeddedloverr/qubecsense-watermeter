import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User, ALL_CAPABILITIES, type Capability } from "@/lib/models/User";
import { guardSuperadmin } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/superadmin/admins/<id>
//   { access: [{ siteId, capabilities }] }  — replace the whole grant list
//   { active: boolean }                     — enable/disable the account
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  try {
    const body = await req.json();
    await connectDB();

    if (!Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await User.findById(params.id);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // A superadmin already holds everything implicitly; granting per-site
    // capabilities to one would be misleading.
    if (user.role === "superadmin" && body.access !== undefined) {
      return NextResponse.json(
        { error: "Superadmins already have every capability on every site." },
        { status: 400 }
      );
    }

    if (typeof body.active === "boolean") {
      if (user.role === "superadmin" && !body.active) {
        const others = await User.countDocuments({
          role: "superadmin",
          active: { $ne: false },
          _id: { $ne: user._id },
        });
        if (others === 0) {
          return NextResponse.json(
            { error: "This is the only active superadmin — disabling it would lock everyone out." },
            { status: 400 }
          );
        }
      }
      user.active = body.active;
    }

    if (Array.isArray(body.access)) {
      const cleaned = body.access
        .filter((a: any) => a?.siteId && Types.ObjectId.isValid(String(a.siteId)))
        .map((a: any) => ({
          siteId: new Types.ObjectId(String(a.siteId)),
          capabilities: (Array.isArray(a.capabilities) ? a.capabilities : []).filter(
            (c: string) => ALL_CAPABILITIES.includes(c as Capability)
          ),
        }));
      user.siteAccess = cleaned;

      // Keep the home site pointing at something they can still reach.
      const stillHasHome = cleaned.some(
        (a: any) => String(a.siteId) === String(user.siteId || "")
      );
      if (!stillHasHome) {
        user.siteId = cleaned.length ? cleaned[0].siteId : undefined;
      }
    }

    await user.save();

    return NextResponse.json({
      ok: true,
      id: String(user._id),
      active: user.active !== false,
      access: (user.siteAccess || []).map((a: any) => ({
        siteId: String(a.siteId),
        capabilities: a.capabilities,
      })),
    });
  } catch (err) {
    console.error("update admin error", err);
    return NextResponse.json({ error: "Could not update the admin." }, { status: 500 });
  }
}
