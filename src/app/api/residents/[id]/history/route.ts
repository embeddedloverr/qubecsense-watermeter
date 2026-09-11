import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { guard } from "@/lib/guard";
import { LiveDataError, resolveSiteCreds } from "@/lib/liveData";
import { fetchFlatMonthly } from "@/lib/flatConsumption";
import { resolveFlatConsumption } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTHS_BACK = 6;

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// GET /api/residents/<id>/history
//
// The last MONTHS_BACK calendar months of this flat's meter consumption, one
// upstream call per month (flat-consumption/monthly has no multi-month
// variant) — priced the same way Billing is, through resolveFlatConsumption,
// so a month shown here can't disagree with what that month was actually
// billed at.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const g = await guard("residents");
  if (!g.ok) return g.res;

  try {
    if (!Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Resident not found." }, { status: 404 });
    }
    await connectDB();
    const user = await User.findOne({
      _id: params.id,
      role: "resident",
      siteId: g.ctx.siteId,
    });
    if (!user) {
      return NextResponse.json({ error: "Resident not found." }, { status: 404 });
    }

    const creds = await resolveSiteCreds(g.ctx.siteId);
    const months = lastNMonths(MONTHS_BACK);
    const flatNumber = user.flatNumber;

    const fetched = await Promise.all(
      months.map((month) =>
        fetchFlatMonthly({ month, flat: flatNumber }, creds).catch(() => null)
      )
    );

    const monthsOut = months.map((month, i) => {
      const entry = fetched[i]?.flats.find((f) => f.flat === flatNumber);
      if (!entry) {
        return {
          month,
          litres: null as number | null,
          complete: false,
          isPartialMonth: false,
          meters: [],
        };
      }
      const resolved = resolveFlatConsumption(flatNumber, entry);
      return {
        month,
        litres: resolved.litres,
        complete: resolved.complete,
        isPartialMonth: entry.isPartialMonth,
        meters: resolved.meters,
      };
    });

    return NextResponse.json({ flat: flatNumber, months: monthsOut });
  } catch (err) {
    console.error("resident history error", err);
    return NextResponse.json(
      {
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not load meter history.",
      },
      { status: 502 }
    );
  }
}
