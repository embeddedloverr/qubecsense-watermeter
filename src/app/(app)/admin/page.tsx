import Link from "next/link";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Installation } from "@/lib/models/Installation";
import { Schedule } from "@/lib/models/Schedule";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/ui";
import {
  InstallsPerDayChart,
  ByTechnicianChart,
} from "@/components/AdminCharts";
import { formatDateTime } from "@/lib/utils";
import {
  IconGauge,
  IconCheckCircle,
  IconCalendar,
  IconHome,
} from "@/components/icons";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone?: "primary" | "success" | "warning" | "neutral";
}) {
  const toneClass = {
    primary: "bg-accent text-accent-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    neutral: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <p className="tabular mt-2 text-3xl font-bold text-foreground">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboard() {
  await connectDB();

  const today = new Date();
  const start14 = new Date();
  start14.setDate(start14.getDate() - 13);

  const [totalFlats, installs, plannedCount, recent] = await Promise.all([
    Flat.countDocuments({}),
    Installation.find(
      {},
      { installationDate: 1, technicianName: 1, floor: 1, createdAt: 1 }
    ).lean(),
    Schedule.countDocuments({ status: "planned" }),
    Installation.find({})
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
  ]);

  const installedCount = installs.length;
  const pendingCount = totalFlats - installedCount;
  const completionPct = totalFlats
    ? Math.round((installedCount / totalFlats) * 100)
    : 0;

  // Per-day series (last 14 days).
  const byDay = new Map<string, number>();
  for (const i of installs as any[]) {
    const key = new Date(i.installationDate || i.createdAt)
      .toISOString()
      .slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  const perDay: { date: string; count: number }[] = [];
  for (let k = 13; k >= 0; k--) {
    const d = new Date();
    d.setDate(d.getDate() - k);
    const key = d.toISOString().slice(0, 10);
    perDay.push({ date: key, count: byDay.get(key) || 0 });
  }

  // By technician.
  const byTechMap = new Map<string, number>();
  for (const i of installs as any[]) {
    byTechMap.set(i.technicianName, (byTechMap.get(i.technicianName) || 0) + 1);
  }
  const byTechnician = Array.from(byTechMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Installation overview
          </h1>
          <p className="text-sm text-muted-foreground">
            Building-wide water meter rollout progress.
          </p>
        </div>
        <Badge tone="primary">
          {formatDateTime(today)}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total flats"
          value={totalFlats}
          sub="In the building"
          icon={IconHome}
          tone="neutral"
        />
        <StatCard
          label="Installed"
          value={installedCount}
          sub={`${completionPct}% complete`}
          icon={IconCheckCircle}
          tone="success"
        />
        <StatCard
          label="Pending"
          value={pendingCount}
          sub="Awaiting install"
          icon={IconGauge}
          tone="warning"
        />
        <StatCard
          label="Planned"
          value={plannedCount}
          sub="On the schedule"
          icon={IconCalendar}
          tone="primary"
        />
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Overall progress</span>
            <span className="tabular text-muted-foreground">
              {installedCount} / {totalFlats}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Installations · last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <InstallsPerDayChart data={perDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By technician</CardTitle>
          </CardHeader>
          <CardContent>
            <ByTechnicianChart data={byTechnician} />
          </CardContent>
        </Card>
      </div>

      {/* Recent */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent installations</CardTitle>
          <Link
            href="/admin/installations"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">
              No installations recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(recent as any[]).map((r) => (
                <li
                  key={String(r._id)}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="tabular font-semibold text-foreground">
                      Flat {r.flatNumber}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.ownerName || "Vacant"} · {r.technicianName}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
