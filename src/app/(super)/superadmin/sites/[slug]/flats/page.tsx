import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { Flat } from "@/lib/models/Flat";
import { User } from "@/lib/models/User";
import { ImportFlats } from "./ImportFlats";

export const dynamic = "force-dynamic";

export default async function SiteFlatsPage({
  params,
}: {
  params: { slug: string };
}) {
  await connectDB();
  const site = await Site.findOne({ slug: params.slug })
    .select("_id name slug residentUsernamePrefix")
    .lean<{ _id: any; name: string; slug: string; residentUsernamePrefix: string }>();
  if (!site) notFound();

  const [flats, residents] = await Promise.all([
    Flat.countDocuments({ siteId: site._id }),
    User.countDocuments({ siteId: site._id, role: "resident" }),
  ]);

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
          Flats &amp; residents
        </h1>
        <p className="text-sm text-muted-foreground">
          {flats} flats · {residents} resident logins · usernames{" "}
          {site.residentUsernamePrefix}_&lt;flat&gt;
        </p>
      </div>
      <ImportFlats
        siteId={String(site._id)}
        prefix={site.residentUsernamePrefix}
      />
    </div>
  );
}
