import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Flat } from "@/lib/models/Flat";
import { getSession } from "@/lib/auth";
import { sendMail, isMailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client sends selections in chunks so each request stays short and the
// UI can show real progress.
const MAX_PER_CALL = 20;
const DELAY_MS = 500;

const GUIDE_PATH = join(process.cwd(), "QubecSense-Resident-Guide.pdf");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const esc = (s: string) =>
  String(s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)
  );

function buildGuideEmail(ownerName: string, flat: string) {
  const appUrl = (process.env.APP_URL || "https://meters.qubecsense.com").replace(/\/$/, "");
  const loginUrl = `${appUrl}/login`;
  const greeting = ownerName ? `Dear ${esc(ownerName)},` : "Dear Resident,";
  const subject = `Your QubecSense water portal guide — Flat ${flat}`;

  const text = [
    greeting,
    "",
    `Attached is a step-by-step guide (PDF) to the QubecSense water meter portal for Flat ${flat}.`,
    "",
    "Getting started is simple:",
    `  1. Open ${loginUrl}`,
    "  2. Choose \"Email code\" — no password needed",
    "  3. Enter your username or this email address, and we'll email you a 6-digit sign-in code",
    "",
    "Once signed in you can see your daily water usage, your bill and your meter readings.",
    "",
    "If you have any questions, please contact the society office.",
    "",
    "— QubecSense",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%"><tr><td align="center">
    <table role="presentation" width="480" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
      <tr><td style="background:#0369a1;padding:20px 24px">
        <span style="color:#fff;font-size:20px;font-weight:700">QubecSense</span>
        <span style="color:#bae6fd;font-size:12px;display:block;letter-spacing:1px">WATER METER PORTAL</span>
      </td></tr>
      <tr><td style="padding:24px">
        <p style="margin:0 0 12px">${greeting}</p>
        <p style="margin:0 0 14px">Attached is a <strong>step-by-step guide (PDF)</strong> to the water meter portal for <strong>Flat ${esc(flat)}</strong>.</p>
        <p style="margin:0 0 8px;font-weight:600">Getting started is simple:</p>
        <ol style="margin:0 0 16px;padding-left:20px">
          <li style="margin-bottom:5px">Open <a href="${loginUrl}" style="color:#0369a1;font-weight:600">${loginUrl}</a></li>
          <li style="margin-bottom:5px">Choose <strong>Email code</strong> — no password needed</li>
          <li>Enter your username or this email address, and we'll send you a 6-digit sign-in code</li>
        </ol>
        <p style="margin:0 0 16px;font-size:14px;color:#475569">Once signed in you can see your daily water usage, your bill and your meter readings.</p>
        <div style="text-align:center;margin:0 0 8px">
          <a href="${loginUrl}" style="display:inline-block;background:#0369a1;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600">Open the portal</a>
        </div>
      </td></tr>
      <tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc">
        <p style="margin:0;font-size:12px;color:#94a3b8">Questions? Contact your society office. — QubecSense · Rosalyn-21</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return { subject, text, html };
}

// POST /api/residents/send-guide  { ids: string[] }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "SMTP is not configured on the server." },
      { status: 503 }
    );
  }
  if (!existsSync(GUIDE_PATH)) {
    return NextResponse.json(
      { error: "Guide PDF not found on the server. Run npm run guide first." },
      { status: 500 }
    );
  }

  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Pass { ids: [...] }." }, { status: 400 });
    }
    if (ids.length > MAX_PER_CALL) {
      return NextResponse.json(
        { error: `Send at most ${MAX_PER_CALL} per request.` },
        { status: 400 }
      );
    }

    await connectDB();
    const users = await User.find({
      _id: { $in: ids },
      role: "resident",
    }).lean();
    const flats = await Flat.find(
      { flatNumber: { $in: users.map((u: any) => u.flatNumber) } },
      { flatNumber: 1, ownerName: 1, ownerEmail: 1 }
    ).lean();
    const flatByNumber = new Map(
      (flats as any[]).map((f) => [String(f.flatNumber), f])
    );

    const guide = readFileSync(GUIDE_PATH);
    const attachments = [
      {
        filename: "QubecSense-Resident-Guide.pdf",
        content: guide,
        contentType: "application/pdf",
      },
    ];

    const results: {
      id: string;
      flat: string;
      email: string;
      status: "sent" | "no-email" | "failed";
      error?: string;
    }[] = [];

    for (const u of users as any[]) {
      const flat = flatByNumber.get(String(u.flatNumber));
      const email = (flat?.ownerEmail || u.email || "").trim();
      if (!email) {
        results.push({
          id: String(u._id),
          flat: u.flatNumber,
          email: "",
          status: "no-email",
        });
        continue;
      }
      try {
        const mail = buildGuideEmail(flat?.ownerName || u.name, u.flatNumber);
        await sendMail({
          to: email,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          attachments,
        });
        results.push({
          id: String(u._id),
          flat: u.flatNumber,
          email,
          status: "sent",
        });
      } catch (err: any) {
        results.push({
          id: String(u._id),
          flat: u.flatNumber,
          email,
          status: "failed",
          error: err?.message || "send failed",
        });
      }
      await sleep(DELAY_MS);
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("send guide error", err);
    return NextResponse.json(
      { error: "Could not send the guide." },
      { status: 500 }
    );
  }
}
