import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Tariff } from "@/lib/models/Tariff";
import { guard } from "@/lib/guard";
import { resolveBillingPeriod } from "@/lib/billing";
import { LiveDataError, resolveSiteCreds } from "@/lib/liveData";
import { getBillingReport } from "@/lib/billingReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Guarded = Extract<Awaited<ReturnType<typeof guard>>, { ok: true }>;

async function respond(
  g: Guarded,
  period: "cycle" | "range",
  params: { month?: string | null; from?: string | null; to?: string | null },
  refresh: boolean
) {
  try {
    await connectDB();
    // The tariff itself is fixed (lib/billing STANDARD_TARIFF); the only
    // per-site setting left is which day of the month a billing cycle opens.
    const tariffDoc = await Tariff.findOne({
      key: "default",
      siteId: g.ctx.siteId,
    }).lean();
    const billingCycleStartDay: number =
      (tariffDoc as any)?.billingCycleStartDay || 1;

    const resolved = resolveBillingPeriod(period, params, billingCycleStartDay);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    const { from, to, month, cycle } = resolved.period;

    const creds = await resolveSiteCreds(g.ctx.siteId);
    const report = await getBillingReport({
      siteId: g.ctx.siteId,
      project: g.ctx.site.project || null,
      building: g.ctx.site.building || null,
      period,
      from,
      to,
      month,
      cycle,
      billingCycleStartDay,
      creds,
      refresh,
    });
    return NextResponse.json(report);
  } catch (err) {
    console.error("billing report error", err);
    return NextResponse.json(
      {
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not build the billing report.",
      },
      { status: 502 }
    );
  }
}

// GET /api/billing/report?period=cycle&month=YYYY-MM
//   Recurring bill for a "billing month", resolved through the tariff's
//   billingCycleStartDay (day 1 = the ordinary calendar month). Once the
//   month has settled it is served from its saved snapshot; the current
//   month is computed live.
// GET /api/billing/report?period=range&from=YYYY-MM-DD&to=YYYY-MM-DD
//   A one-off bill for exact dates, independent of the cycle setting.
//   Always live, never saved.
export async function GET(req: NextRequest) {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  const period =
    req.nextUrl.searchParams.get("period") === "range" ? "range" : "cycle";
  return respond(
    g,
    period,
    {
      month: req.nextUrl.searchParams.get("month"),
      from: req.nextUrl.searchParams.get("from"),
      to: req.nextUrl.searchParams.get("to"),
    },
    false
  );
}

// POST /api/billing/report  { month }
//   Recalculate a saved month from current meter data and replace its
//   snapshot — for when a meter's late readings arrived after the month was
//   frozen. An explicit admin action; a plain GET never overwrites a saved bill.
export async function POST(req: NextRequest) {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  let month: string | null = null;
  try {
    month = String((await req.json())?.month || "") || null;
  } catch {
    // fall through to the 400 below
  }
  if (!month) {
    return NextResponse.json({ error: "Pass { month: YYYY-MM }." }, { status: 400 });
  }
  return respond(g, "cycle", { month }, true);
}
