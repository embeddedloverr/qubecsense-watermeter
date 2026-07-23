import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Flat } from "@/lib/models/Flat";
import { fetchLiveData } from "@/lib/liveData";
import { sendMail, isMailConfigured } from "@/lib/mailer";
import {
  periodKey,
  periodLabel,
  periodNoun,
  usageInPeriod,
  type BudgetPeriod,
} from "@/lib/budget";

const litres = (n: number) => `${Math.round(n).toLocaleString("en-IN")} L`;

function alertEmail(opts: {
  ownerName: string;
  flat: string;
  period: BudgetPeriod;
  used: number;
  limit: number;
}) {
  const { ownerName, flat, period, used, limit } = opts;
  const appUrl = (process.env.APP_URL || "https://meters.qubecsense.com").replace(/\/$/, "");
  const label = periodLabel(period);
  const over = Math.max(0, used - limit);
  const greeting = ownerName ? `Dear ${ownerName},` : "Dear Resident,";
  const subject = `Water usage alert — Flat ${flat} has passed its ${periodNoun(period)}ly limit`;

  const text = [
    greeting,
    "",
    `Your water usage for Flat ${flat} ${label} has passed the limit you set.`,
    "",
    `   Limit  : ${litres(limit)}`,
    `   Used   : ${litres(used)}  (${litres(over)} over)`,
    "",
    `Sign in to see the details: ${appUrl}/login`,
    "",
    "You will get one alert per " + periodNoun(period) + " while over the limit.",
    "",
    "— QubecSense",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
    <table role="presentation" width="100%"><tr><td align="center">
      <table role="presentation" width="460" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <tr><td style="background:#b45309;padding:18px 24px">
          <span style="color:#fff;font-size:19px;font-weight:700">QubecSense</span>
          <span style="color:#fde68a;font-size:12px;display:block;letter-spacing:1px">WATER USAGE ALERT</span>
        </td></tr>
        <tr><td style="padding:24px">
          <p style="margin:0 0 12px">${greeting}</p>
          <p style="margin:0 0 16px">Your water usage for <strong>Flat ${flat}</strong> ${label} has passed the limit you set.</p>
          <table role="presentation" width="100%" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;margin:0 0 16px">
            <tr><td style="padding:14px 16px">
              <p style="margin:0 0 6px;font-size:13px;color:#92400e">Your limit</p>
              <p style="margin:0 0 12px;font-size:17px;font-weight:600">${litres(limit)}</p>
              <p style="margin:0 0 6px;font-size:13px;color:#92400e">Used ${label}</p>
              <p style="margin:0;font-size:22px;font-weight:700;color:#b45309">${litres(used)} <span style="font-size:13px;font-weight:500;color:#92400e">(${litres(over)} over)</span></p>
            </td></tr>
          </table>
          <div style="text-align:center">
            <a href="${appUrl}/login" style="display:inline-block;background:#0369a1;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600">View my usage</a>
          </div>
        </td></tr>
        <tr><td style="padding:12px 24px;border-top:1px solid #e2e8f0;background:#f8fafc">
          <p style="margin:0;font-size:12px;color:#94a3b8">You get one alert per ${periodNoun(period)} while over the limit. Change or turn off alerts from your dashboard. — QubecSense</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;

  return { subject, text, html };
}

export interface BudgetAlertResult {
  checked: number;
  overBudget: number;
  emailed: number;
  alreadyAlerted: number;
  noData: number;
  failed: number;
  details: {
    flat: string;
    used: number;
    limit: number;
    status: "emailed" | "already-alerted" | "under" | "no-data" | "no-email" | "failed";
  }[];
}

/**
 * Check every resident with an active budget and email those who have gone
 * over their limit this period and haven't been alerted for it yet.
 */
export async function runBudgetAlerts(now: Date = new Date()): Promise<BudgetAlertResult> {
  const result: BudgetAlertResult = {
    checked: 0,
    overBudget: 0,
    emailed: 0,
    alreadyAlerted: 0,
    noData: 0,
    failed: 0,
    details: [],
  };

  if (!isMailConfigured()) throw new Error("SMTP is not configured.");

  await connectDB();
  const residents = await User.find({
    role: "resident",
    active: { $ne: false },
    budgetEnabled: true,
    budgetLitres: { $gt: 0 },
  });
  if (!residents.length) return result;

  // One dataset covers everyone; 32 days spans the current week and month.
  const data = await fetchLiveData({ days: 32 });
  const readingsByFlat = new Map<string, { date: string; litres: number }[]>();
  for (const f of data.flats) {
    const rs: { date: string; litres: number }[] = [];
    for (const m of f.meters) {
      for (const r of m.readings) rs.push({ date: r.date, litres: r.consumptionLitres });
    }
    readingsByFlat.set(String(f.flat), rs);
  }

  const flats = await Flat.find({}, { flatNumber: 1, ownerName: 1, ownerEmail: 1 }).lean();
  const flatByNumber = new Map((flats as any[]).map((f) => [String(f.flatNumber), f]));

  for (const user of residents) {
    result.checked++;
    const flat = String(user.flatNumber || "");
    const period = (user.budgetPeriod as BudgetPeriod) || "monthly";
    const limit = user.budgetLitres || 0;
    const readings = readingsByFlat.get(flat);

    if (!readings || readings.length === 0) {
      result.noData++;
      result.details.push({ flat, used: 0, limit, status: "no-data" });
      continue;
    }

    const used = usageInPeriod(readings, period, now);
    if (used <= limit) {
      result.details.push({ flat, used, limit, status: "under" });
      continue;
    }

    result.overBudget++;
    const key = periodKey(period, now);
    if (user.budgetLastAlertKey === key) {
      result.alreadyAlerted++;
      result.details.push({ flat, used, limit, status: "already-alerted" });
      continue;
    }

    const flatDoc = flatByNumber.get(flat);
    const email = (flatDoc?.ownerEmail || user.email || "").trim();
    if (!email) {
      result.details.push({ flat, used, limit, status: "no-email" });
      continue;
    }

    try {
      const mail = alertEmail({
        ownerName: flatDoc?.ownerName || user.name,
        flat,
        period,
        used,
        limit,
      });
      await sendMail({ to: email, subject: mail.subject, text: mail.text, html: mail.html });
      user.budgetLastAlertKey = key;
      await user.save();
      result.emailed++;
      result.details.push({ flat, used, limit, status: "emailed" });
    } catch (err) {
      console.error(`budget alert send failed for flat ${flat}`, err);
      result.failed++;
      result.details.push({ flat, used, limit, status: "failed" });
    }
  }

  return result;
}
