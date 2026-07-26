import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { AdminTechnicians } from "@/app/(app)/admin/technicians/AdminTechnicians";

export const dynamic = "force-dynamic";

// Same component the site admin sees, mounted here against an explicit site.
export default async function SiteTechniciansPage({
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
          Technicians
        </h1>
        <p className="text-sm text-muted-foreground">
          Field team for {site.name}.
        </p>
      </div>
      <AdminTechnicians siteId={String(site._id)} />
    </div>
  );
}
