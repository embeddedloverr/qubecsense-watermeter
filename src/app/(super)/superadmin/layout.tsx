import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";
import { SuperShell } from "@/components/SuperShell";

export const dynamic = "force-dynamic";

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "superadmin") redirect("/");

  return (
    <ToastProvider>
      <SuperShell user={{ name: session.name, email: session.email }}>
        {children}
      </SuperShell>
    </ToastProvider>
  );
}
