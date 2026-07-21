import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const forced = session.mustChange === true;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
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
            {forced ? "Set your password" : "Change password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {forced
              ? "Choose a new password to finish setting up your account."
              : `Signed in as ${session.username || session.email}`}
          </p>
        </div>
        <ChangePasswordForm forced={forced} />
      </div>
    </div>
  );
}
