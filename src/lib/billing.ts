// `import type` only — erased at compile time, so this file (imported both
// client-side for the lazy PDF share button and server-side in the billing
// routes) never actually pulls flatConsumptionTypes.ts's runtime code in.
import type { FlatConsumptionMeter } from "./flatConsumptionTypes";

/**
 * Flats whose shared-plumbing correction (see nudron-dashboard's
 * METER_OVERLAP_CORRECTIONS) is temporarily bypassed for BILLING purposes
 * only. Reason: the correction subtracts flat 101's/103's same-period
 * usage from these flats' affected meter, but 101/103 were only just fully
 * mapped and have almost no reading history yet — so the subtraction
 * routinely has nothing to subtract, and 301/201/203 show as `Incomplete`
 * far more often than their own meter's actual data would justify. Billing
 * them on the raw (uncorrected) reading in the meantime is imperfect —
 * it re-admits the very over-count the correction exists to remove — but
 * it's less wrong than "no bill at all" while 101/103 build up history.
 *
 * To re-enable the correction once 101/103 have a few weeks of data,
 * empty this array (or drop specific flats from it). Nothing else needs to
 * change — resolveBillingConsumption() falls straight back to nudron's own
 * corrected number the moment a flat isn't listed here.
 */
export const PAUSED_OVERLAP_CORRECTION_FLATS: readonly string[] = [
  "201",
  "203",
  "301",
];

export interface ResolvedFlatConsumption {
  litres: number;
  complete: boolean;
  meters: FlatConsumptionMeter[];
  /** True when this flat's number came from raw readings because its
   *  shared-plumbing correction is paused (see
   *  PAUSED_OVERLAP_CORRECTION_FLATS), not from nudron's corrected value. */
  overlapCorrectionPaused: boolean;
}

const OVERLAP_ANOMALIES = new Set([
  "overlap_correction_data_missing",
  "overlap_deduction_exceeds_reading",
]);

/**
 * The litres/complete/meters a flat is actually billed on — nudron's own
 * corrected figure normally, or a raw-reading recomputation for a paused
 * flat.
 *
 * For a paused flat, this rewrites each overlap-anomalous meter's own
 * `consumptionLitres` to its raw value (anomaly/correction cleared) rather
 * than only adjusting the flat-level total. That's deliberate: `hasReading`,
 * `isOverAllowance`, the CSV/PDF exports, and the table's "No data" check
 * all key off `meters[].consumptionLitres` — leaving it null while
 * separately overriding the flat's litres would show "No data" right next
 * to a real, computed amount, which is exactly the kind of mismatch this
 * app has spent effort elsewhere explaining away, not one worth introducing
 * fresh here. `overlapCorrectionPaused` is the one flag a UI needs to say
 * "this number is raw, not nudron's corrected figure" without re-deriving
 * it per meter.
 */
export function resolveFlatConsumption(
  flat: string,
  entry: {
    consumptionLitres: number;
    complete: boolean;
    meters: FlatConsumptionMeter[];
  }
): ResolvedFlatConsumption {
  if (!PAUSED_OVERLAP_CORRECTION_FLATS.includes(flat)) {
    return {
      litres: entry.consumptionLitres,
      complete: entry.complete,
      meters: entry.meters,
      overlapCorrectionPaused: false,
    };
  }

  let litres = 0;
  let complete = true;
  const meters = entry.meters.map((m) => {
    // A meter anomalous ONLY because the correction couldn't be computed
    // (its own raw reading is fine) falls back to that raw reading. Any
    // other anomaly (no_reading_in_period, totalizer_decreased) means
    // there's genuinely no usable number, paused or not.
    if (m.anomaly && OVERLAP_ANOMALIES.has(m.anomaly)) {
      if (m.rawConsumptionLitres == null) {
        complete = false;
        return m; // nothing to fall back to — leave the real anomaly visible
      }
      litres += m.rawConsumptionLitres;
      return { ...m, consumptionLitres: m.rawConsumptionLitres, anomaly: null, correction: null };
    }
    if (m.consumptionLitres != null) litres += m.consumptionLitres;
    else complete = false;
    return m;
  });

  return { litres, complete, meters, overlapCorrectionPaused: true };
}

export interface MeterEstimate {
  deviceKey: string;
  litres: number;
  daysUsed: number;
}

export interface EstimatedConsumption {
  litres: number;
  amount: number;
  meters: MeterEstimate[];
  /** True only when every meter missing a reading got an estimate — a row
   *  can still be partially estimated if some other meter had zero days of
   *  data anywhere in the period to average from. */
  fullyEstimated: boolean;
}

/**
 * Fill in a flat's meters that have no reading at all for the billed period
 * using that SAME meter's own average daily usage on whatever days within
 * the SAME period it did report — scaled up to the full period length.
 * Deliberately doesn't reach into other months or other meters: it's a
 * best-guess placeholder shown alongside the real (incomplete) bill, not a
 * substitute for one, so it only uses data that's actually about this meter
 * in this billing period.
 *
 * Returns null when there's nothing to estimate (the flat is already
 * complete) or nothing CAN be estimated (a missing meter has zero days of
 * data anywhere in the period — e.g. it was down the entire month).
 */
