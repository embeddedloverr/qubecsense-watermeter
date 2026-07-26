import { AdminsMatrix } from "./AdminsMatrix";

export const dynamic = "force-dynamic";

export default function SuperadminAdminsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Admins
        </h1>
        <p className="text-sm text-muted-foreground">
          Who can manage which site, and what they are allowed to do there.
        </p>
      </div>
      <AdminsMatrix />
    </div>
  );
}
