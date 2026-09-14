import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { LiveDataError, resolveSiteCreds } from "@/lib/liveData";
import { fetchFlatDailyRange } from "@/lib/flatConsumption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// GET /api/resident/daily-history?month=YYYY-MM
//
// Day-by-day consumption for the signed-in resident's OWN flat, for a
// chosen calendar month — scoped to session.flat, never a param, so a
// resident can only ever ask for their own days. Backs the "pick a month"
// daily chart on the resident dashboard; the default rolling 32-day daily
// chart on that page doesn't need this (it's fetched server-side once,
// up front), this is only for a month the admin/resident actually selects.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const flat = session.flat || "";
  if (!flat || !session.siteId) {
    return NextResponse.json({ error: "No flat on this account." }, { status: 400 });
  }

  const month = req.nextUrl.searchParams.get("month") || "";
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "Pass ?month=YYYY-MM." }, { status: 400 });
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const from = `${month}-01`;
  if (from > todayStr) {
    return NextResponse.json({ error: "That month is in the future." }, { status: 400 });
  }
  const [y, m] = month.split("-").map(Number);
  const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  // Never ask for days beyond today, for the current, still-running month.
  const to = lastDayOfMonth < todayStr ? lastDayOfMonth : todayStr;

  try {
    const creds = await resolveSiteCreds(session.siteId);
    const days = await fetchFlatDailyRange(flat, from, to, creds);
    return NextResponse.json({ month, from, to, days });
  } catch (err) {
    console.error("resident daily-history error", err);
    return NextResponse.json(
      {
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not load daily consumption for that month.",
      },
      { status: 502 }
    );
  }
}
