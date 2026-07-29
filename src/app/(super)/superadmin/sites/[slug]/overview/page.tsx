import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { AdminOverview } from "@/app/(app)/admin/AdminOverview";

export const dynamic = "force-dynamic";

export default async function SiteOverviewPage({
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
      <Link
        href={`/superadmin/sites/${site.slug}`}
        className="text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        ← {site.name}
      </Link>
      <AdminOverview
        siteId={String(site._id)}
        subtitle={`Water meter rollout progress for ${site.name}.`}
        recordsHref={`/superadmin/sites/${site.slug}/records`}
      />
    </div>
  );
}
