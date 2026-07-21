import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { fetchLiveData, LiveDataError, type LiveMeter } from "@/lib/liveData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/live-data/silent?window=30
// Meters that reported at some point in the window but have gone quiet —
// i.e. their last reading is older than the newest day in the dataset.
// Catches flat batteries and connectivity failures, which are otherwise
// invisible because the data API only returns meters that reported.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const windowDays = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("window")) || 30, 2),
    92
  );

  try {
    const data = await fetchLiveData({ days: windowDays });
    const latest = data.range?.to || null;
    if (!latest) {
      return NextResponse.json({ latestDate: null, windowDays, silent: [] });
    }

    const lastSeenOf = (m: LiveMeter): string | null => {
      let last: string | null = null;
      for (const r of m.readings) if (!last || r.date > last) last = r.date;
      return last;
    };

    const daysBetween = (a: string, b: string) =>
      Math.round(
        (new Date(`${b}T00:00:00Z`).getTime() -
          new Date(`${a}T00:00:00Z`).getTime()) /
          86_400_000
      );

    const silent: {
      flat: string | null;
      deviceId: string;
      registrationId: string | null;
      location: string | null;
      lastSeen: string;
      daysSince: number;
    }[] = [];

    const consider = (flat: string | null, m: LiveMeter) => {
      const lastSeen = lastSeenOf(m);
      if (!lastSeen || lastSeen >= latest) return;
      silent.push({
        flat,
        deviceId: m.deviceId,
        registrationId: m.registrationId,
        location: m.location,
        lastSeen,
        daysSince: daysBetween(lastSeen, latest),
      });
    };

    for (const f of data.flats) for (const m of f.meters) consider(f.flat, m);
    for (const m of data.unassigned) consider(null, m);

    silent.sort((a, b) => b.daysSince - a.daysSince);

    // Attach owner names so the admin knows who to contact.
    try {
      await connectDB();
      const flats = await Flat.find({}, { flatNumber: 1, ownerName: 1, ownerPhone: 1 }).lean();
      const byNumber = new Map(
        (flats as any[]).map((f) => [String(f.flatNumber), f])
      );
      for (const s of silent as any[]) {
        const owner = s.flat ? byNumber.get(String(s.flat)) : null;
        s.ownerName = owner?.ownerName || "";
        s.ownerPhone = owner?.ownerPhone || "";
      }
    } catch (err) {
      console.error("silent meters owner join error", err);
    }

    return NextResponse.json({
      latestDate: latest,
      windowDays,
      reportingMeterCount: data.meterCount,
      silentCount: silent.length,
      silent,
    });
  } catch (err) {
    const message =
      err instanceof LiveDataError
        ? err.message
        : "Could not check for silent meters.";
    console.error("silent meters error", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
