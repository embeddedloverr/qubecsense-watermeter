import { SuperOverview } from "./SuperOverview";

export const dynamic = "force-dynamic";

export default function SuperadminOverviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          All sites
        </h1>
        <p className="text-sm text-muted-foreground">
          Live health and usage across every building you manage.
        </p>
      </div>
      <SuperOverview />
    </div>
  );
}
