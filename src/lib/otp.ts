import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

// One-time codes for email login. Codes are never stored in plain text — only
// an HMAC of the code (keyed by AUTH_SECRET) is kept on the user document.

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // valid for 10 minutes
export const OTP_MAX_ATTEMPTS = 5; // wrong tries before the code is burned
export const OTP_RESEND_MS = 60 * 1000; // min gap between "send code" requests

export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export function hashOtp(otp: string): string {
  const secret = process.env.AUTH_SECRET || "dev-secret";
  return createHmac("sha256", secret).update(otp).digest("hex");
}

export function verifyOtp(otp: string, hash: string | undefined | null): boolean {
  if (!hash) return false;
  const a = Buffer.from(hashOtp(otp));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Mask an email for display: "rahulupadhyay825@gmail.com" -> "ra••••25@gmail.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 2);
  const tail = local.length > 4 ? local.slice(-2) : "";
  return `${head}${"•".repeat(3)}${tail}@${domain}`;
}
