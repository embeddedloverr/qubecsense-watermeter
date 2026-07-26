import { getSession } from "@/lib/auth";
import type { SessionPayload } from "@/lib/session";

// Central place for route authorisation.
//
// Today this is role-only and behaves exactly like the copies it replaces.
// It exists as a seam: multi-site adds per-site capability checks here
// (guard(cap) / guardPage(cap) / scoped(ctx, filter)) so routes adopt them by
// changing an import rather than by hand-rolling checks again.

/** The signed-in admin, or null. Mirrors the previous per-route helper. */
export async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

/** Any signed-in user, or null. */
export async function requireSession(): Promise<SessionPayload | null> {
  return getSession();
}

/** The signed-in resident, or null. */
export async function requireResident(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || session.role !== "resident") return null;
  return session;
}
