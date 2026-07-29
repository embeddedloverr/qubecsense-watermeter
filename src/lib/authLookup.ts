import { User, type IUser } from "./models/User";
import { Flat } from "./models/Flat";
import { Site } from "./models/Site";
import {
  ALL_CAPABILITIES,
  SUPERADMIN_ONLY_CAPABILITIES,
  type Capability,
  type SessionPayload,
} from "./session";
import type { HydratedDocument } from "mongoose";

/**
 * Build the JWT claims for a user. Shared by the password login and the OTP
 * verify route so the two can never mint different-shaped sessions.
 */
export async function sessionPayloadFor(
  user: HydratedDocument<IUser>
): Promise<SessionPayload> {
  const base: SessionPayload = {
    sub: user._id.toString(),
    name: user.name,
    email: user.email || "",
    role: user.role,
    username: user.username || undefined,
    flat: user.flatNumber || undefined,
    mustChange: user.mustChangePassword === true,
  };

  // A superadmin has no home site; they pick one via /api/session/site.
  if (user.role === "superadmin" || !user.siteId) return base;

  const site = await Site.findById(user.siteId)
    .select("name slug")
    .lean<{ name: string; slug: string }>();
  if (!site) return base;

  let caps: Capability[] | undefined;
  if (user.role === "admin") {
    const grant = (user.siteAccess || []).find(
      (a) => String(a.siteId) === String(user.siteId)
    );
    // Transitional: admins without an explicit grant keep full access. Mirrors
    // the same fallback in guard.ts; both go once grants are backfilled.
    const granted = grant
      ? (grant.capabilities as Capability[])
      : ALL_CAPABILITIES;
    // Must drop the reserved ones exactly as guard() does, or the nav renders
    // links that 403 the moment they are clicked.
    caps = granted.filter((c) => !SUPERADMIN_ONLY_CAPABILITIES.includes(c));
  }

  return {
    ...base,
    siteId: String(user.siteId),
    siteSlug: site.slug,
    siteName: site.name,
    caps,
  };
}

/**
 * Resolve a login identifier (username, account email, or a flat's owner
 * email) to a user document.
 */
export async function findUserByIdentifier(
  identifier: string
): Promise<HydratedDocument<IUser> | null> {
  const id = identifier.toLowerCase().trim();
  if (!id) return null;

  // Username and account email are globally unique, so these are unambiguous.
  const user = await User.findOne({ $or: [{ username: id }, { email: id }] });
  if (user) return user;

  if (!id.includes("@")) return null;

  // Fall back to the flat's owner email. Owner emails are NOT unique across
  // sites, so resolve the flat first and scope the resident lookup to that
  // flat's site — otherwise flat 501 in one site could return the resident of
  // flat 501 in another and email them a login code for the wrong account.
  const flats = await Flat.find({ ownerEmail: id }, { flatNumber: 1, siteId: 1 })
    .limit(2)
    .lean();
  if (flats.length !== 1) {
    // Zero matches, or the same email owns flats in more than one site —
    // ambiguous, so require the username instead of guessing.
    return null;
  }

  const flat = flats[0] as any;
  return User.findOne({
    role: "resident",
    flatNumber: flat.flatNumber,
    ...(flat.siteId ? { siteId: flat.siteId } : {}),
  });
}

/** Where an OTP should be delivered for this user. */
export async function deliveryEmailFor(
  user: Pick<IUser, "role" | "flatNumber" | "email" | "siteId">
): Promise<string> {
  if (user.role === "resident" && user.flatNumber) {
    const flat = await Flat.findOne(
      {
        flatNumber: user.flatNumber,
        ...(user.siteId ? { siteId: user.siteId } : {}),
      },
      { ownerEmail: 1 }
    ).lean();
    return ((flat as any)?.ownerEmail || user.email || "").trim();
  }
  return (user.email || "").trim();
}
