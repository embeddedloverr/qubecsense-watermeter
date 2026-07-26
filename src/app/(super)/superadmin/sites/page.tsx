import Link from "next/link";
import { Button } from "@/components/ui";
import { SitesList } from "./SitesList";

export const dynamic = "force-dynamic";

export default function SitesPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Sites
          </h1>
          <p className="text-sm text-muted-foreground">
            Every building on the platform.
          </p>
        </div>
        <Link href="/superadmin/sites/new">
          <Button size="md">New site</Button>
        </Link>
      </div>
      <SitesList />
    </div>
  );
}
