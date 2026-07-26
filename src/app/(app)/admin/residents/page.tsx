import { guardPage } from "@/lib/guard";
import { AdminResidents } from "./AdminResidents";

export const dynamic = "force-dynamic";

export default async function AdminResidentsPage() {
  await guardPage("residents");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Resident accounts
        </h1>
        <p className="text-sm text-muted-foreground">
          One login per flat. Re-issue a password or disable an account.
        </p>
      </div>
      <AdminResidents />
    </div>
  );
}
