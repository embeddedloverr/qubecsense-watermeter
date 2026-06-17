import { AdminInstallations } from "./AdminInstallations";

export const dynamic = "force-dynamic";

export default function AdminInstallationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Installation records
        </h1>
        <p className="text-sm text-muted-foreground">
          Every recorded installation with meter photos and owner sign-off.
        </p>
      </div>
      <AdminInstallations />
    </div>
  );
}
