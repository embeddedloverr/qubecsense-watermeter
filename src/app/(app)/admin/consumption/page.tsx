import { guardPage } from "@/lib/guard";
import { AdminConsumption } from "./AdminConsumption";

export const dynamic = "force-dynamic";

export default async function ConsumptionPage() {
  await guardPage("view_data");
  return <AdminConsumption />;
}
