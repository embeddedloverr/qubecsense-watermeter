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
