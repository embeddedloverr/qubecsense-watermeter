import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchLiveData, LiveDataError, resolveSiteCreds } from "@/lib/liveData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/resident/day-blocks?date=YYYY-MM-DD
//
// The signed-in resident's OWN flat, one day, split into the meters' intraday
// blocks (12 × 2 hours). Scoped to session.flat, never a param, so a resident
// can only ever read their own day. Backs "tap a day on the daily chart to
// see it in 2-hour blocks".
//
// The upstream keeps blocks for a rolling window of at most 92 days; a day
// older than that (or one with no reading yet, e.g. today) simply comes back
// with no meters and the UI says so.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const flat = session.flat || "";
  if (!flat || !session.siteId) {
    return NextResponse.json({ error: "No flat on this account." }, { status: 400 });
  }

  const date = req.nextUrl.searchParams.get("date") || "";
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Pass ?date=YYYY-MM-DD." }, { status: 400 });
  }
  if (date > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "That day is in the future." }, { status: 400 });
  }

  try {
    const creds = await resolveSiteCreds(session.siteId);
    const data = await fetchLiveData({ days: 92, date, flat }, creds);
    const mine = data.flats.find((f) => f.flat === flat);
    const meters = (mine?.meters || []).flatMap((m) =>
      m.readings
        .filter((r) => r.date === date)
        .map((r) => ({ location: m.location, intraday: r.intraday || [] }))
    );
    return NextResponse.json({ date, meters });
  } catch (err) {
    console.error("resident day-blocks error", err);
    return NextResponse.json(
      {
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not load that day's blocks.",
      },
      { status: 502 }
    );
  }
}
