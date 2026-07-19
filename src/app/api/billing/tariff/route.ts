import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Tariff } from "@/lib/models/Tariff";
import { getSession } from "@/lib/auth";
import { validateSlabs, type Slab } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const tariff = await Tariff.findOne({ key: "default" }).lean();
  return NextResponse.json({
    tariff: tariff
      ? { slabs: (tariff as any).slabs, fixedCharge: (tariff as any).fixedCharge }
      : { slabs: [], fixedCharge: 0 },
    configured: Boolean(tariff && (tariff as any).slabs?.length),
  });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const slabs: Slab[] = (body.slabs || []).map((s: any) => ({
      limitLitres:
        s.limitLitres === null || s.limitLitres === "" ? null : Number(s.limitLitres),
      ratePerKl: Number(s.ratePerKl),
    }));
    const fixedCharge = Number(body.fixedCharge) || 0;

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

    await connectDB();
    await Tariff.findOneAndUpdate(
      { key: "default" },
      { slabs, fixedCharge },
      { upsert: true, new: true }
    );
    return NextResponse.json({ tariff: { slabs, fixedCharge } });
  } catch (err) {
    console.error("save tariff error", err);
    return NextResponse.json(
      { error: "Failed to save tariff." },
      { status: 500 }
    );
  }
}
