// Types and pure helpers for the flat-consumption API response shape.
//
// Deliberately split out of lib/flatConsumption.ts: that file imports from
// lib/liveData.ts for its server-only fetch functions, which in turn
// dynamically imports lib/crypto.ts (Node's `crypto`, unconditionally, at
// module scope). A client component importing ANYTHING from
// lib/flatConsumption.ts pulls that whole chain into the client bundle —
// `next build` tree-shakes around the never-invoked branch, but `next dev`
// does not, and fails to compile with "node:crypto is not handled by
// plugins". Keeping the client-safe pieces (types, labels, a pure
// predicate) in a module with no path back to liveData.ts avoids the
// problem entirely rather than relying on tree-shaking to hide it.

export interface MeterCorrection {
  subtractedFrom: { deviceKey: string; consumptionLitres: number }[];
  note: string;
}

export interface FlatConsumptionMeter {
  deviceId: string;
  deviceKey: string;
  location: string | null;
  totalizerStart: number | null;
  totalizerStartDate: string | null;
  totalizerEnd: number | null;
  totalizerEndDate: string | null;
  /** The meter's own uncorrected delta. Equal to consumptionLitres unless
   *  `correction` is set. */
  rawConsumptionLitres?: number | null;
  /** How much of rawConsumptionLitres was subtracted for shared plumbing.
   *  0 (or absent) for a meter with no correction rule. */
  overlapDeductionLitres?: number;
  /** Corrected value used in the flat's total — what actually gets billed.
   *  Equal to rawConsumptionLitres when there's no correction. */
  consumptionLitres: number | null;
  /** "no_reading_in_period" | "totalizer_decreased" |
   *  "overlap_correction_data_missing" | "overlap_deduction_exceeds_reading" | null */
  anomaly: string | null;
  /** Present only on a meter that shares plumbing with another flat's meter
   *  (a fixed, physical fact — see nudron-dashboard's
   *  METER_OVERLAP_CORRECTIONS) and whose reading was actually adjusted for
   *  it this period. */
  correction?: MeterCorrection | null;
}

export interface FlatConsumptionEntry {
  flat: string;
  consumptionLitres: number;
  complete: boolean;
  meters: FlatConsumptionMeter[];
  computedAt: string;
}

export interface FlatDailyEntry extends FlatConsumptionEntry {
  date: string;
}
export interface FlatMonthlyEntry extends FlatConsumptionEntry {
  month: string;
  isPartialMonth: boolean;
  latestDateUsed: string;
}

/** Human labels for the anomaly codes the upstream API returns. */
export const ANOMALY_LABEL: Record<string, string> = {
  no_reading_in_period: "No reading in period",
  totalizer_decreased: "Meter reset or replaced",
  // The other flat's meter (the one subtracted for shared plumbing) hasn't
  // reported for this period, so the correction can't be computed — the
  // uncorrected number would over-count, so this meter is withheld instead.
  overlap_correction_data_missing: "Shared-plumbing meter hasn't reported",
  // The subtraction went negative, which shouldn't happen under normal
  // operation (the affected reading should always include the subtracted
  // flow as a subset) — surfaced rather than silently clamped.
  overlap_deduction_exceeds_reading: "Shared-plumbing reading mismatch",
};

/** True if at least one meter produced a real number — as opposed to
 *  `consumptionLitres: 0` purely because every meter's delta was null (no
 *  baseline reading), which is "no data", not "zero usage". */
export function hasReading(meters: { consumptionLitres: number | null }[]): boolean {
  return meters.some((m) => m.consumptionLitres !== null);
}
