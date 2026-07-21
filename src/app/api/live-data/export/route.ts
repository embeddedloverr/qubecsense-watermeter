import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { fetchLiveData, LiveDataError } from "@/lib/liveData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const MAX_DAYS = 92; // upstream retention

// GET /api/live-data/export?from=YYYY-MM-DD&to=YYYY-MM-DD
// Compact per-flat → per-meter → per-day data for an arbitrary date range,
// used by the CSV (detailed) and PDF (summary) exports. Intraday buckets are
// stripped to keep the payload small.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from") || "";
  const to = req.nextUrl.searchParams.get("to") || "";
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  if (!isDate(from) || !isDate(to)) {
    return NextResponse.json(
      { error: "Pass ?from=YYYY-MM-DD&to=YYYY-MM-DD." },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: "The start date must be on or before the end date." },
      { status: 400 }
    );
  }

  // The upstream API only exposes the most recent `days`, so work out how far
  // back the requested window starts.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const daysBack = Math.floor((today.getTime() - fromMs) / DAY_MS) + 1;

  if (daysBack > MAX_DAYS) {
    return NextResponse.json(
      {
        error: `Readings are only available for about the last ${MAX_DAYS} days.`,
      },
      { status: 400 }
    );
  }
  if (daysBack < 1) {
    return NextResponse.json(
      { error: "That date range is in the future." },
      { status: 400 }
    );
  }

  try {
    const data = await fetchLiveData({
      days: Math.min(Math.max(daysBack, 1), MAX_DAYS),
    });

    await connectDB();
    const flatDocs = await Flat.find(
      {},
      { flatNumber: 1, ownerName: 1, ownerPhone: 1 }
    ).lean();
    const ownerByFlat = new Map(
      (flatDocs as any[]).map((f) => [String(f.flatNumber), f])
    );

    const inRange = (d: string) => d >= from && d <= to;
    const dates = new Set<string>();

    const shapeMeters = (meters: any[]) =>
      meters
        .map((m) => {
          const readings = (m.readings || [])
            .filter((r: any) => inRange(r.date))
            .map((r: any) => {
              dates.add(r.date);
              return {
                date: r.date,
                litres: r.consumptionLitres || 0,
                totalizer: r.totalizerLitres ?? null,
                alerts: r.alerts || [],
              };
            });
          return {
            deviceId: m.deviceId,
            location: m.location,
            total: readings.reduce((a: number, r: any) => a + r.litres, 0),
            readings,
          };
        })
        .filter((m) => m.readings.length > 0);

    const flats = data.flats
      .map((f) => {
        const meters = shapeMeters(f.meters);
        const owner = ownerByFlat.get(String(f.flat));
        return {
          flat: f.flat,
          ownerName: owner?.ownerName || "",
          ownerPhone: owner?.ownerPhone || "",
          total: meters.reduce((a, m) => a + m.total, 0),
          meters,
        };
      })
      .filter((f) => f.meters.length > 0)
      .sort((a, b) => {
        const na = parseInt(a.flat, 10);
        const nb = parseInt(b.flat, 10);
        if (Number.isNaN(na) || Number.isNaN(nb)) {
          return String(a.flat).localeCompare(String(b.flat));
        }
        return na - nb;
      });

    const unassigned = shapeMeters(data.unassigned);
    const sortedDates = [...dates].sort();

    return NextResponse.json({
      project: data.project,
      building: data.building,
      generatedAt: new Date().toISOString(),
      requested: { from, to },
      covered: {
        from: sortedDates[0] || null,
        to: sortedDates[sortedDates.length - 1] || null,
        days: sortedDates.length,
      },
      flatCount: flats.length,
      totalLitres:
        flats.reduce((a, f) => a + f.total, 0) +
        unassigned.reduce((a, m) => a + m.total, 0),
      flats,
      unassigned,
    });
  } catch (err) {
    const message =
      err instanceof LiveDataError
        ? err.message
        : "Could not build the export.";
    console.error("live data export error", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
