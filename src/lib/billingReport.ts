// Server-only: builds the per-flat billing report, and freezes closed months
// into BillingSnapshot so they aren't recalculated (and re-fetched from the
// upstream meter API) on every view. Only the current — or not-yet-settled —
// month is computed live.

import type { Types } from "mongoose";
import { connectDB } from "./db";
import { Flat } from "./models/Flat";
import { BillingSnapshot } from "./models/BillingSnapshot";
import type { LiveDataCreds } from "./liveData";
import {
  fetchDailySeries,
  fetchFlatRange,
  hasReading,
} from "./flatConsumption";
import {
  STANDARD_TARIFF,
  applySlabs,
  daysBetweenInclusive,
  estimateFlatConsumption,
  finalizeDate,
  isPeriodSettled,
  resolveFlatConsumption,
  standardSlabs,
} from "./billing";

// A same-month-average estimate needs one upstream call per day in the
// period (see fetchDailySeries — the daily endpoint has no range variant).
// Capped well above any real billing cycle so a huge custom range can't
// turn one report into 100+ calls; beyond this, incomplete rows just show
// without an estimate.
const MAX_ESTIMATE_DAYS = 62;

export interface BuildReportInput {
  siteId: Types.ObjectId;
  project: string | null;
  building: string | null;
  period: "cycle" | "range";
  from: string;
  to: string;
  month: string | null;
  cycle: { from: string; to: string; startDay: number } | null;
  billingCycleStartDay: number;
  creds: LiveDataCreds;
}

/**
 * Compute the report from live meter data. Priced from totalizer deltas
 * (fetchFlatRange) — the same authoritative source Consumption uses — rather
 * than the intraday sums the live meter table shows, so a bill is never a
 * rounding artifact of how packets happened to bucket through the day.
 */
export async function buildBillingReport(input: BuildReportInput) {
  const { siteId, from, to, month, cycle, creds } = input;

  // Slab 1's allowance is 360 L × the days in the billed period, so the
  // slabs are derived per period (a calendar month → 28/29/30/31 days).
  const totalDays = daysBetweenInclusive(from, to);
  const slabs = standardSlabs(totalDays);
  const fixedCharge: number = STANDARD_TARIFF.fixedCharge;

  const consumption = await fetchFlatRange({ from, to }, creds);

  const rows = consumption.flats.map((f) => {
    const resolvedConsumption = resolveFlatConsumption(f.flat, f);
    const { breakdown, amount } = applySlabs(
      resolvedConsumption.litres,
      slabs,
      fixedCharge
    );
    return {
      flat: f.flat,
      ownerName: "",
      ownerPhone: "",
      ownerEmail: "",
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

  await overlayOwners(rows, siteId);

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

  return {
    period: input.period,
    month,
    from,
    to,
    cycle,
    project: input.project,
    building: input.building,
    generatedAt: new Date().toISOString(),
    tariff: {
      slabs,
      fixedCharge,
      billingCycleStartDay: input.billingCycleStartDay,
      configured: true,
      days: totalDays,
    },
    flatCount: rows.length,
    totalLitres,
    totalLitresExcluded: rows.length - withReading.length,
    totalAmount,
    incompleteCount,
    rows,
  };
}

export type BillingReport = Awaited<ReturnType<typeof buildBillingReport>>;

export type BillingReportResult = BillingReport & {
  /** "saved" = served from (or just written to) the frozen snapshot;
   *  "live" = computed just now. */
  source: "live" | "saved";
  savedAt?: string;
  /** For a live cycle report: the date its bills get frozen. */
  finalizesOn?: string;
};

/**
 * Owner names/contacts are deliberately NOT frozen with the bill: the money
 * figures are the record, but a corrected phone number or email should show
 * up on an old month too (and the email route reads the live address anyway).
 */
async function overlayOwners(
  rows: { flat: string; ownerName: string; ownerPhone: string; ownerEmail: string }[],
  siteId: Types.ObjectId
) {
  await connectDB();
  const flats = await Flat.find(
    { siteId },
    { flatNumber: 1, ownerName: 1, ownerPhone: 1, ownerEmail: 1 }
  ).lean();
  const byFlat = new Map((flats as any[]).map((f) => [String(f.flatNumber), f]));
  for (const r of rows) {
    const owner = byFlat.get(String(r.flat));
    if (!owner) continue;
    r.ownerName = owner.ownerName || "";
    r.ownerPhone = owner.ownerPhone || "";
    r.ownerEmail = owner.ownerEmail || "";
  }
}

/** Don't freeze a report that's basically empty — that's an upstream/config
 *  problem to look at, not a bill to keep. */
function worthSaving(report: BillingReport): boolean {
  return report.rows.length > 0 && report.totalLitresExcluded < report.rows.length;
}

/**
 * The report for a period. A cycle month that has settled is served from its
 * saved snapshot (no upstream calls at all) — built and saved on first
 * request, or when `refresh` asks to recalculate it. The current month, a
 * month still inside its settle window, and custom ranges are always live.
 */
export async function getBillingReport(
  input: BuildReportInput & { refresh?: boolean }
): Promise<BillingReportResult> {
  const month = input.period === "cycle" ? input.month : null;
  const settled = month != null && isPeriodSettled(input.to);

  if (month && settled && !input.refresh) {
    await connectDB();
    const snap: any = await BillingSnapshot.findOne({
      siteId: input.siteId,
      month,
    }).lean();
    if (snap && snap.from === input.from && snap.to === input.to) {
      const report = snap.report as BillingReport;
      await overlayOwners(report.rows, input.siteId);
      return {
        ...report,
        source: "saved",
        savedAt: new Date(snap.updatedAt).toISOString(),
      };
    }
  }

  const report = await buildBillingReport(input);

  if (month && settled && worthSaving(report)) {
    try {
      await connectDB();
      const saved: any = await BillingSnapshot.findOneAndUpdate(
        { siteId: input.siteId, month },
        { siteId: input.siteId, month, from: input.from, to: input.to, report },
        { upsert: true, new: true }
      ).lean();
      return {
        ...report,
        source: "saved",
        savedAt: new Date(saved.updatedAt).toISOString(),
      };
    } catch (err) {
      // Two first-views racing on the unique index, or the DB hiccuping:
      // the bill is still correct, it just isn't stored this time.
      console.error("billing snapshot save failed", err);
    }
  }

  return {
    ...report,
    source: "live",
    ...(month && !settled ? { finalizesOn: finalizeDate(input.to) } : {}),
  };
}
