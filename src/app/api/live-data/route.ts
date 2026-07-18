import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only proxy to the QubecSense live meter data API (nudron-dashboard).
// Keeps DATA_API_KEY on the server — the browser only ever talks to this route.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base = process.env.DATA_API_URL;
  const key = process.env.DATA_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      {
        error:
          "Live data API is not configured. Set DATA_API_URL and DATA_API_KEY in .env.",
      },
      { status: 503 }
    );
  }

  const url = new URL(base);
  for (const p of ["days", "date", "flat", "deviceId"]) {
    const v = req.nextUrl.searchParams.get(p);
    if (v) url.searchParams.set(p, v);
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: body?.error || `Live data API error (${res.status})` },
        { status: 502 }
      );
    }
    return NextResponse.json(body);
  } catch (err) {
    console.error("live-data proxy error", err);
    return NextResponse.json(
      { error: "Could not reach the live data API." },
      { status: 502 }
    );
  }
}
