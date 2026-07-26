import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Symmetric encryption for secrets we must store and read back — currently
// each site's upstream data-API key. Values are stored as
//   v1:<iv>:<authTag>:<ciphertext>   (all base64url)
// so the format is self-describing and can be rotated later.

const PREFIX = "v1";

function key(): Buffer {
  // AUTH_SECRET is already a long random server-side secret, so SITE_SECRET_KEY
  // is optional; set it when you want site secrets to survive an AUTH_SECRET
  // rotation (which would otherwise invalidate sessions AND site keys at once).
  const secret = process.env.SITE_SECRET_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Cannot encrypt site secrets: set SITE_SECRET_KEY (or AUTH_SECRET)."
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    PREFIX,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(":");
}

/**
 * Reverse of encryptSecret. Returns "" when the value is empty, and passes
 * through anything that isn't in our format — so a key pasted straight into
 * the database by hand still works.
 */
export function decryptSecret(stored: string): string {
  if (!stored) return "";
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return stored;

  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key or tampered value — never leak ciphertext to the caller.
    throw new Error(
      "Could not decrypt a site secret. Has SITE_SECRET_KEY/AUTH_SECRET changed?"
    );
  }
}

/** Last 4 characters, for showing a stored key without revealing it. */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  return `${"•".repeat(6)}${plain.slice(-4)}`;
}
