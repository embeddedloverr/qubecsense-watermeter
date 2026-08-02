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

export interface FlatConsumptionMeter {
  deviceId: string;
  deviceKey: string;
  location: string | null;
  totalizerStart: number | null;
  totalizerStartDate: string | null;
  totalizerEnd: number | null;
  totalizerEndDate: string | null;
  consumptionLitres: number | null;
  /** "no_reading_in_period" | "totalizer_decreased" | null */
  anomaly: string | null;
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

/** Human labels for the anomaly codes the upstream API returns. Shared by
 *  Consumption and Billing so the wording can't drift between the two. */
export const ANOMALY_LABEL: Record<string, string> = {
  no_reading_in_period: "No reading in period",
  totalizer_decreased: "Meter reset or replaced",
};

/** True if at least one meter produced a real number — as opposed to
 *  `consumptionLitres: 0` purely because every meter's delta was null (no
 *  baseline reading), which is "no data", not "zero usage". */
export function hasReading(meters: { consumptionLitres: number | null }[]): boolean {
  return meters.some((m) => m.consumptionLitres !== null);
}
