import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { Flat } from "@/lib/models/Flat";
import { User } from "@/lib/models/User";
import { guardSuperadmin } from "@/lib/guard";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// GET /api/superadmin/sites — list every site with headline counts.
export async function GET() {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  await connectDB();
  const sites = await Site.find({}).sort({ createdAt: 1 }).lean();

  const rows = await Promise.all(
    (sites as any[]).map(async (s) => {
      const [flats, residents, admins] = await Promise.all([
        Flat.countDocuments({ siteId: s._id }),
        User.countDocuments({ siteId: s._id, role: "resident" }),
        User.countDocuments({ "siteAccess.siteId": s._id, role: "admin" }),
      ]);
      return {
        id: String(s._id),
        name: s.name,
        slug: s.slug,
        project: s.project || "",
        building: s.building || "",
        city: s.city || "",
        active: s.active !== false,
        // Never return the key itself — only whether one is configured.
        hasDataApi: Boolean(s.dataApiUrl),
        residentUsernamePrefix: s.residentUsernamePrefix,
        flats,
        residents,
        admins,
        createdAt: s.createdAt,
      };
    })
  );

  return NextResponse.json({ sites: rows, total: rows.length });
}

// POST /api/superadmin/sites — create a site.
export async function POST(req: NextRequest) {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const prefix = String(body.residentUsernamePrefix || "").toLowerCase().trim();

    if (!name) {
      return NextResponse.json({ error: "Site name is required." }, { status: 400 });
    }
    if (!/^[a-z][a-z0-9]{1,20}$/.test(prefix)) {
      return NextResponse.json(
        {
          error:
            "Username prefix must be 2–21 lowercase letters/digits starting with a letter (e.g. greenwood).",
        },
        { status: 400 }
      );
    }

    const slug = slugify(String(body.slug || name));
    if (!slug) {
      return NextResponse.json({ error: "Could not derive a slug." }, { status: 400 });
    }

    await connectDB();

    // Both must be unique; check explicitly for a readable error rather than
    // surfacing a raw E11000.
    if (await Site.findOne({ slug })) {
      return NextResponse.json(
        { error: `A site with the slug "${slug}" already exists.` },
        { status: 409 }
      );
    }
    if (await Site.findOne({ residentUsernamePrefix: prefix })) {
      return NextResponse.json(
        {
          error: `The username prefix "${prefix}" is already used by another site. Resident usernames must stay unique.`,
        },
        { status: 409 }
      );
    }

    const site = await Site.create({
      name,
      slug,
      project: String(body.project || "").trim(),
      building: String(body.building || name).trim(),
      addressLine: String(body.addressLine || "").trim(),
      city: String(body.city || "").trim(),
      state: String(body.state || "").trim(),
      pincode: String(body.pincode || "").trim(),
      dataApiUrl: String(body.dataApiUrl || "").trim(),
      dataApiKey: body.dataApiKey ? encryptSecret(String(body.dataApiKey)) : "",
      residentUsernamePrefix: prefix,
      timezone: String(body.timezone || "Asia/Kolkata"),
      currency: String(body.currency || "INR"),
      adminNotifyEmail: String(body.adminNotifyEmail || "").toLowerCase().trim(),
      supportPhone: String(body.supportPhone || "").trim(),
      active: true,
    });

    return NextResponse.json(
      { site: { id: String(site._id), slug: site.slug, name: site.name } },
      { status: 201 }
    );
  } catch (err) {
    console.error("create site error", err);
    return NextResponse.json({ error: "Could not create the site." }, { status: 500 });
  }
}
