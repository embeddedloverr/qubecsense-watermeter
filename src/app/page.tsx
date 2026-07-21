import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homeFor } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChange) redirect("/change-password");
  redirect(homeFor(session.role));
}
