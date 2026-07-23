import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runBudgetAlerts } from "@/lib/budgetAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST or GET /api/cron/budget-alerts
// Run periodically (e.g. a daily server cron) to email residents who have
// gone over their water budget. Authorised by either:
//   - an admin session, or
//   - a "x-cron-key" header / "?key=" that matches CRON_SECRET.
async function authorise(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      req.headers.get("x-cron-key") || req.nextUrl.searchParams.get("key");
    if (provided && provided === secret) return true;
  }
  const session = await getSession();
  return Boolean(session && session.role === "admin");
}

async function handle(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runBudgetAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("budget-alerts cron error", err);
    return NextResponse.json(
      { error: err?.message || "Budget alert run failed." },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
