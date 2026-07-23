import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { getSession } from "@/lib/auth";
import { normaliseLitres, type BudgetPeriod } from "@/lib/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/resident/budget — the signed-in resident's alert settings.
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const user = await User.findById(session.sub)
    .select("budgetEnabled budgetLitres budgetPeriod")
    .lean();

  return NextResponse.json({
    enabled: (user as any)?.budgetEnabled === true,
    litres: (user as any)?.budgetLitres ?? null,
    period: ((user as any)?.budgetPeriod as BudgetPeriod) || "monthly",
  });
}

// PUT /api/resident/budget  { enabled, litres, period }
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { enabled, litres, period } = await req.json();

    const on = enabled === true;
    const p: BudgetPeriod = period === "weekly" ? "weekly" : "monthly";

    let value: number | null = null;
    if (on) {
      value = normaliseLitres(litres);
      if (value === null) {
        return NextResponse.json(
          { error: "Enter a valid limit in litres." },
          { status: 400 }
        );
      }
    }

    await connectDB();
    const user = await User.findById(session.sub);
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    user.budgetEnabled = on;
    user.budgetPeriod = p;
    if (value !== null) user.budgetLitres = value;
    // Turning the alert off/changing it resets the dedupe so the next breach
    // in the current period can alert again.
    user.budgetLastAlertKey = undefined;
    await user.save();

    return NextResponse.json({
      enabled: user.budgetEnabled,
      litres: user.budgetLitres ?? null,
      period: user.budgetPeriod,
    });
  } catch (err) {
    console.error("save budget error", err);
    return NextResponse.json(
      { error: "Could not save your alert settings." },
      { status: 500 }
    );
  }
}
