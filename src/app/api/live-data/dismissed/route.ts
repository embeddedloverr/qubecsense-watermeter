import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DismissedMeter } from "@/lib/models/DismissedMeter";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/live-data/dismissed — device IDs this site has hidden from the
// Unassigned/stopped-reporting views, newest first.
export async function GET() {
  const g = await guard("view_data");
  if (!g.ok) return g.res;

  await connectDB();
  const dismissed = await DismissedMeter.find(
    { siteId: g.ctx.siteId },
    { deviceId: 1, dismissedByName: 1, createdAt: 1 }
  )
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    dismissed: (dismissed as any[]).map((d) => ({
      deviceId: d.deviceId,
      dismissedByName: d.dismissedByName || "",
      dismissedAt: d.createdAt,
    })),
  });
}

// POST /api/live-data/dismissed  { deviceId }
// Hides one unassigned/silent device from this site's Live Data views.
// Doesn't touch the device itself — purely a local suppression entry.
export async function POST(req: NextRequest) {
  const g = await guard("view_data");
  if (!g.ok) return g.res;

  try {
    const { deviceId } = await req.json();
    const id = String(deviceId || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing deviceId." }, { status: 400 });
    }

    await connectDB();
    await DismissedMeter.updateOne(
      { siteId: g.ctx.siteId, deviceId: id },
      { $setOnInsert: { dismissedByName: g.ctx.session.name || "" } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, deviceId: id });
  } catch (err) {
    console.error("dismiss meter error", err);
    return NextResponse.json(
      { error: "Could not dismiss that meter." },
      { status: 500 }
    );
  }
}

// DELETE /api/live-data/dismissed?deviceId=X — undo a dismissal.
export async function DELETE(req: NextRequest) {
  const g = await guard("view_data");
  if (!g.ok) return g.res;

  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  if (!deviceId) {
    return NextResponse.json({ error: "Missing deviceId." }, { status: 400 });
  }

  await connectDB();
  await DismissedMeter.deleteOne({ siteId: g.ctx.siteId, deviceId });

  return NextResponse.json({ ok: true, deviceId });
}
