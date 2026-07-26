import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { guardSuperadmin } from "@/lib/guard";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";
import { fetchLiveData, LiveDataError } from "@/lib/liveData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/superadmin/sites/<id> — full settings. The API key is returned
// masked (last 4 only); the plaintext never leaves the server.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  await connectDB();
  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const site = await Site.findById(params.id).select("+dataApiKey").lean<any>();
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let keyMask = "";
  if (site.dataApiKey) {
    try {
      keyMask = maskSecret(decryptSecret(site.dataApiKey));
    } catch {
      keyMask = "(unreadable — SITE_SECRET_KEY changed?)";
    }
  }

  return NextResponse.json({
    site: {
      id: String(site._id),
      name: site.name,
      slug: site.slug,
      project: site.project || "",
      building: site.building || "",
      addressLine: site.addressLine || "",
      city: site.city || "",
      state: site.state || "",
      pincode: site.pincode || "",
      dataApiUrl: site.dataApiUrl || "",
      dataApiKeyMask: keyMask,
      residentUsernamePrefix: site.residentUsernamePrefix,
      timezone: site.timezone,
      currency: site.currency,
      adminNotifyEmail: site.adminNotifyEmail || "",
      supportPhone: site.supportPhone || "",
      active: site.active !== false,
    },
  });
}

// PATCH /api/superadmin/sites/<id> — update settings.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  try {
    const body = await req.json();
    await connectDB();
    if (!Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const site = await Site.findById(params.id);
    if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const text = (k: string) =>
      body[k] === undefined ? undefined : String(body[k]).trim();

    for (const field of [
      "name",
      "project",
      "building",
      "addressLine",
      "city",
      "state",
      "pincode",
      "dataApiUrl",
      "timezone",
      "currency",
      "supportPhone",
    ]) {
      const v = text(field);
      if (v !== undefined) (site as any)[field] = v;
    }

    if (body.adminNotifyEmail !== undefined) {
      site.adminNotifyEmail = String(body.adminNotifyEmail).toLowerCase().trim();
    }
    if (typeof body.active === "boolean") site.active = body.active;

    // Changing the prefix would orphan existing resident usernames.
    if (
      body.residentUsernamePrefix !== undefined &&
      String(body.residentUsernamePrefix).toLowerCase().trim() !==
        site.residentUsernamePrefix
    ) {
      return NextResponse.json(
        {
          error:
            "The username prefix cannot be changed — existing resident logins are built from it.",
        },
        { status: 400 }
      );
    }

    // Only overwrite the key when a new one is actually supplied; an empty
    // string means "leave it alone", so the masked value can round-trip.
    if (body.dataApiKey) {
      site.dataApiKey = encryptSecret(String(body.dataApiKey));
    }

    await site.save();
    return NextResponse.json({ ok: true, id: String(site._id) });
  } catch (err) {
    console.error("update site error", err);
    return NextResponse.json({ error: "Could not update the site." }, { status: 500 });
  }
}

// POST /api/superadmin/sites/<id>  { action: "test-connection" }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  try {
    const { action, dataApiUrl, dataApiKey } = await req.json();
    if (action !== "test-connection") {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    await connectDB();
    const site = await Site.findById(params.id).select("+dataApiKey").lean<any>();
    if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Test the values being typed if supplied, otherwise what is stored.
    const baseUrl = (dataApiUrl || site.dataApiUrl || "").trim();
    const apiKey = dataApiKey
      ? String(dataApiKey)
      : site.dataApiKey
        ? decryptSecret(site.dataApiKey)
        : "";

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { ok: false, error: "Set both a URL and a key first." },
        { status: 400 }
      );
    }

    const data = await fetchLiveData({ days: 2 }, { baseUrl, apiKey });
    return NextResponse.json({
      ok: true,
      project: data.project,
      building: data.building,
      flatCount: data.flatCount,
      meterCount: data.meterCount,
      latest: data.range?.to || null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not reach that API with those credentials.",
      },
      { status: 200 }
    );
  }
}
