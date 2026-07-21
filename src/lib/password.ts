// Password policy, shared by the API routes and the change-password form so
// the rules can never drift between what the UI shows and what the server
// enforces.

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  id: string;
  /** Shown in the live checklist. */
  label: string;
  /** Used inside a sentence, so it must already read as lower case prose. */
  hint: string;
  test: (password: string) => boolean;
}

/** Rules that depend only on the password itself — safe to check in the browser. */
export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    hint: `at least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "upper",
    label: "One capital letter (A–Z)",
    hint: "one capital letter (A–Z)",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lower",
    label: "One small letter (a–z)",
    hint: "one small letter (a–z)",
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: "digit",
    label: "One number (0–9)",
    hint: "one number (0–9)",
    test: (p) => /\d/.test(p),
  },
];

/** Not required, but shown so people know it makes the password stronger. */
export const SYMBOL_RULE: PasswordRule = {
  id: "symbol",
  label: "A symbol such as ! @ # (recommended)",
  hint: "a symbol",
  test: (p) => /[^A-Za-z0-9]/.test(p),
};

/**
 * Four or more characters running in order, e.g. "1234", "4321", "abcd".
 * Catches passwords like "Abcd1234" that tick every box but are still weak.
 */
function hasRunOfSequentialChars(password: string): boolean {
  const s = password.toLowerCase();
  const sameClass = (a: string, b: string) =>
    (/\d/.test(a) && /\d/.test(b)) || (/[a-z]/.test(a) && /[a-z]/.test(b));

  let run = 1;
  let direction = 0;
  for (let i = 1; i < s.length; i++) {
    const delta = s.charCodeAt(i) - s.charCodeAt(i - 1);
    const stepping =
      (delta === 1 || delta === -1) && sameClass(s[i], s[i - 1]);
    if (!stepping) {
      run = 1;
      direction = 0;
      continue;
    }
    run = delta === direction ? run + 1 : 2;
    direction = delta;
    if (run >= 4) return true;
  }
  return false;
}

// Passwords that satisfy the character rules but are still trivially guessable.
const COMMON_PASSWORDS = new Set([
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "qwerty123",
  "qwerty1234",
  "abcd1234",
  "abc12345",
  "welcome1",
  "welcome123",
  "admin123",
  "administrator1",
  "letmein1",
  "iloveyou1",
  "changeme1",
  "test1234",
  "india123",
  "12345678a",
  "a1234567",
  "asdf1234",
  "zaq12wsx",
  "1qaz2wsx",
]);

export interface PasswordContext {
  username?: string | null;
  flatNumber?: string | null;
  name?: string | null;
  email?: string | null;
}

/**
 * Full validation. Returns an error message, or null when the password is fine.
 * Pass the account context so people can't just reuse their own username.
 */
export function validatePassword(
  password: string,
  context: PasswordContext = {}
): string | null {
  if (typeof password !== "string" || !password) {
    return "Enter a new password.";
  }

  const failed = PASSWORD_RULES.filter((r) => !r.test(password));
  if (failed.length) {
    return `Password must have ${failed.map((r) => r.hint).join(", ")}.`;
  }

  if (/^\s|\s$/.test(password)) {
    return "Password cannot start or end with a space.";
  }

  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lower)) {
    return "That password is too easy to guess. Please choose another.";
  }

  // Long runs of one character, e.g. "Aaaaaaa1".
  if (/(.)\1{3,}/.test(password)) {
    return "Password cannot repeat the same character four times in a row.";
  }

  if (hasRunOfSequentialChars(password)) {
    return "Avoid runs like 1234 or abcd — please mix the characters up.";
  }

  const forbidden = [
    context.username,
    context.flatNumber,
    context.email ? context.email.split("@")[0] : null,
    "rosalyn",
    "qubecsense",
  ].filter((v): v is string => Boolean(v && String(v).length >= 3));

  for (const term of forbidden) {
    if (lower.includes(String(term).toLowerCase())) {
      return "Password cannot contain your username, flat number or the site name.";
    }
  }

  return null;
}

/** Per-rule pass/fail, for the live checklist under the password box. */
export function passwordChecklist(
  password: string
): { id: string; label: string; ok: boolean; required: boolean }[] {
  return [
    ...PASSWORD_RULES.map((r) => ({
      id: r.id,
      label: r.label,
      ok: r.test(password),
      required: true,
    })),
    {
      id: SYMBOL_RULE.id,
      label: SYMBOL_RULE.label,
      ok: SYMBOL_RULE.test(password),
      required: false,
    },
  ];
}
