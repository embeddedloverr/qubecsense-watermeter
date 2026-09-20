import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Tariff } from "@/lib/models/Tariff";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The slabs themselves are fixed in code (lib/billing STANDARD_TARIFF) and no
// longer stored or edited per site. The only per-site billing setting left is
// the day of the month a billing cycle opens.

export async function GET() {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  await connectDB();
  const tariff = await Tariff.findOne({
    key: "default",
    siteId: g.ctx.siteId,
  }).lean();
  return NextResponse.json({
    tariff: {
      billingCycleStartDay: (tariff as any)?.billingCycleStartDay ?? 1,
    },
  });
}

export async function PUT(req: NextRequest) {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  try {
    const body = await req.json();
    const billingCycleStartDay =
      body.billingCycleStartDay === undefined || body.billingCycleStartDay === ""
        ? 1
        : Number(body.billingCycleStartDay);

    if (
      !Number.isInteger(billingCycleStartDay) ||
      billingCycleStartDay < 1 ||
      billingCycleStartDay > 28
    ) {
      return NextResponse.json(
        { error: "Billing cycle start day must be a whole number from 1 to 28." },
        { status: 400 }
      );
    }

    await connectDB();
    // siteId must be in BOTH the filter and the upserted document, or an
    // upsert would create a second site-less tariff row.
    await Tariff.findOneAndUpdate(
      { key: "default", siteId: g.ctx.siteId },
      { billingCycleStartDay, siteId: g.ctx.siteId, key: "default" },
      { upsert: true, new: true }
    );
    return NextResponse.json({ tariff: { billingCycleStartDay } });
  } catch (err) {
    console.error("save billing cycle error", err);
    return NextResponse.json(
      { error: "Failed to save the billing cycle." },
      { status: 500 }
    );
  }
}
