import { redirect } from "next/navigation";
import { guardPage } from "@/lib/guard";
import { AdminOverview } from "./AdminOverview";

export const dynamic = "force-dynamic";

// The installation overview is a superadmin section. A site admin landing here
// (an old bookmark, or /admin typed directly) goes to their own home instead
// of seeing a redirect loop or an empty page.
export default async function AdminDashboard() {
  const ctx = await guardPage([]);
  if (!ctx.isSuperadmin) redirect("/admin/live-data");

  return <AdminOverview siteId={ctx.siteId} />;
}
