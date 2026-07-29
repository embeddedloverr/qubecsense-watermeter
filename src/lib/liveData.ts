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

/**
 * Credentials for a site.
 *
 * Falls back to the env credentials ONLY while a single site exists — that is
 * what let the original site keep working before its key was entered in the
 * superadmin UI. With two or more sites the fallback is refused: borrowing
 * another site's key would silently show its meters and bill residents for
 * someone else's water, with no error to notice.
 */
export async function resolveSiteCreds(
  siteId: string | { toString(): string }
): Promise<LiveDataCreds> {
  // Imported lazily so Edge/middleware never pulls Mongoose in transitively.
  const { connectDB } = await import("./db");
  const { Site } = await import("./models/Site");
  const { decryptSecret } = await import("./crypto");

  await connectDB();
  const site = await Site.findById(String(siteId))
    .select("+dataApiKey dataApiUrl name")
    .lean<{ dataApiUrl?: string; dataApiKey?: string; name?: string }>();

  if (site?.dataApiUrl && site?.dataApiKey) {
    return {
      baseUrl: site.dataApiUrl,
      apiKey: decryptSecret(site.dataApiKey),
    };
  }

  const named = site?.name || String(siteId);
  const fallback = envCreds();
  if (!fallback) {
    throw new LiveDataError(
      `No meter-data credentials for ${named}. Add them in the site's settings.`
    );
  }

  const siteCount = await Site.estimatedDocumentCount();
  if (siteCount > 1) {
    throw new LiveDataError(
      `${named} has no meter-data credentials of its own. Add them in the site's settings — ` +
        `the shared fallback is only used when there is a single site, so it is not applied here.`
    );
  }

  return fallback;
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
