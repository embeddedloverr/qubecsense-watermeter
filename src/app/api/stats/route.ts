import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Installation } from "@/lib/models/Installation";
import { Schedule } from "@/lib/models/Schedule";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";

export async function GET() {
  // Overview counts only — any admin with a site may read them.
  const g = await guard([]);
  if (!g.ok) return g.res;
  const siteId = g.ctx.siteId;

  await connectDB();

  const [totalFlats, installedCount, plannedCount, installs] =
    await Promise.all([
      Flat.countDocuments({ siteId }),
      Installation.countDocuments({ siteId }),
      Schedule.countDocuments({ siteId, status: "planned" }),
      Installation.find(
        { siteId },
        { installationDate: 1, technicianName: 1, floor: 1, createdAt: 1 }
      ).lean(),
    ]);

  // Installations per day (last 14 days).
  const byDay = new Map<string, number>();
  for (const i of installs as any[]) {
    const d = new Date(i.installationDate || i.createdAt);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  const days: { date: string; count: number }[] = [];
  for (let k = 13; k >= 0; k--) {
    const d = new Date();
    d.setDate(d.getDate() - k);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: byDay.get(key) || 0 });
  }

  // Installations by technician.
  const byTechMap = new Map<string, number>();
  for (const i of installs as any[]) {
    byTechMap.set(i.technicianName, (byTechMap.get(i.technicianName) || 0) + 1);
  }
  const byTech = Array.from(byTechMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Progress by floor.
  const byFloorMap = new Map<number, number>();
  for (const i of installs as any[]) {
    byFloorMap.set(i.floor, (byFloorMap.get(i.floor) || 0) + 1);
  }
  const byFloor = Array.from(byFloorMap.entries())
    .map(([floor, count]) => ({ floor, count }))
    .sort((a, b) => a.floor - b.floor);

  return NextResponse.json({
    totals: {
      totalFlats,
      installedCount,
      pendingCount: totalFlats - installedCount,
      plannedCount,
      completionPct: totalFlats
        ? Math.round((installedCount / totalFlats) * 100)
        : 0,
    },
    perDay: days,
    byTechnician: byTech,
    byFloor,
  });
}
