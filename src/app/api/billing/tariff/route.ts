import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Tariff } from "@/lib/models/Tariff";
import { guard } from "@/lib/guard";
import { validateSlabs, type Slab } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  await connectDB();
  const tariff = await Tariff.findOne({
    key: "default",
    siteId: g.ctx.siteId,
  }).lean();
  return NextResponse.json({
    tariff: tariff
      ? {
          slabs: (tariff as any).slabs,
          fixedCharge: (tariff as any).fixedCharge,
          billingCycleStartDay: (tariff as any).billingCycleStartDay ?? 1,
        }
      : { slabs: [], fixedCharge: 0, billingCycleStartDay: 1 },
    configured: Boolean(tariff && (tariff as any).slabs?.length),
  });
}

export async function PUT(req: NextRequest) {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  try {
    const body = await req.json();
    const slabs: Slab[] = (body.slabs || []).map((s: any) => ({
      limitLitres:
        s.limitLitres === null || s.limitLitres === "" ? null : Number(s.limitLitres),
      ratePerKl: Number(s.ratePerKl),
    }));
    const fixedCharge = Number(body.fixedCharge) || 0;
    const billingCycleStartDay =
      body.billingCycleStartDay === undefined || body.billingCycleStartDay === ""
        ? 1
        : Number(body.billingCycleStartDay);

    const invalid = validateSlabs(slabs);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }
    if (fixedCharge < 0 || !Number.isFinite(fixedCharge)) {
      return NextResponse.json(
        { error: "Fixed charge must be a number ≥ 0." },
        { status: 400 }
      );
    }
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
      {
        slabs,
        fixedCharge,
        billingCycleStartDay,
        siteId: g.ctx.siteId,
        key: "default",
      },
      { upsert: true, new: true }
    );
    return NextResponse.json({
      tariff: { slabs, fixedCharge, billingCycleStartDay },
    });
  } catch (err) {
    console.error("save tariff error", err);
    return NextResponse.json(
      { error: "Failed to save tariff." },
      { status: 500 }
    );
  }
}
