import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { Flat } from "@/lib/models/Flat";
import { User } from "@/lib/models/User";
import { Message } from "@/lib/models/Message";
import { Installation } from "@/lib/models/Installation";
import { Tariff } from "@/lib/models/Tariff";
import { guardSuperadmin } from "@/lib/guard";
import { fetchLiveData, resolveSiteCreds } from "@/lib/liveData";
import { applySlabs, type Slab } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SiteRow {
  id: string;
  name: string;
  slug: string;
  project: string;
  active: boolean;
  flats: number;
  installed: number;
  residents: number;
  neverLoggedIn: number;
  unread: number;
  tariffConfigured: boolean;
  // From the upstream API — null when it could not be reached.
  api: "ok" | "error" | "unconfigured";
  apiError?: string;
  metersReporting: number | null;
  silentMeters: number | null;
  lastDataAt: string | null;
  consumptionMtdLitres: number | null;
  revenueMtd: number | null;
}

function currentMonthPrefix(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  await connectDB();
  const sites = await Site.find({}).sort({ createdAt: 1 }).lean<any[]>();
  const month = currentMonthPrefix();

  // One upstream call per site. allSettled (never all) so a single bad key
  // degrades that row instead of blanking the page.
  const results = await Promise.allSettled(
    sites.map(async (s): Promise<SiteRow> => {
      const siteId = s._id;

      const [flats, installed, residents, neverLoggedIn, unread, tariffDoc] =
        await Promise.all([
          Flat.countDocuments({ siteId }),
          Installation.countDocuments({ siteId }),
          User.countDocuments({ siteId, role: "resident" }),
          User.countDocuments({
            siteId,
            role: "resident",
            lastLoginAt: { $exists: false },
          }),
          Message.countDocuments({
            siteId,
            sender: "resident",
            readByAdmin: false,
          }),
          Tariff.findOne({ siteId, key: "default" }).lean<any>(),
        ]);

      const base: SiteRow = {
        id: String(siteId),
        name: s.name,
        slug: s.slug,
        project: s.project || "",
        active: s.active !== false,
        flats,
        installed,
        residents,
        neverLoggedIn,
        unread,
        tariffConfigured: Boolean(tariffDoc?.slabs?.length),
        api: "unconfigured",
        metersReporting: null,
        silentMeters: null,
        lastDataAt: null,
        consumptionMtdLitres: null,
        revenueMtd: null,
      };

      try {
        const creds = await resolveSiteCreds(String(siteId));
        const data = await fetchLiveData({ days: 32 }, creds);
        const latest = data.range?.to || null;

        // Meters whose newest reading predates the newest day overall.
        let silent = 0;
        const consider = (m: any) => {
          const last = m.readings.reduce(
            (a: string | null, r: any) => (!a || r.date > a ? r.date : a),
            null as string | null
          );
          if (last && latest && last < latest) silent++;
        };
        for (const f of data.flats) f.meters.forEach(consider);
        data.unassigned.forEach(consider);

        const slabs: Slab[] = tariffDoc?.slabs || [];
        const fixed: number = tariffDoc?.fixedCharge || 0;
        let mtd = 0;
        let revenue = 0;
        for (const f of data.flats) {
          let flatLitres = 0;
          for (const m of f.meters) {
            for (const r of m.readings) {
              if (r.date.startsWith(month)) flatLitres += r.consumptionLitres;
            }
          }
          mtd += flatLitres;
          if (slabs.length) revenue += applySlabs(flatLitres, slabs, fixed).amount;
        }

        return {
          ...base,
          api: "ok",
          metersReporting: data.meterCount,
          silentMeters: silent,
          lastDataAt: latest,
          consumptionMtdLitres: Math.round(mtd),
          revenueMtd: slabs.length ? Math.round(revenue * 100) / 100 : null,
        };
      } catch (err: any) {
        return {
          ...base,
          api: s.dataApiUrl ? "error" : "unconfigured",
          apiError: err?.message || "Could not reach the data API.",
        };
      }
    })
  );

  const rows = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          id: String(sites[i]._id),
          name: sites[i].name,
          slug: sites[i].slug,
          project: sites[i].project || "",
          active: sites[i].active !== false,
          flats: 0,
          installed: 0,
          residents: 0,
          neverLoggedIn: 0,
          unread: 0,
          tariffConfigured: false,
          api: "error" as const,
          apiError: "Failed to load this site.",
          metersReporting: null,
          silentMeters: null,
          lastDataAt: null,
          consumptionMtdLitres: null,
          revenueMtd: null,
        }
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    month,
    sites: rows,
    totals: {
      sites: rows.length,
      activeSites: rows.filter((r) => r.active).length,
      flats: rows.reduce((a, r) => a + r.flats, 0),
      residents: rows.reduce((a, r) => a + r.residents, 0),
      unread: rows.reduce((a, r) => a + r.unread, 0),
      silentMeters: rows.reduce((a, r) => a + (r.silentMeters || 0), 0),
      consumptionMtdLitres: rows.reduce(
        (a, r) => a + (r.consumptionMtdLitres || 0),
        0
      ),
      revenueMtd:
        Math.round(rows.reduce((a, r) => a + (r.revenueMtd || 0), 0) * 100) / 100,
    },
  });
}