export function estimateFlatConsumption(
  resolved: { complete: boolean; meters: FlatConsumptionMeter[] },
  dailySeries: Map<string, Map<string, number>>,
  totalDaysInPeriod: number,
  slabs: Slab[],
  fixedCharge: number
): EstimatedConsumption | null {
  if (resolved.complete) return null;

  const missing = resolved.meters.filter((m) => m.consumptionLitres == null);
  if (missing.length === 0) return null;

  let litres = resolved.meters.reduce((a, m) => a + (m.consumptionLitres ?? 0), 0);
  const meters: MeterEstimate[] = [];
  let fullyEstimated = true;

  for (const m of missing) {
    const days = dailySeries.get(m.deviceKey);
    if (!days || days.size === 0) {
      fullyEstimated = false;
      continue;
    }
    const values = Array.from(days.values());
    const avgPerDay = values.reduce((a, v) => a + v, 0) / values.length;
    const estLitres = avgPerDay * totalDaysInPeriod;
    litres += estLitres;
    meters.push({ deviceKey: m.deviceKey, litres: estLitres, daysUsed: values.length });
  }

  if (meters.length === 0) return null;

  const { amount } = applySlabs(litres, slabs, fixedCharge);
  return { litres, amount, meters, fullyEstimated };
}

/**
 * Resolve a "billing month" + cycle start day into the actual [from, to]
 * calendar dates the bill covers (both inclusive, YYYY-MM-DD).
 *
 * `startDay` names the day of the month a cycle OPENS. Day 1 is the ordinary
 * calendar month — the default, and what every existing tariff already has.
 * Any other day D means "August"'s cycle runs from Aug D through (D-1) of
 * September: the label still names the month the cycle starts in, matching
 * how a society talks about "August's bill" even though it closes in
 * September.
 *
 * Capped at day 28 (not enforced here, but by callers/validation) so every
 * month — including February — has that day, and a cycle's length never
 * silently shifts between months.
 */
export function billingCycleRange(
  month: string,
  startDay: number
): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number); // m is 1-indexed
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const from = new Date(Date.UTC(y, m - 1, startDay));
  const to =
    startDay === 1
      ? new Date(Date.UTC(y, m, 0)) // last day of this same month
      : new Date(Date.UTC(y, m, startDay - 1)); // day before startDay, next month
  return { from: fmt(from), to: fmt(to) };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface BillingPeriod {
  from: string;
  to: string;
  month: string | null;
  cycle: { from: string; to: string; startDay: number } | null;
}

/**
 * Resolve `?period=cycle&month=` or `?period=range&from=&to=` into the actual
 * date span to bill, with the same validation both billing routes need
 * (date shape, from<=to, not in the future). Shared so /api/billing/report
 * and /api/billing/send can't drift on what a given request means.
 */
export function resolveBillingPeriod(
  period: "cycle" | "range",
  params: { month?: string | null; from?: string | null; to?: string | null },
  billingCycleStartDay: number
): { ok: true; period: BillingPeriod } | { ok: false; error: string } {
  let from: string;
  let to: string;
  let month: string | null = null;
  let cycle: BillingPeriod["cycle"] = null;

  if (period === "range") {
    from = params.from || "";
    to = params.to || "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return { ok: false, error: "Pass ?from= and ?to= as YYYY-MM-DD." };
    }
    if (from > to) {
      return { ok: false, error: "from must be on or before to" };
    }
  } else {
    month = params.month || "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return { ok: false, error: "Pass ?month=YYYY-MM." };
    }
    const range = billingCycleRange(month, billingCycleStartDay);
    from = range.from;
    to = range.to;
    cycle = { from, to, startDay: billingCycleStartDay };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  if (from > todayStr) {
    return {
      ok: false,
      error:
        period === "range"
          ? "That range is in the future."
          : "That billing cycle is in the future.",
    };
  }

  return { ok: true, period: { from, to, month, cycle } };
}

export interface Slab {
  limitLitres: number | null;
  ratePerKl: number;
}

export interface SlabCharge {
  litres: number;
  ratePerKl: number;
  amount: number;
}

/**
 * Split a flat's consumption across tariff slabs and price each portion.
 * Slabs carry cumulative upper bounds in litres (null = unbounded top slab);
 * rates are ₹ per kilolitre.
 */
export function applySlabs(
  litres: number,
  slabs: Slab[],
  fixedCharge: number
): { breakdown: SlabCharge[]; amount: number } {
  const breakdown: SlabCharge[] = [];
  let remaining = Math.max(0, litres);
  let prevLimit = 0;

  for (const slab of slabs) {
    if (remaining <= 0) break;
    const capacity =
      slab.limitLitres === null ? Infinity : slab.limitLitres - prevLimit;
    if (capacity <= 0) continue;
    const inSlab = Math.min(remaining, capacity);
    breakdown.push({
      litres: inSlab,
      ratePerKl: slab.ratePerKl,
      amount: (inSlab / 1000) * slab.ratePerKl,
    });
    remaining -= inSlab;
    if (slab.limitLitres !== null) prevLimit = slab.limitLitres;
  }

  const amount =
    breakdown.reduce((a, b) => a + b.amount, 0) + Math.max(0, fixedCharge);
  return { breakdown, amount: Math.round(amount * 100) / 100 };
}

/** Validate a slab list: rates ≥ 0, limits positive and strictly increasing, only the last slab may be unbounded. */
export function validateSlabs(slabs: Slab[]): string | null {
  if (!Array.isArray(slabs) || slabs.length === 0) {
    return "Add at least one slab.";
  }
  let prev = 0;
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i];
    if (typeof s.ratePerKl !== "number" || s.ratePerKl < 0 || !Number.isFinite(s.ratePerKl)) {
      return `Slab ${i + 1}: rate must be a number ≥ 0.`;
    }
    const isLast = i === slabs.length - 1;
    if (s.limitLitres === null) {
      if (!isLast) return `Slab ${i + 1}: only the last slab can be open-ended.`;
      continue;
    }
    if (typeof s.limitLitres !== "number" || !Number.isFinite(s.limitLitres) || s.limitLitres <= prev) {
      return `Slab ${i + 1}: limit must be greater than ${prev.toLocaleString("en-IN")} L.`;
    }
    prev = s.limitLitres;
  }
  return null;
}
