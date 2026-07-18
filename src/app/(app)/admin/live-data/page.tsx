import { AdminLiveData } from "./AdminLiveData";

export const dynamic = "force-dynamic";

export default function AdminLiveDataPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Live meter data
        </h1>
        <p className="text-sm text-muted-foreground">
          Daily consumption, totalizers and alerts reported by the installed
          meters.
        </p>
      </div>
      <AdminLiveData />
    </div>
  );
}
