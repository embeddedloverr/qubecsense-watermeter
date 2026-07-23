// Email each flat its QubecSense login. Because stored passwords are bcrypt
// hashes and can't be recovered, this ISSUES a fresh one-time password per
// resident and emails that; the resident must change it on first sign-in.
//
//   npm run email:credentials                      # dry run — lists who would be emailed, sends nothing
//   npm run email:credentials -- --test you@x.com  # one sample email to you, no DB changes
//   npm run email:credentials -- --send            # really reset + email residents who haven't set a password
//   npm run email:credentials -- --send --all      # ...including those who already set their own
//   npm run email:credentials -- --send --flat=101,102
//
import "dotenv/config";
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  MONGODB_URI,
  SMTP_HOST,
  SMTP_PORT = "587",
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  APP_URL = "https://meters.qubecsense.com",
  RESIDENT_PASSWORD_LENGTH = "10",
} = process.env;

if (!MONGODB_URI) {
  console.error("✗ MONGODB_URI is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const send = args.includes("--send");
const all = args.includes("--all");
const testArg = args.find((a) => a.startsWith("--test"));
const testEmail = testArg
  ? testArg.includes("=")
    ? testArg.split("=")[1]
    : args[args.indexOf(testArg) + 1]
  : null;
const flatArg = args.find((a) => a.startsWith("--flat="));
const onlyFlats = flatArg
  ? flatArg.slice("--flat=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : null;
const THROTTLE_MS = Number(args.find((a) => a.startsWith("--delay="))?.split("=")[1]) || 900;

// --- Password generator (guaranteed to meet the app's password policy) ---
const PW_LOWER = "abcdefghjkmnpqrstuvwxyz";
const PW_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const PW_DIGITS = "23456789";
const PW_ALL = PW_LOWER + PW_UPPER + PW_DIGITS;
function randomPassword(len) {
  const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(PW_LOWER), pick(PW_UPPER), pick(PW_DIGITS)];
  while (chars.length < len) chars.push(pick(PW_ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const UserSchema = new mongoose.Schema(
  {
    name: String,
    username: String,
    email: String,
    passwordHash: String,
    role: String,
    flatNumber: String,
    phone: String,
    active: Boolean,
    mustChangePassword: Boolean,
    lastLoginAt: Date,
  },
  { timestamps: true }
);
const FlatSchema = new mongoose.Schema(
  { flatNumber: String, ownerName: String, ownerEmail: String, ownerPhone: String },
  { timestamps: true }
);
const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Flat = mongoose.models.Flat || mongoose.model("Flat", FlatSchema);

const esc = (s) =>
  String(s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

function buildEmail({ ownerName, flat, username, password }) {
  const loginUrl = `${APP_URL.replace(/\/$/, "")}/login`;
  const greeting = ownerName ? `Dear ${esc(ownerName)},` : "Dear Resident,";
  const subject = `Your QubecSense water portal login — Flat ${flat}`;

  const text = [
    greeting,
    "",
    `Your QubecSense water meter portal account for Flat ${flat} is ready.`,
    "",
    `   Login page : ${loginUrl}`,
    `   Username   : ${username}`,
    `   Password   : ${password}`,
    "",
    "For your security you will be asked to set your own password the first",
    "time you sign in. The password above works only once.",
    "",
    "You can then see your daily water usage, your bill, and your meter",
    "readings. Please keep these details private.",
    "",
    "A step-by-step guide (PDF) is attached to help you get started.",
    "",
    "If you did not expect this email, please contact the society office.",
    "",
    "— QubecSense",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
      <tr><td style="background:#0369a1;padding:20px 24px">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">QubecSense</span>
        <span style="color:#bae6fd;font-size:12px;display:block;letter-spacing:1px">WATER METER PORTAL</span>
      </td></tr>
      <tr><td style="padding:24px">
        <p style="margin:0 0 12px">${greeting}</p>
        <p style="margin:0 0 16px">Your water meter portal account for <strong>Flat ${esc(flat)}</strong> is ready. Use the details below to sign in.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 16px">
          <tr><td style="padding:14px 16px">
            <p style="margin:0 0 8px;font-size:13px;color:#64748b">Login page</p>
            <p style="margin:0 0 14px"><a href="${loginUrl}" style="color:#0369a1;font-weight:600;text-decoration:none">${loginUrl}</a></p>
            <p style="margin:0 0 4px;font-size:13px;color:#64748b">Username</p>
            <p style="margin:0 0 14px;font-size:16px;font-weight:600">${esc(username)}</p>
            <p style="margin:0 0 4px;font-size:13px;color:#64748b">Temporary password</p>
            <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:1px;font-family:Consolas,monospace">${esc(password)}</p>
          </td></tr>
        </table>
        <div style="background:#fff7ed;border-left:4px solid #f59e0b;padding:10px 14px;border-radius:0 6px 6px 0;margin:0 0 16px;font-size:14px">
          You will be asked to <strong>set your own password</strong> the first time you sign in. This temporary password works only once.
        </div>
        <p style="margin:0 0 16px;font-size:14px;color:#475569">Once signed in you can see your daily water usage, your bill and your meter readings. Please keep these details private.</p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569">📄 A step-by-step <strong>guide is attached</strong> (PDF) to help you get started.</p>
        <div style="text-align:center;margin:0 0 8px">
          <a href="${loginUrl}" style="display:inline-block;background:#0369a1;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600">Sign in</a>
        </div>
      </td></tr>
      <tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc">
        <p style="margin:0;font-size:12px;color:#94a3b8">If you did not expect this email, please contact your society office. — QubecSense · Rosalyn-21</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return { subject, text, html };
}

function makeTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.");
  }
  const port = Number(SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The resident guide PDF, attached to every email when present.
const GUIDE_PATH = join(__dirname, "..", "QubecSense-Resident-Guide.pdf");
function guideAttachments() {
  if (!existsSync(GUIDE_PATH)) return [];
  return [
    {
      filename: "QubecSense-Resident-Guide.pdf",
      path: GUIDE_PATH,
      contentType: "application/pdf",
    },
  ];
}

async function main() {
  const pwLen = Math.max(8, parseInt(RESIDENT_PASSWORD_LENGTH, 10) || 10);

  // --- Test mode: one sample email, no database writes ---
  if (testEmail) {
    console.log(`→ Sending ONE sample email to ${testEmail} …`);
    const transporter = makeTransport();
    await transporter.verify();
    const sample = buildEmail({
      ownerName: "Sample Resident",
      flat: "101",
      username: "rosalyn_101",
      password: randomPassword(pwLen),
    });
    const attachments = guideAttachments();
    if (!attachments.length) {
      console.warn("  ! Guide PDF not found — run `npm run guide` first to attach it.");
    }
    const info = await transporter.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to: testEmail,
      subject: sample.subject,
      text: sample.text,
      html: sample.html,
      attachments,
    });
    console.log(`✓ Sent${attachments.length ? " with guide attached" : ""}. messageId=${info.messageId}`);
    console.log(`  accepted: ${JSON.stringify(info.accepted)}  rejected: ${JSON.stringify(info.rejected)}`);
    return;
  }

  console.log("→ Connecting to MongoDB…");
  await mongoose.connect(MONGODB_URI);

  const filter = { role: "resident" };
  if (onlyFlats) filter.flatNumber = { $in: onlyFlats };
  else if (!all) filter.mustChangePassword = true; // only those who haven't set their own

  const residents = await User.find(filter).sort({ flatNumber: 1 });
  const flats = await Flat.find({}, { flatNumber: 1, ownerName: 1, ownerEmail: 1 }).lean();
  const flatByNumber = new Map(flats.map((f) => [String(f.flatNumber), f]));

  const targets = residents.map((r) => {
    const f = flatByNumber.get(String(r.flatNumber));
    return { user: r, email: (f?.ownerEmail || r.email || "").trim(), ownerName: f?.ownerName || r.name };
  });
  const withEmail = targets.filter((t) => t.email);
  const noEmail = targets.filter((t) => !t.email);

  console.log(`\nResident accounts matched: ${targets.length}`);
  console.log(`  have an email:  ${withEmail.length}`);
  console.log(`  NO email:       ${noEmail.length}${noEmail.length ? " (will be skipped)" : ""}`);
  if (noEmail.length) {
    console.log("    " + noEmail.map((t) => `flat ${t.user.flatNumber}`).join(", "));
  }

  if (!send) {
    console.log("\nDRY RUN — nothing sent, no passwords changed.");
    console.log("Sample of who would be emailed:");
    withEmail.slice(0, 8).forEach((t) => console.log(`  flat ${t.user.flatNumber}  ${t.user.username}  -> ${t.email}`));
    console.log("\nRe-run with --send to issue new passwords and email them.");
    await mongoose.disconnect();
    return;
  }

  // --- Real send ---
  const transporter = makeTransport();
  await transporter.verify();
  const attachments = guideAttachments();
  console.log(
    `\n✓ SMTP connection ok. Sending ${withEmail.length} email(s)` +
      `${attachments.length ? " with the guide PDF attached" : " (guide PDF NOT found — sending without it)"}` +
      `, ~${THROTTLE_MS}ms apart…\n`
  );

  const results = [];
  for (const t of withEmail) {
    const password = randomPassword(pwLen);
    try {
      // Issue the new password first, so we never email a password that
      // isn't actually set.
      t.user.passwordHash = await bcrypt.hash(password, 10);
      t.user.mustChangePassword = true;
      await t.user.save();

      const mail = buildEmail({
        ownerName: t.ownerName,
        flat: t.user.flatNumber,
        username: t.user.username,
        password,
      });
      const info = await transporter.sendMail({
        from: MAIL_FROM || SMTP_USER,
        to: t.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        attachments,
      });
      const ok = info.accepted?.includes(t.email);
      results.push({ flat: t.user.flatNumber, email: t.email, status: ok ? "sent" : "unknown", id: info.messageId });
      console.log(`  ✓ flat ${t.user.flatNumber} -> ${t.email}`);
    } catch (err) {
      results.push({ flat: t.user.flatNumber, email: t.email, status: "FAILED", error: err.message });
      console.log(`  ✗ flat ${t.user.flatNumber} -> ${t.email}  (${err.message})`);
    }
    await sleep(THROTTLE_MS);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const csv = join(__dirname, "..", `email-credentials-log-${stamp}.csv`);
  writeFileSync(
    csv,
    "Flat,Email,Status,Detail\n" +
      results
        .map((r) => `"${r.flat}","${r.email}","${r.status}","${(r.error || r.id || "").replace(/"/g, '""')}"`)
        .join("\n") +
      "\n",
    "utf8"
  );

  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "FAILED").length;
  console.log(`\n✓ Done. ${sent} sent, ${failed} failed, ${noEmail.length} skipped (no email).`);
  console.log(`  Log written to: ${csv}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("✗ Failed:", err.message);
  process.exit(1);
});
