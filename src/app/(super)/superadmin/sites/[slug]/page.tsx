import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { SiteDetail } from "./SiteDetail";

export const dynamic = "force-dynamic";

export default async function SiteDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  await connectDB();
  const site = await Site.findOne({ slug: params.slug })
    .select("_id name slug")
    .lean<{ _id: any; name: string; slug: string }>();
  if (!site) notFound();

  return <SiteDetail siteId={String(site._id)} slug={site.slug} name={site.name} />;
}
