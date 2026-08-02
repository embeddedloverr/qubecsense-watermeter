import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Tariff } from "@/lib/models/Tariff";
import { guard } from "@/lib/guard";
import { applySlabs, billingCycleRange, type Slab } from "@/lib/billing";
import { fetchLiveData, LiveDataError, resolveSiteCreds } from "@/lib/liveData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/billing/report?month=YYYY-MM
// Pulls per-flat consumption for the billing cycle from the live data API,
// joins owner details from the flats collection, and prices it with the
// saved slab tariff. The cycle's exact date range depends on the tariff's
// billingCycleStartDay — day 1 (the default) is the ordinary calendar month,
// so this is a straight rename for every site that hasn't set one.
export async function GET(req: NextRequest) {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  const month = req.nextUrl.searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json(
      { error: "Pass ?month=YYYY-MM." },
      { status: 400 }
    );
  }

  try {
    await connectDB();
    // The cycle's start day has to be known before the date range — and
    // therefore the upstream day count — can be computed, so the tariff is
    // fetched first rather than alongside the live-data call.
    const tariffDoc = await Tariff.findOne({
      key: "default",
      siteId: g.ctx.siteId,
    }).lean();
    const slabs: Slab[] = (tariffDoc as any)?.slabs || [];
    const fixedCharge: number = (tariffDoc as any)?.fixedCharge || 0;
    const billingCycleStartDay: number =
      (tariffDoc as any)?.billingCycleStartDay || 1;

    const { from, to } = billingCycleRange(month, billingCycleStartDay);
    const today = new Date();
    const fromDate = new Date(`${from}T00:00:00Z`);

    // The upstream API serves at most the last 92 days, so cycles starting
    // earlier than that cannot be billed.
    const daysBack =
      Math.floor((today.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    if (daysBack > 92) {
      return NextResponse.json(
        { error: "Consumption data is only available for about the last 3 months." },
        { status: 400 }
      );
    }
    if (daysBack < 1) {
      return NextResponse.json(
        { error: "That billing cycle is in the future." },
        { status: 400 }
      );
    }

    const creds = await resolveSiteCreds(g.ctx.siteId);
    const data: any = await fetchLiveData(
      { days: Math.min(Math.max(daysBack, 1), 92) },
      creds
    );

    const flats = await Flat.find(
      { siteId: g.ctx.siteId },
      { flatNumber: 1, ownerName: 1, ownerPhone: 1, ownerEmail: 1 }
    ).lean();
    const ownerByFlat = new Map(
      (flats as any[]).map((f) => [String(f.flatNumber), f])
    );

    const cycleDates = new Set<string>();
    const rows = (data.flats || []).map((f: any) => {
      let litres = 0;
      const byMeter: { deviceId: string; location: string | null; litres: number }[] = [];
      for (const m of f.meters || []) {
        let meterLitres = 0;
        for (const r of m.readings || []) {
          if (typeof r.date === "string" && r.date >= from && r.date <= to) {
            meterLitres += r.consumptionLitres || 0;
            cycleDates.add(r.date);
          }
        }
        litres += meterLitres;
        byMeter.push({
          deviceId: m.deviceId,
          location: m.location,
          litres: meterLitres,
        });
      }
      const owner = ownerByFlat.get(String(f.flat));
      const { breakdown, amount } = applySlabs(litres, slabs, fixedCharge);
      return {
        flat: f.flat,
        ownerName: owner?.ownerName || "",
        ownerPhone: owner?.ownerPhone || "",
        litres,
        meters: byMeter,
        breakdown,
        fixedCharge,
        amount,
      };
    });

    const dates = [...cycleDates].sort();
    const totalLitres = rows.reduce((a: number, r: any) => a + r.litres, 0);
    const totalAmount =
      Math.round(rows.reduce((a: number, r: any) => a + r.amount, 0) * 100) / 100;

    return NextResponse.json({
      month,
      cycle: { from, to, startDay: billingCycleStartDay },
      project: data.project || null,
      building: data.building || null,
      generatedAt: new Date().toISOString(),
      coverage: { from: dates[0] || null, to: dates[dates.length - 1] || null, days: dates.length },
      tariff: { slabs, fixedCharge, billingCycleStartDay, configured: slabs.length > 0 },
      flatCount: rows.length,
      totalLitres,
      totalAmount,
      rows,
    });
  } catch (err) {
    console.error("billing report error", err);
    return NextResponse.json(
      {
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not build the billing report.",
      },
      { status: 502 }
    );
  }
}
