import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { User } from "@/lib/models/User";
import {
  getSession,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import type { Capability } from "@/lib/session";
import {
  ALL_CAPABILITIES,
  SUPERADMIN_ONLY_CAPABILITIES,
} from "@/lib/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Entering / leaving a site re-mints the session token rather than adding a
// second cookie — the JWT is already signed, so the site claim cannot be
// tampered with. Serves superadmins ("act as this site") and, once an admin
// has access to more than one site, their site switcher.

// POST /api/session/site  { siteId }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { siteId } = await req.json();
    if (!siteId || !Types.ObjectId.isValid(String(siteId))) {
      return NextResponse.json({ error: "Pass a valid siteId." }, { status: 400 });
    }

    await connectDB();
    const site = await Site.findById(String(siteId))
      .select("name slug active")
      .lean<{ _id: any; name: string; slug: string; active: boolean }>();
    if (!site) {
      return NextResponse.json({ error: "Site not found." }, { status: 404 });
    }

    const isSuperadmin = session.role === "superadmin";
    let caps: Capability[];

    if (isSuperadmin) {
      caps = ALL_CAPABILITIES;
    } else {
      // An admin may only enter a site they have been granted.
      const user = await User.findById(session.sub).select("role siteAccess siteId");
      if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const grant = (user.siteAccess || []).find(
        (a: any) => String(a.siteId) === String(site._id)
      );
      if (!grant && String(user.siteId || "") !== String(site._id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // Reserved capabilities are stripped exactly as guard() strips them,
      // so the nav this token drives matches what the routes will allow.
      caps = (
        grant ? (grant.capabilities as Capability[]) : ALL_CAPABILITIES
      ).filter((c) => !SUPERADMIN_ONLY_CAPABILITIES.includes(c));
    }

    const token = await createSessionToken({
      ...session,
      siteId: String(site._id),
      siteSlug: site.slug,
      siteName: site.name,
      caps,
      acting: isSuperadmin,
    });
    setSessionCookie(token);

    return NextResponse.json({
      ok: true,
      site: { id: String(site._id), slug: site.slug, name: site.name },
    });
  } catch (err) {
    console.error("enter site error", err);
    return NextResponse.json({ error: "Could not switch site." }, { status: 500 });
  }
}

// DELETE /api/session/site — superadmin leaves the site context.
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "superadmin") {
    // Ordinary users always belong to a site; clearing it would strand them.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await createSessionToken({
    ...session,
    siteId: undefined,
    siteSlug: undefined,
    siteName: undefined,
    caps: undefined,
    acting: false,
  });
  setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
