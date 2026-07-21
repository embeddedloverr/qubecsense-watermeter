import { SignJWT, jwtVerify } from "jose";

// Edge-safe session utilities (no Node-only imports). Used by middleware.

export const SESSION_COOKIE = "qs_session";

export type Role = "admin" | "technician" | "resident";

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
    };
  } catch {
    return null;
  }
}
