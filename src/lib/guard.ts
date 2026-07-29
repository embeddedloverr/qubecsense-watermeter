import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Site, type ISite } from "@/lib/models/Site";
import { homeFor } from "@/lib/utils";
import {
  ALL_CAPABILITIES,
  SUPERADMIN_ONLY_CAPABILITIES,
  type Capability,
  type SessionPayload,
} from "@/lib/session";

// Central authorisation. Every protected route resolves a site context here,
// then scopes its queries with `scoped(ctx, ...)`.
//
// Capabilities are re-read from the database on each request rather than
// trusted from the JWT: tokens live 7 days, so a revoked capability would
// otherwise keep working for a week.

export interface Ctx {
  session: SessionPayload;
  siteId: Types.ObjectId;
  site: ISite;
  isSuperadmin: boolean;
  caps: Set<Capability>;
}

type GuardResult =
  | { ok: true; ctx: Ctx }
  | { ok: false; res: NextResponse };

const forbidden = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });
const unauthorised = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/**
 * Resolve the caller's site context and capabilities.
 * `requiredCaps` is ignored for superadmins, who hold every capability.
 */
async function resolve(
  requiredCaps: Capability[],
  explicitSiteId?: string
): Promise<
  | { ok: true; ctx: Ctx }
  | { ok: false; reason: "anon" | "no-site" | "forbidden" | "no-site-record" }
> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "anon" };

  const targetSiteId = explicitSiteId || session.siteId;
  if (!targetSiteId || !Types.ObjectId.isValid(targetSiteId)) {
    return { ok: false, reason: "no-site" };
  }

  await connectDB();

  const isSuperadmin = session.role === "superadmin";
  let caps = new Set<Capability>();

  if (isSuperadmin) {
    caps = new Set(ALL_CAPABILITIES);
  } else {
    const user = await User.findById(session.sub).select(
      "role active siteId siteAccess"
    );
    if (!user || user.active === false) return { ok: false, reason: "anon" };

    const grant = (user.siteAccess || []).find(
      (a: any) => String(a.siteId) === String(targetSiteId)
    );

    if (grant) {
      caps = new Set(grant.capabilities as Capability[]);
    } else if (
      user.role === "admin" &&
      String(user.siteId || "") === String(targetSiteId)
    ) {
      // TRANSITIONAL: an admin whose home site matches but who has no explicit
      // grant yet keeps full access, so the existing admin is never locked out
      // between deploying this and running the grant migration.
      // Remove once every admin has a siteAccess entry.
      caps = new Set(ALL_CAPABILITIES);
    } else if (
      user.role === "technician" &&
      String(user.siteId || "") === String(targetSiteId)
    ) {
      // Technicians hold no admin capabilities; guardSite() covers them.
      caps = new Set();
    } else {
      return { ok: false, reason: "forbidden" };
    }

    // Reserved capabilities never survive to a non-superadmin, whatever the
    // grant or the fallback above handed out. This single line is what keeps
    // Schedule and Team out of the admin nav, its pages and its APIs.
    for (const c of SUPERADMIN_ONLY_CAPABILITIES) caps.delete(c);

    if (requiredCaps.some((c) => !caps.has(c))) {
      return { ok: false, reason: "forbidden" };
    }
  }

  const site = await Site.findById(targetSiteId).lean<ISite>();
  if (!site) return { ok: false, reason: "no-site-record" };
  if (site.active === false && !isSuperadmin) {
    return { ok: false, reason: "forbidden" };
  }

  return {
    ok: true,
    ctx: {
      session,
      siteId: new Types.ObjectId(targetSiteId),
      site,
      isSuperadmin,
      caps,
    },
  };
}

/** Route handlers: returns a ready-to-return response on failure. */
export async function guard(
  cap: Capability | Capability[],
  opts?: { siteId?: string }
): Promise<GuardResult> {
  const needed = Array.isArray(cap) ? cap : [cap];
  const r = await resolve(needed, opts?.siteId);
  if (r.ok) return { ok: true, ctx: r.ctx };

  if (r.reason === "anon") return { ok: false, res: unauthorised() };
  if (r.reason === "no-site") {
    return {
      ok: false,
      res: NextResponse.json({ error: "No site context." }, { status: 400 }),
    };
  }
  if (r.reason === "no-site-record") {
    return {
      ok: false,
      res: NextResponse.json({ error: "Site not found." }, { status: 404 }),
    };
  }
  return { ok: false, res: forbidden() };
}

/** Any signed-in user belonging to a site (residents, technicians). */
export async function guardSite(opts?: {
  siteId?: string;
}): Promise<GuardResult> {
  return guard([], opts);
}

/** Superadmin-only routes. */
export async function guardSuperadmin(): Promise<
  { ok: true; session: SessionPayload } | { ok: false; res: NextResponse }
> {
  const session = await getSession();
  if (!session) return { ok: false, res: unauthorised() };
  if (session.role !== "superadmin") return { ok: false, res: forbidden() };
  return { ok: true, session };
}

/** Server components / pages: redirects instead of returning JSON. */
export async function guardPage(
  cap: Capability | Capability[]
): Promise<Ctx> {
  const needed = Array.isArray(cap) ? cap : [cap];
  const r = await resolve(needed);
  if (r.ok) return r.ctx;

  const session = await getSession();
  if (!session) redirect("/login");
  // Signed in but not permitted here — send them somewhere they can be.
  redirect(homeFor(session.role));
}

/** Add the site filter to a query. The one way queries get scoped. */
export function scoped<T extends Record<string, unknown>>(
  ctx: Ctx,
  filter?: T
): T & { siteId: Types.ObjectId } {
  return { ...(filter || ({} as T)), siteId: ctx.siteId };
}

/* ------------------------------------------------------------------ */
/* Legacy role-only helpers — still used by routes not yet migrated.   */
/* ------------------------------------------------------------------ */

export async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.role !== "admin" && session.role !== "superadmin") return null;
  return session;
}

export async function requireResident(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || session.role !== "resident") return null;
  return session;
}
