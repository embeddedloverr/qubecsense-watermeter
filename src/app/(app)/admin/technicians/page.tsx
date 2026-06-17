import { AdminTechnicians } from "./AdminTechnicians";

export const dynamic = "force-dynamic";

export default function TechniciansPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Team
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage technician accounts that can log in and record installations.
        </p>
      </div>
      <AdminTechnicians />
    </div>
  );
}
