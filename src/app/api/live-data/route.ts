import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { dismissedDeviceIdSet } from "@/lib/models/DismissedMeter";
import { guard } from "@/lib/guard";
import { fetchLiveData, LiveDataError, resolveSiteCreds } from "@/lib/liveData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only proxy to the QubecSense live meter data API (nudron-dashboard).
// Credentials stay on the server — the browser only ever talks to this route.
export async function GET(req: NextRequest) {
  const g = await guard("view_data");
  if (!g.ok) return g.res;

  const num = (p: string) => {
    const v = req.nextUrl.searchParams.get(p);
    return v ? Number(v) : undefined;
  };
  const str = (p: string) => req.nextUrl.searchParams.get(p) || undefined;

  try {
    const creds = await resolveSiteCreds(g.ctx.siteId);
    const body: any = await fetchLiveData(
      {
        days: num("days"),
        date: str("date"),
        flat: str("flat"),
        deviceId: str("deviceId"),
      },
      creds
    );

    // Enrich flats with owner details from our own database.
    if (Array.isArray(body?.flats) && body.flats.length) {
      try {
        await connectDB();
        const flats = await Flat.find(
          { siteId: g.ctx.siteId },
          { flatNumber: 1, ownerName: 1, ownerPhone: 1 }
        ).lean();
        const byNumber = new Map(
          (flats as any[]).map((f) => [String(f.flatNumber), f])
        );
        for (const f of body.flats) {
          const owner = byNumber.get(String(f.flat));
          f.ownerName = owner?.ownerName || "";
          f.ownerPhone = owner?.ownerPhone || "";
        }
      } catch (err) {
        // Owner names are a nice-to-have; still serve meter data if the DB is down.
        console.error("live-data owner join error", err);
      }
    }

    // Drop devices this site has dismissed from Unassigned (decommissioned/
    // replaced meters that keep showing up because they once reported
    // upstream but were never mapped to a flat) — meterCount comes down
    // with them so the KPI totals stay consistent with what's actually
    // listed.
    if (Array.isArray(body?.unassigned) && body.unassigned.length) {
      try {
        await connectDB();
        const dismissed = await dismissedDeviceIdSet(g.ctx.siteId);
        if (dismissed.size) {
          const before = body.unassigned.length;
          body.unassigned = body.unassigned.filter(
            (m: any) => !dismissed.has(m.deviceId)
          );
          const removed = before - body.unassigned.length;
          if (removed && typeof body.meterCount === "number") {
            body.meterCount -= removed;
          }
        }
      } catch (err) {
        console.error("live-data dismissed-filter error", err);
      }
    }

    return NextResponse.json(body);
  } catch (err) {
    console.error("live-data proxy error", err);
    return NextResponse.json(
      {
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not reach the live data API.",
      },
      { status: 502 }
    );
  }
}
