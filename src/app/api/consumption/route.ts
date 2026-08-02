import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { guard } from "@/lib/guard";
import { resolveSiteCreds } from "@/lib/liveData";
import { LiveDataError } from "@/lib/liveData";
import { fetchFlatDaily, fetchFlatMonthly, fetchFlatRange } from "@/lib/flatConsumption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Admin-only proxy to nudron-dashboard's flat-consumption API (totalizer
// deltas, not the intraday sums /api/live-data uses). Credentials stay on
// the server, same as /api/live-data.
//
// GET /api/consumption?period=daily&date=YYYY-MM-DD
// GET /api/consumption?period=monthly&month=YYYY-MM
// GET /api/consumption?period=range&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const g = await guard("view_data");
  if (!g.ok) return g.res;

  const periodParam = req.nextUrl.searchParams.get("period");
  const period =
    periodParam === "monthly" ? "monthly" : periodParam === "range" ? "range" : "daily";
  const date = req.nextUrl.searchParams.get("date") || undefined;
  const month = req.nextUrl.searchParams.get("month") || undefined;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;

  if (period === "range") {
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      return NextResponse.json(
        { error: "from and to are required as YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (from > to) {
      return NextResponse.json(
        { error: "from must be on or before to" },
        { status: 400 }
      );
    }
  }

  try {
    const creds = await resolveSiteCreds(g.ctx.siteId);
    const body =
      period === "monthly"
        ? await fetchFlatMonthly({ month }, creds)
        : period === "range"
          ? await fetchFlatRange({ from: from!, to: to! }, creds)
          : await fetchFlatDaily({ date }, creds);

    // Enrich with owner details, same join live-data does.
    let ownerByFlat = new Map<string, { ownerName: string; ownerPhone: string }>();
    try {
      await connectDB();
      const flats = await Flat.find(
        { siteId: g.ctx.siteId },
        { flatNumber: 1, ownerName: 1, ownerPhone: 1 }
      ).lean();
      ownerByFlat = new Map(
        (flats as any[]).map((f) => [
          String(f.flatNumber),
          { ownerName: f.ownerName || "", ownerPhone: f.ownerPhone || "" },
        ])
      );
    } catch (err) {
      console.error("consumption owner join error", err);
    }

    const enriched = body.flats.map((f: any) => ({
      ...f,
      ownerName: ownerByFlat.get(String(f.flat))?.ownerName || "",
      ownerPhone: ownerByFlat.get(String(f.flat))?.ownerPhone || "",
    }));

    return NextResponse.json({ ...body, flats: enriched });
  } catch (err) {
    console.error("consumption proxy error", err);
    return NextResponse.json(
      {
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not reach the consumption API.",
      },
      { status: 502 }
    );
  }
}
