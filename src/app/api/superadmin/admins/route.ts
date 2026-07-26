import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User, ALL_CAPABILITIES } from "@/lib/models/User";
import { Site } from "@/lib/models/Site";
import { guardSuperadmin } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { validatePassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/superadmin/admins — every admin with their per-site grants.
export async function GET() {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  await connectDB();
  const [admins, sites] = await Promise.all([
    User.find({ role: { $in: ["admin", "superadmin"] } })
      .select("name email role active siteId siteAccess lastLoginAt")
      .sort({ createdAt: 1 })
      .lean<any[]>(),
    Site.find({}, { name: 1, slug: 1 }).lean<any[]>(),
  ]);

  const siteById = new Map(sites.map((s) => [String(s._id), s]));

  return NextResponse.json({
    capabilities: ALL_CAPABILITIES,
    sites: sites.map((s) => ({ id: String(s._id), name: s.name, slug: s.slug })),
    admins: admins.map((a) => ({
      id: String(a._id),
      name: a.name,
      email: a.email || "",
      role: a.role,
      active: a.active !== false,
      lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : null,
      homeSiteId: a.siteId ? String(a.siteId) : null,
      access: (a.siteAccess || []).map((x: any) => ({
        siteId: String(x.siteId),
        siteName: siteById.get(String(x.siteId))?.name || "(deleted site)",
        capabilities: x.capabilities || [],
      })),
    })),
  });
}

// POST /api/superadmin/admins — create an admin for a site.
export async function POST(req: NextRequest) {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  try {
    const { name, email, password, siteId, capabilities } = await req.json();
    const mail = String(email || "").toLowerCase().trim();

    if (!name || !mail || !siteId) {
      return NextResponse.json(
        { error: "Name, email and site are required." },
        { status: 400 }
      );
    }
    const invalid = validatePassword(String(password || ""), { email: mail, name });
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    await connectDB();
    if (await User.findOne({ email: mail })) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 }
      );
    }
    const site = await Site.findById(siteId).select("_id").lean<any>();
    if (!site) {
      return NextResponse.json({ error: "Site not found." }, { status: 404 });
    }

    const caps = Array.isArray(capabilities)
      ? capabilities.filter((c: string) => ALL_CAPABILITIES.includes(c as any))
      : ALL_CAPABILITIES;

    const user = await User.create({
      name,
      email: mail,
      passwordHash: await hashPassword(String(password)),
      role: "admin",
      siteId: site._id,
      siteAccess: [{ siteId: site._id, capabilities: caps }],
      active: true,
      mustChangePassword: false,
    });

    return NextResponse.json(
      { admin: { id: String(user._id), name: user.name, email: user.email } },
      { status: 201 }
    );
  } catch (err) {
    console.error("create admin error", err);
    return NextResponse.json({ error: "Could not create the admin." }, { status: 500 });
  }
}
