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
