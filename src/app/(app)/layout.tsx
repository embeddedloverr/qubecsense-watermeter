import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <ToastProvider>
      <AppShell
        user={{
          name: session.name,
          email: session.email,
          role: session.role,
        }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
