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

export async function fetchLiveData(opts: {
  days?: number;
  flat?: string;
  date?: string;
  deviceId?: string;
}): Promise<LiveData> {
  const base = process.env.DATA_API_URL;
  const key = process.env.DATA_API_KEY;
  if (!base || !key) {
    throw new LiveDataError(
      "Live data API is not configured. Set DATA_API_URL and DATA_API_KEY in .env."
    );
  }

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
