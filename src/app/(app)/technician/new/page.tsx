import Link from "next/link";
import { InstallationForm } from "@/components/InstallationForm";
import { IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function NewInstallationPage() {
  return (
    <div className="mx-auto max-w-xl">
      <nav className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/technician" className="hover:text-foreground">
          Home
        </Link>
        <IconChevronRight className="h-4 w-4" />
        <span className="text-foreground">New installation</span>
      </nav>
      <h1 className="mb-1 text-xl font-bold tracking-tight text-foreground">
        Record installation
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Complete each step. All fields marked
        <span className="mx-1 text-destructive">*</span>are required.
      </p>
      <InstallationForm />
    </div>
  );
}
