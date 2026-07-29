import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { AdminSchedule } from "@/app/(app)/admin/schedule/AdminSchedule";

export const dynamic = "force-dynamic";

// Same component the /admin mount uses, pointed at an explicit site.
export default async function SiteSchedulePage({
  params,
}: {
  params: { slug: string };
}) {
  await connectDB();
  const site = await Site.findOne({ slug: params.slug })
    .select("_id name slug")
    .lean<{ _id: any; name: string; slug: string }>();
  if (!site) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/superadmin/sites/${site.slug}`}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ← {site.name}
        </Link>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
          Schedule &amp; planning
        </h1>
        <p className="text-sm text-muted-foreground">
          Assign pending flats in {site.name} to technicians by date.
        </p>
      </div>
      <AdminSchedule siteId={String(site._id)} />
    </div>
  );
}
