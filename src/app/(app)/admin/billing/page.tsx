import { AdminBilling } from "./AdminBilling";

export const dynamic = "force-dynamic";

export default function AdminBillingPage() {
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Reporting &amp; billing
        </h1>
        <p className="text-sm text-muted-foreground">
          Slab-wise water tariff and monthly consumption bills per flat.
        </p>
      </div>
      <AdminBilling />
    </div>
  );
}
