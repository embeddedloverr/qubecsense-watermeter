import Link from "next/link";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Installation } from "@/lib/models/Installation";
import { Schedule } from "@/lib/models/Schedule";
import { Card, CardContent, Badge, Button } from "@/components/ui";
import { IconNewInstall, IconCheckCircle, IconCalendar } from "@/components/icons";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TechnicianHome() {
  const session = (await getSession())!;
  await connectDB();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [completedCount, recent, planned] = await Promise.all([
    Installation.countDocuments({ technicianId: session.sub }),
    Installation.find({ technicianId: session.sub })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
    Schedule.find({ technicianId: session.sub, status: "planned" })
      .sort({ scheduledDate: 1 })
      .limit(8)
      .lean(),
  ]);

  const todayCount = (recent as any[]).filter((r) => {
    const d = new Date(r.createdAt);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Hello, {session.name.split(" ")[0]} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Record a new water meter installation or pick up a scheduled job.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Completed by you</p>
            <p className="tabular mt-1 text-3xl font-bold text-foreground">
              {completedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Done today</p>
            <p className="tabular mt-1 text-3xl font-bold text-primary">
              {todayCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Primary CTA */}
      <Link href="/technician/new" className="block">
        <div className="flex items-center gap-4 rounded-xl bg-primary p-5 text-primary-foreground shadow-sm transition-transform active:scale-[0.99]">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15">
            <IconNewInstall className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <p className="text-base font-semibold">New installation</p>
            <p className="text-sm text-primary-foreground/80">
              Kitchen + bathroom meters, photos & owner sign-off
            </p>
          </div>
        </div>
      </Link>

      {/* Scheduled jobs */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <IconCalendar className="h-4 w-4 text-secondary" /> Your scheduled
          flats
        </h2>
        {planned.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No flats assigned to you right now.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {(planned as any[]).map((s) => (
                <li
                  key={String(s._id)}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="tabular font-semibold text-foreground">
                      Flat {s.flatNumber}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {s.ownerName || "Vacant"} · {formatDate(s.scheduledDate)}
                    </p>
                  </div>
                  <Link href="/technician/new">
                    <Button size="sm" variant="outline">
                      Start
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Recent installs */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <IconCheckCircle className="h-4 w-4 text-success" /> Recent
          installations
        </h2>
        {recent.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              You haven&apos;t recorded any installations yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {(recent as any[]).map((r) => (
                <li
                  key={String(r._id)}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="tabular font-semibold text-foreground">
                      Flat {r.flatNumber}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.ownerName || "Vacant"} ·{" "}
                      {formatDate(r.installationDate)}
                    </p>
                  </div>
                  <Badge tone="success">
                    <IconCheckCircle className="h-3.5 w-3.5" /> Done
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
