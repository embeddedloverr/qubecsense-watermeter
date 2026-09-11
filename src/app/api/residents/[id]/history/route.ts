import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { guard } from "@/lib/guard";
import { LiveDataError, resolveSiteCreds } from "@/lib/liveData";
import { HISTORY_MONTHS, fetchMonthlyHistory, lastNMonths } from "@/lib/flatConsumption";
import { resolveMonthlyHistory } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/residents/<id>/history
//
// The last HISTORY_MONTHS calendar months of this flat's meter consumption,
// priced the same way Billing is (resolveMonthlyHistory / resolveFlatConsumption)
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
    const flatNumber = user.flatNumber;
    const history = await fetchMonthlyHistory(
      flatNumber,
      lastNMonths(HISTORY_MONTHS),
      creds
    );

    return NextResponse.json({
      flat: flatNumber,
      months: resolveMonthlyHistory(flatNumber, history),
    });
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
