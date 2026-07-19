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
