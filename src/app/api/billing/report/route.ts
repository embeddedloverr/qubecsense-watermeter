import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Tariff } from "@/lib/models/Tariff";
import { guard } from "@/lib/guard";
import { applySlabs, billingCycleRange, type Slab } from "@/lib/billing";
import { LiveDataError, resolveSiteCreds } from "@/lib/liveData";
import { fetchFlatRange, hasReading } from "@/lib/flatConsumption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/billing/report?period=cycle&month=YYYY-MM
//   Recurring bill for a "billing month", resolved through the tariff's
//   billingCycleStartDay (day 1 = the ordinary calendar month).
// GET /api/billing/report?period=range&from=YYYY-MM-DD&to=YYYY-MM-DD
//   A one-off bill for exact dates, independent of the cycle setting.
//
// Priced from totalizer deltas (lib/flatConsumption.fetchFlatRange) — the
// same authoritative source Consumption uses — rather than the intraday sums
// the live meter table shows, so a bill is never a rounding artifact of how
// packets happened to bucket through the day. It also means every meter's
// totalizer readings, and any anomaly on them, come back for free instead of
// needing a second upstream call, and removes the old 92-day lookback limit
// that only ever existed because /api/v1/data windows by a rolling "days".
export async function GET(req: NextRequest) {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  const periodParam = req.nextUrl.searchParams.get("period");
  const period = periodParam === "range" ? "range" : "cycle";

  try {
    await connectDB();
    // The tariff is needed up front: slabs/fixedCharge for pricing, and for
    // cycle mode, billingCycleStartDay to even know which dates to fetch.
    const tariffDoc = await Tariff.findOne({
      key: "default",
      siteId: g.ctx.siteId,
    }).lean();
    const slabs: Slab[] = (tariffDoc as any)?.slabs || [];
    const fixedCharge: number = (tariffDoc as any)?.fixedCharge || 0;
    const billingCycleStartDay: number =
      (tariffDoc as any)?.billingCycleStartDay || 1;

    let from: string;
    let to: string;
    let month: string | null = null;
    let cycle: { from: string; to: string; startDay: number } | null = null;

    if (period === "range") {
      from = req.nextUrl.searchParams.get("from") || "";
      to = req.nextUrl.searchParams.get("to") || "";
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
        return NextResponse.json(
          { error: "Pass ?from= and ?to= as YYYY-MM-DD." },
          { status: 400 }
        );
      }
      if (from > to) {
        return NextResponse.json(
          { error: "from must be on or before to" },
          { status: 400 }
        );
      }
    } else {
      month = req.nextUrl.searchParams.get("month") || "";
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return NextResponse.json(
          { error: "Pass ?month=YYYY-MM." },
          { status: 400 }
        );
      }
      const range = billingCycleRange(month, billingCycleStartDay);
      from = range.from;
      to = range.to;
      cycle = { from, to, startDay: billingCycleStartDay };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (from > todayStr) {
      return NextResponse.json(
        {
          error:
            period === "range"
              ? "That range is in the future."
              : "That billing cycle is in the future.",
        },
        { status: 400 }
      );
    }

    const creds = await resolveSiteCreds(g.ctx.siteId);
    const consumption = await fetchFlatRange({ from, to }, creds);

    const flats = await Flat.find(
      { siteId: g.ctx.siteId },
      { flatNumber: 1, ownerName: 1, ownerPhone: 1, ownerEmail: 1 }
    ).lean();
    const ownerByFlat = new Map(
      (flats as any[]).map((f) => [String(f.flatNumber), f])
    );

    const rows = consumption.flats.map((f) => {
      const owner = ownerByFlat.get(String(f.flat));
      const { breakdown, amount } = applySlabs(
        f.consumptionLitres,
        slabs,
        fixedCharge
      );
      return {
        flat: f.flat,
        ownerName: owner?.ownerName || "",
        ownerPhone: owner?.ownerPhone || "",
        litres: f.consumptionLitres,
        complete: f.complete,
        meters: f.meters,
        breakdown,
        fixedCharge,
        amount,
      };
    });

    // Consumption total excludes flats with no real reading — folding a
    // false zero (no baseline, not measured) into the sum would silently
    // understate the true figure. The amount total does NOT exclude them:
    // the fixed charge still applies under the existing pricing rules, so
    // it reflects what will actually be invoiced.
    const withReading = rows.filter((r) => hasReading(r.meters));
    const totalLitres = withReading.reduce((a, r) => a + r.litres, 0);
    const totalAmount =
      Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
    const incompleteCount = rows.filter((r) => !r.complete).length;

    return NextResponse.json({
      period,
      month,
      from,
      to,
      cycle,
      project: g.ctx.site.project || null,
      building: g.ctx.site.building || null,
      generatedAt: new Date().toISOString(),
      tariff: {
        slabs,
        fixedCharge,
        billingCycleStartDay,
        configured: slabs.length > 0,
      },
      flatCount: rows.length,
      totalLitres,
      totalLitresExcluded: rows.length - withReading.length,
      totalAmount,
      incompleteCount,
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
