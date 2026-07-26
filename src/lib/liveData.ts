// Server-side fetch of the QubecSense live data API (nudron-dashboard).
// Keeps the DATA_API_KEY on the server. Used by the resident dashboard and
// could back the admin proxy too.

export interface LiveReading {
  date: string;
  index: number;
  consumptionLitres: number;
  totalizerLitres: number;
  intraday: number[];
  alerts: string[];
  status: string[];
  receivedAt: string | null;
}

export interface LiveMeter {
  deviceId: string;
  registrationId: string | null;
  location: string | null;
  totalConsumptionLitres: number;
  readings: LiveReading[];
}

export interface LiveFlat {
  flat: string;
  totalConsumptionLitres: number;
  consumptionByDate: Record<string, number>;
  meters: LiveMeter[];
}

export interface LiveData {
  project: string | null;
  building: string | null;
  generatedAt: string;
  range: { from: string | null; to: string | null; dates: string[] } | null;
  flatCount: number;
  meterCount: number;
  flats: LiveFlat[];
  unassigned: LiveMeter[];
}

export class LiveDataError extends Error {}

/** Upstream credentials. Per-site once sites exist; env is the fallback. */
export interface LiveDataCreds {
  baseUrl: string;
  apiKey: string;
}

/** Env-configured credentials, or null when unset. */
export function envCreds(): LiveDataCreds | null {
  const baseUrl = process.env.DATA_API_URL;
  const apiKey = process.env.DATA_API_KEY;
  return baseUrl && apiKey ? { baseUrl, apiKey } : null;
}

export async function fetchLiveData(
  opts: {
    days?: number;
    flat?: string;
    date?: string;
    deviceId?: string;
  },
  creds?: LiveDataCreds
): Promise<LiveData> {
  const resolved = creds ?? envCreds();
  if (!resolved) {
    throw new LiveDataError(
      "Live data API is not configured. Set DATA_API_URL and DATA_API_KEY in .env."
    );
  }
  const { baseUrl: base, apiKey: key } = resolved;

  const url = new URL(base);
  if (opts.days) url.searchParams.set("days", String(opts.days));
  if (opts.flat) url.searchParams.set("flat", opts.flat);
  if (opts.date) url.searchParams.set("date", opts.date);
  if (opts.deviceId) url.searchParams.set("deviceId", opts.deviceId);

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new LiveDataError(
      body?.error || `Live data API error (${res.status})`
    );
  }
  return body as LiveData;
}
