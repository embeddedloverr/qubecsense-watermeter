import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Logo";
import { homeFor } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient water-themed backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(var(--accent)) 0%, transparent 70%)",
        }}
      />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={52} showText={false} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
            QubecSense
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Water Meter Installation Portal
          </p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Technician &amp; admin access · Authorised personnel only
        </p>
      </div>
    </div>
  );
}
