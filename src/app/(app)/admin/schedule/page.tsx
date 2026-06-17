import { AdminSchedule } from "./AdminSchedule";

export const dynamic = "force-dynamic";

export default function SchedulePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Schedule &amp; planning
        </h1>
        <p className="text-sm text-muted-foreground">
          Assign pending flats to technicians by date.
        </p>
      </div>
      <AdminSchedule />
    </div>
  );
}
