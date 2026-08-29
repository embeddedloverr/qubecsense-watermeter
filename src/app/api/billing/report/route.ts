import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Tariff } from "@/lib/models/Tariff";
import { guard } from "@/lib/guard";
import {
  applySlabs,
  estimateFlatConsumption,
  resolveBillingPeriod,
  resolveFlatConsumption,
  type Slab,
} from "@/lib/billing";
import { LiveDataError, resolveSiteCreds } from "@/lib/liveData";
import { fetchDailySeries, fetchFlatRange, hasReading } from "@/lib/flatConsumption";

// A same-month-average estimate needs one upstream call per day in the
// period (see fetchDailySeries — the daily endpoint has no range variant).
// Capped well above any real billing cycle so a huge custom range can't
// turn one report into 100+ calls; beyond this, incomplete rows just show
// without an estimate.
const MAX_ESTIMATE_DAYS = 62;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/report?period=cycle&month=YYYY-MM
//   Recurring bill for a "billing month", resolved through the tariff's
//   billingCycleStartDay (day 1 = the ordinary calendar month).
// GET /api/billing/report?period=range&from=YYYY-MM-DD&to=YYYY-MM-DD
//   A one-off bill for exact dates, independent of the cycle setting.
//
// Priced from totalizer deltas (lib/flatConsumption.fetchFlatRange) — the
// same authoritative source Consumption uses — rather than the intraday sums
// the live meter table shows, so a bill is never a rounding artifact of how
// packets happened to bucket through the day. It also means every meter's
// totalizer readings, and any anomaly on them, come back for free instead of
// needing a second upstream call, and removes the old 92-day lookback limit
// that only ever existed because /api/v1/data windows by a rolling "days".
export async function GET(req: NextRequest) {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  const periodParam = req.nextUrl.searchParams.get("period");
  const period = periodParam === "range" ? "range" : "cycle";

  try {
    await connectDB();
    // The tariff is needed up front: slabs/fixedCharge for pricing, and for
    // cycle mode, billingCycleStartDay to even know which dates to fetch.
    const tariffDoc = await Tariff.findOne({
      key: "default",
      siteId: g.ctx.siteId,
    }).lean();
    const slabs: Slab[] = (tariffDoc as any)?.slabs || [];
    const fixedCharge: number = (tariffDoc as any)?.fixedCharge || 0;
    const billingCycleStartDay: number =
      (tariffDoc as any)?.billingCycleStartDay || 1;

    const resolved = resolveBillingPeriod(
      period,
      {
        month: req.nextUrl.searchParams.get("month"),
        from: req.nextUrl.searchParams.get("from"),
        to: req.nextUrl.searchParams.get("to"),
      },
      billingCycleStartDay
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    const { from, to, month, cycle } = resolved.period;

    const creds = await resolveSiteCreds(g.ctx.siteId);
    const consumption = await fetchFlatRange({ from, to }, creds);

    const flats = await Flat.find(
      { siteId: g.ctx.siteId },
      { flatNumber: 1, ownerName: 1, ownerPhone: 1, ownerEmail: 1 }
    ).lean();
    const ownerByFlat = new Map(
      (flats as any[]).map((f) => [String(f.flatNumber), f])
    );

    const rows = consumption.flats.map((f) => {
      const owner = ownerByFlat.get(String(f.flat));
      const resolvedConsumption = resolveFlatConsumption(f.flat, f);
      const { breakdown, amount } = applySlabs(
        resolvedConsumption.litres,
        slabs,
        fixedCharge
      );
      return {
        flat: f.flat,
        ownerName: owner?.ownerName || "",
        ownerPhone: owner?.ownerPhone || "",
        ownerEmail: owner?.ownerEmail || "",
        litres: resolvedConsumption.litres,
        complete: resolvedConsumption.complete,
        meters: resolvedConsumption.meters,
        overlapCorrectionPaused: resolvedConsumption.overlapCorrectionPaused,
        breakdown,
        fixedCharge,
        amount,
        estimatedLitres: null as number | null,
        estimatedAmount: null as number | null,
        estimatedMeters: [] as { deviceKey: string; litres: number; daysUsed: number }[],
        fullyEstimated: false,
      };
    });

    // Consumption total excludes flats with no real reading — folding a
    // false zero (no baseline, not measured) into the sum would silently
    // understate the true figure. The amount total does NOT exclude them:
    // the fixed charge still applies under the existing pricing rules, so
    // it reflects what will actually be invoiced.
    const withReading = rows.filter((r) => hasReading(r.meters));
    const totalLitres = withReading.reduce((a, r) => a + r.litres, 0);
    const totalAmount =
      Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
    const incompleteCount = rows.filter((r) => !r.complete).length;

    const totalDays =
      Math.round(
        (new Date(`${to}T00:00:00Z`).getTime() -
          new Date(`${from}T00:00:00Z`).getTime()) /
          86400000
      ) + 1;

    if (incompleteCount > 0 && totalDays <= MAX_ESTIMATE_DAYS) {
      try {
        const dailySeries = await fetchDailySeries(from, to, creds);
        for (const row of rows) {
          if (row.complete) continue;
          const est = estimateFlatConsumption(
            row,
            dailySeries,
            totalDays,
            slabs,
            fixedCharge
          );
          if (est) {
            row.estimatedLitres = est.litres;
            row.estimatedAmount = est.amount;
            row.estimatedMeters = est.meters;
            row.fullyEstimated = est.fullyEstimated;
          }
        }
      } catch (err) {
        // Non-fatal — the report still has real numbers, just no estimate.
        console.error("billing report: same-month estimate failed", err);
      }
    }

    return NextResponse.json({
      period,
      month,
      from,
      to,
      cycle,
      project: g.ctx.site.project || null,
      building: g.ctx.site.building || null,
      generatedAt: new Date().toISOString(),
      tariff: {
        slabs,
        fixedCharge,
        billingCycleStartDay,
        configured: slabs.length > 0,
      },
      flatCount: rows.length,
      totalLitres,
      totalLitresExcluded: rows.length - withReading.length,
      totalAmount,
      incompleteCount,
      rows,
    });
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
