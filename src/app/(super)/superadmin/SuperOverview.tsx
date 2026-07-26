"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, Button, Spinner, Badge } from "@/components/ui";
import {
  IconAlert,
  IconHome,
  IconUsers,
  IconDroplet,
  IconRupee,
  IconMessage,
} from "@/components/icons";
import { useToast } from "@/components/Toast";
import { formatDate } from "@/lib/utils";

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
  api: "ok" | "error" | "unconfigured";
  apiError?: string;
  metersReporting: number | null;
  silentMeters: number | null;
  lastDataAt: string | null;
  consumptionMtdLitres: number | null;
  revenueMtd: number | null;
}

interface Overview {
  generatedAt: string;
  sites: SiteRow[];
  totals: {
    sites: number;
    activeSites: number;
    flats: number;
    residents: number;
    unread: number;
    silentMeters: number;
    consumptionMtdLitres: number;
    revenueMtd: number;
  };
}

const litres = (n: number | null) =>
  n == null ? "—" : `${Math.round(n).toLocaleString("en-IN")} L`;
const rupees = (n: number | null) =>
  n == null
    ? "—"
    : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function SuperOverview() {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [entering, setEntering] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/overview", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load.");
      setData(body);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  /** Enter a site — re-mints the session with that site's context. */
  const enterSite = async (site: SiteRow) => {
    setEntering(site.id);
    try {
      const res = await fetch("/api/session/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Could not enter that site.", "error");
        return;
      }
      router.push("/admin/live-data");
      router.refresh();
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setEntering(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading every site…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="space-y-3 py-12 text-center">
          <IconAlert className="mx-auto h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (data.sites.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-14 text-center">
          <p className="text-sm text-muted-foreground">No sites yet.</p>
          <Link href="/superadmin/sites/new">
            <Button size="md">Create the first site</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-4">
      {/* Roll-up across every site */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sites" value={`${t.activeSites}/${t.sites}`} sub="active" icon={IconHome} />
        <Stat label="Flats" value={t.flats.toLocaleString("en-IN")} sub={`${t.residents} residents`} icon={IconUsers} />
        <Stat label="Consumption · MTD" value={litres(t.consumptionMtdLitres)} sub="all sites" icon={IconDroplet} />
        <Stat label="Billed · MTD" value={rupees(t.revenueMtd)} sub="all sites" icon={IconRupee} />
      </div>

      {(t.silentMeters > 0 || t.unread > 0) && (
        <div className="flex flex-wrap gap-2">
          {t.silentMeters > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning">
              <IconAlert className="h-3.5 w-3.5" />
              {t.silentMeters} meter{t.silentMeters === 1 ? "" : "s"} silent across all sites
            </span>
          )}
          {t.unread > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive">
              <IconMessage className="h-3.5 w-3.5" />
              {t.unread} unread message{t.unread === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {/* Per-site cards */}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.sites.map((s) => (
          <Card key={s.id} className={s.active ? "" : "opacity-60"}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-foreground">
                      {s.name}
                    </h3>
                    {!s.active && <Badge tone="neutral">Disabled</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.project || "—"}
                  </p>
                </div>
                <ApiPill site={s} />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                <Metric label="Flats" value={String(s.flats)} />
                <Metric label="Residents" value={String(s.residents)} />
                <Metric label="Meters" value={s.metersReporting == null ? "—" : String(s.metersReporting)} />
                <Metric
                  label="Silent"
                  value={s.silentMeters == null ? "—" : String(s.silentMeters)}
                  tone={s.silentMeters ? "warn" : undefined}
                />
                <Metric label="MTD" value={litres(s.consumptionMtdLitres)} />
                <Metric
                  label="Billed"
                  value={s.tariffConfigured ? rupees(s.revenueMtd) : "no tariff"}
                  tone={s.tariffConfigured ? undefined : "warn"}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Last data:{" "}
                  {s.lastDataAt ? formatDate(s.lastDataAt) : "never"}
                </span>
                {s.unread > 0 && (
                  <span className="font-medium text-destructive">
                    {s.unread} unread
                  </span>
                )}
                {s.neverLoggedIn > 0 && (
                  <span>{s.neverLoggedIn} never signed in</span>
                )}
              </div>

              {s.apiError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {s.apiError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  loading={entering === s.id}
                  onClick={() => enterSite(s)}
                >
                  Open site
                </Button>
                <Link href={`/superadmin/sites/${s.slug}`}>
                  <Button size="sm" variant="outline">
                    Manage
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Updated {new Date(data.generatedAt).toLocaleTimeString("en-IN")} ·{" "}
        <button onClick={load} className="font-medium text-primary hover:underline">
          Refresh
        </button>
      </p>
    </div>
  );
}

function ApiPill({ site }: { site: SiteRow }) {
  if (site.api === "ok") return <Badge tone="success">API ok</Badge>;
  if (site.api === "error") return <Badge tone="destructive">API error</Badge>;
  return <Badge tone="warning">No API key</Badge>;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`tabular font-medium ${
          tone === "warn" ? "text-warning" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <p className="tabular mt-2 text-xl font-bold text-foreground sm:text-2xl">
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
