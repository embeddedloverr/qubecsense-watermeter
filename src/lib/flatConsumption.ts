// Server-side fetch of the nudron-dashboard flat-consumption API — the
// totalizer-delta based daily/monthly rollups, as opposed to the
// intraday-sum figures liveData.ts pulls for the live meter table.
//
// Shares credentials with liveData.ts (LiveDataCreds / resolveSiteCreds):
// Site.dataApiUrl points at /api/v1/data, and these endpoints are siblings
// on the same nudron-dashboard host, so the base is derived from that URL's
// origin rather than asking for a second URL in the site's settings.
//
// Server-only (imports liveData.ts, which reaches Node's `crypto` via a
// dynamic import). Client components must import types/ANOMALY_LABEL/
// hasReading from ./flatConsumptionTypes instead — see that file for why.

import { LiveDataError, type LiveDataCreds } from "./liveData";
import type {
  FlatConsumptionEntry,
  FlatDailyEntry,
  FlatMonthlyEntry,
} from "./flatConsumptionTypes";

export type {
  FlatConsumptionMeter,
  FlatConsumptionEntry,
  FlatDailyEntry,
  FlatMonthlyEntry,
} from "./flatConsumptionTypes";
export { ANOMALY_LABEL, hasReading } from "./flatConsumptionTypes";

function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    throw new LiveDataError("The site's meter-data URL is not valid.");
  }
}

async function callFlatConsumption<T>(
  path: string,
  params: Record<string, string | undefined>,
  creds: LiveDataCreds
): Promise<T> {
  const url = new URL(path, originOf(creds.baseUrl));
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": creds.apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new LiveDataError(
      body?.error || `Flat consumption API error (${res.status})`
    );
  }
  return body as T;
}

/** GET /api/v1/flat-consumption/daily — one day, per flat. */
export function fetchFlatDaily(
  opts: { date?: string; flat?: string },
  creds: LiveDataCreds
): Promise<{ date: string; flatCount: number; flats: FlatDailyEntry[] }> {
  return callFlatConsumption("/api/v1/flat-consumption/daily", opts, creds);
}

/** GET /api/v1/flat-consumption/monthly — one calendar month, per flat. */
export function fetchFlatMonthly(
  opts: { month?: string; flat?: string },
  creds: LiveDataCreds
): Promise<{ month: string; flatCount: number; flats: FlatMonthlyEntry[] }> {
  return callFlatConsumption("/api/v1/flat-consumption/monthly", opts, creds);
}

/** GET /api/v1/flat-consumption/range — an arbitrary date range, per flat. */
export function fetchFlatRange(
  opts: { from: string; to: string; flat?: string },
  creds: LiveDataCreds
): Promise<{
  from: string;
  to: string;
  flatCount: number;
  flats: (FlatConsumptionEntry & { from: string; to: string })[];
}> {
  return callFlatConsumption("/api/v1/flat-consumption/range", opts, creds);
}

function eachDateInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  while (cur <= end) {
    dates.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86400000;
  }
  return dates;
}

/**
 * Per-day, per-meter consumption across [from, to], as
 * Map<deviceKey, Map<date, litres>> — used to estimate a meter that came
 * back with no reading at all for the full-period range query, from
 * whatever daily data does exist elsewhere in the same period.
 *
 * The daily endpoint only takes a single date, not a range, so this fetches
 * one day at a time in parallel across every flat at once (rather than per
 * flat) — the report only needs this when some row is incomplete, and one
 * shared fetch covers all of them. A day that fails to fetch is silently
 * dropped rather than failing the whole series — an estimate built from
 * fewer days is still better than none.
 */
export async function fetchDailySeries(
  from: string,
  to: string,
  creds: LiveDataCreds
): Promise<Map<string, Map<string, number>>> {
  const dates = eachDateInclusive(from, to);
  const days = await Promise.all(
    dates.map((date) => fetchFlatDaily({ date }, creds).catch(() => null))
  );

  const series = new Map<string, Map<string, number>>();
  days.forEach((day, i) => {
    if (!day) return;
    for (const flatEntry of day.flats) {
      for (const m of flatEntry.meters) {
        if (m.consumptionLitres == null) continue;
        let byDate = series.get(m.deviceKey);
        if (!byDate) {
          byDate = new Map();
          series.set(m.deviceKey, byDate);
        }
        byDate.set(dates[i], m.consumptionLitres);
      }
    }
  });
  return series;
}
