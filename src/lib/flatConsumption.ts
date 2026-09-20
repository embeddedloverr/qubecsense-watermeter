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
import { PAUSED_OVERLAP_CORRECTION_FLATS } from "./billing";
import type {
  FlatConsumptionEntry,
  FlatConsumptionMeter,
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

/** How many months back the monthly-history views (admin Residents panel,
 *  the resident's own monthly chart) look — one shared constant so they
 *  can't quietly drift apart. */
export const HISTORY_MONTHS = 6;

/** Calendar months as "YYYY-MM", oldest first, ending at the current month. */
export function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * One flat's consumption for each of `months`, one upstream call per month
 * in parallel — the shared way both the admin History panel and the
 * resident's own monthly chart pull the same several-months view. A month
 * that fails to fetch comes back with `entry: null` rather than throwing, so
 * one bad month doesn't blank the whole history.
 *
 * Deliberately built on flat-consumption/RANGE (what billing uses), not
 * /monthly: /monthly baselines each month at the 1st's closing reading, so
 * day 1's usage is silently dropped from every month (measured: the gap equals
 * day-1 usage for every flat, e.g. 744 L for flat 2305 in August). /range
 * baselines at the last reading BEFORE the month, so a month here equals the
 * bill and the sum of that month's daily values.
 */
export async function fetchMonthlyHistory(
  flat: string,
  months: string[],
  creds: LiveDataCreds
): Promise<
  { month: string; entry: FlatConsumptionEntry | null; isPartialMonth: boolean }[]
> {
  const today = new Date().toISOString().slice(0, 10);
  const spans = months.map((month) => {
    const [y, m] = month.split("-").map(Number);
    return {
      month,
      from: `${month}-01`,
      to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
    };
  });
  const fetched = await Promise.all(
    spans.map((s) =>
      fetchFlatRange({ from: s.from, to: s.to, flat }, creds).catch(() => null)
    )
  );
  return spans.map((s, i) => ({
    month: s.month,
    entry: fetched[i]?.flats.find((f) => f.flat === flat) || null,
    // A month whose last day hasn't finished (and reported) yet is still counting.
    isPartialMonth: s.to >= today,
  }));
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

/**
 * One flat's per-day, per-meter consumption across [from, to] — one
 * upstream call per day in parallel, scoped to a single flat via the daily
 * endpoint's own `flat` filter so the response (and this call's cost)
 * stays proportional to one flat, not the whole site. Used for a chosen
 * month's day-by-day chart, e.g. on a resident's own dashboard. A day that
 * fails to fetch comes back as an empty-meters entry rather than throwing.
 */
export async function fetchFlatDailyRange(
  flat: string,
  from: string,
  to: string,
  creds: LiveDataCreds
): Promise<{ date: string; meters: FlatConsumptionMeter[] }[]> {
  const dates = eachDateInclusive(from, to);
  const days = await Promise.all(
    dates.map((date) => fetchFlatDaily({ date, flat }, creds).catch(() => null))
  );
  // A flat whose shared-plumbing correction is paused for billing is billed
  // on RAW readings for the whole period, so every day here uses the raw
  // reading too. Upstream would otherwise withhold the days its correction
  // can't compute (chart near zero while the bill is ~12,000 L) and deduct
  // the shared water on the days it can (a total smaller than the bill).
  const paused = PAUSED_OVERLAP_CORRECTION_FLATS.includes(flat);
  return dates.map((date, i) => {
    const entry = days[i]?.flats.find((f) => f.flat === flat);
    const meters = entry?.meters || [];
    return {
      date,
      meters: paused
        ? meters.map((m) =>
            m.rawConsumptionLitres != null
              ? {
                  ...m,
                  consumptionLitres: m.rawConsumptionLitres,
                  anomaly: null,
                  correction: null,
                }
              : m
          )
        : meters,
    };
  });
}
