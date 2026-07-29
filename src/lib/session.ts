import { SignJWT, jwtVerify } from "jose";

// Edge-safe session utilities (no Node-only imports). Used by middleware.

export const SESSION_COOKIE = "qs_session";

/**
 * Single source of truth for roles — models/User.ts re-exports this rather
 * than declaring its own copy, so the two can never drift.
 */
export type Role = "superadmin" | "admin" | "technician" | "resident";

/** What an admin may do within a site. Kept here so middleware can read it. */
export type Capability =
  | "view_data"
  | "exports"
  | "billing"
  | "residents"
  | "messaging"
  | "records"
  | "schedule"
  | "technicians";

/** Every capability that exists. One list, imported wherever caps are built. */
export const ALL_CAPABILITIES: Capability[] = [
  "view_data",
  "exports",
  "billing",
  "residents",
  "messaging",
  "records",
  "schedule",
  "technicians",
];

/**
 * Reserved for the superadmin.
 *
 * Installation scheduling and the field team are run centrally rather than by
 * a building's own admin, so these are stripped from every site admin's
 * effective set — including any stale grant that still carries them. Doing it
 * in one place means the nav, the pages and the APIs all follow from this
 * single decision rather than each remembering to check.
 */
export const SUPERADMIN_ONLY_CAPABILITIES: Capability[] = [
  "schedule",
  "technicians",
];

/** What a superadmin may hand to a site admin. */
export const GRANTABLE_CAPABILITIES: Capability[] = ALL_CAPABILITIES.filter(
  (c) => !SUPERADMIN_ONLY_CAPABILITIES.includes(c)
);

export interface SessionPayload {
  sub: string;
  name: string;
  email: string;
  role: Role;
  /** Resident login handle, e.g. "rosalyn_501". */
  username?: string;
  /** Resident's flat number. */
  flat?: string;
  /** True while the user still has a seeded password to replace. */
  mustChange?: boolean;

  /** Active site. Undefined only for a superadmin who has not entered one. */
  siteId?: string;
  siteSlug?: string;
  /** Cached for the header chip, so rendering needs no extra DB read. */
  siteName?: string;
  /**
   * UI HINT ONLY — never an authorisation decision. Tokens live 7 days, so
   * guard() re-reads capabilities from the database on every protected
   * request; this copy exists so the nav can render without a round-trip.
   */
  caps?: Capability[];
  /** True when a superadmin is acting inside a site. */
  acting?: boolean;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (see .env.example).");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: String(payload.sub),
      name: String(payload.name),
      email: String(payload.email ?? ""),
      role: payload.role as Role,
      username: payload.username ? String(payload.username) : undefined,
      flat: payload.flat ? String(payload.flat) : undefined,
      mustChange: payload.mustChange === true,
      siteId: payload.siteId ? String(payload.siteId) : undefined,
      siteSlug: payload.siteSlug ? String(payload.siteSlug) : undefined,
      siteName: payload.siteName ? String(payload.siteName) : undefined,
      caps: Array.isArray(payload.caps)
        ? (payload.caps as Capability[])
        : undefined,
      acting: payload.acting === true,
    };
  } catch {
    return null;
  }
}
