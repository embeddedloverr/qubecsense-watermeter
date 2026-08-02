"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Badge,
  Button,
  Spinner,
} from "@/components/ui";
import {
  IconDroplet,
  IconHome,
  IconAlert,
  IconCheckCircle,
  IconChevronRight,
} from "@/components/icons";
import { formatDateTime } from "@/lib/utils";

/* --------------------------------- Types --------------------------------- */

interface Meter {
  deviceId: string;
  deviceKey: string;
  location: string | null;
  totalizerStart: number | null;
  totalizerStartDate: string | null;
  totalizerEnd: number | null;
  totalizerEndDate: string | null;
  consumptionLitres: number | null;
  anomaly: "no_reading_in_period" | "totalizer_decreased" | null;
}

interface FlatEntry {
  flat: string;
  ownerName: string;
  ownerPhone: string;
  consumptionLitres: number;
  complete: boolean;
  meters: Meter[];
  computedAt: string;
  // monthly only
  isPartialMonth?: boolean;
  latestDateUsed?: string;
}

interface ApiResponse {
  date?: string;
  month?: string;
  flatCount: number;
  flats: FlatEntry[];
}

type Period = "daily" | "monthly";

const litres = (n: number) => `${Math.round(n).toLocaleString("en-IN")} L`;

const ANOMALY_LABEL: Record<string, string> = {
  no_reading_in_period: "No reading in period",
  totalizer_decreased: "Meter reset or replaced",
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const thisMonthISO = () => new Date().toISOString().slice(0, 7);

/* --------------------------------- Cards ---------------------------------- */

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone?: "primary" | "success" | "warning" | "neutral" | "destructive";
}) {
  const toneClass = {
    primary: "bg-accent text-accent-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    neutral: "bg-muted text-muted-foreground",
    destructive: "bg-destructive/15 text-destructive",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <p className="tabular mt-2 text-2xl font-bold text-foreground sm:text-3xl">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- Row ------------------------------------ */

function FlatRow({ entry, period }: { entry: FlatEntry; period: Period }) {
  const [open, setOpen] = React.useState(false);
  const anomalies = entry.meters.filter((m) => m.anomaly);

  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="tabular font-semibold text-foreground">Flat {entry.flat}</p>
            {!entry.complete && (
              <Badge tone="warning">Incomplete</Badge>
            )}
            {period === "monthly" && entry.isPartialMonth && (
              <Badge tone="neutral">Month in progress</Badge>
            )}
            {anomalies.length > 0 && (
              <Badge tone="destructive">{anomalies.length} anomaly</Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {entry.ownerName || "—"}
          </p>
        </div>
        <p className="tabular shrink-0 text-sm font-semibold text-foreground">
          {litres(entry.consumptionLitres)}
        </p>
        <IconChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-3">
          {entry.meters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No meters registered.</p>
          ) : (
            <div className="space-y-2">
              {entry.meters.map((m) => (
                <div
                  key={m.deviceKey}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {m.location || "Meter"} · <span className="tabular text-xs text-muted-foreground">{m.deviceId}</span>
                    </p>
                    {m.anomaly ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                        <IconAlert className="h-3 w-3" /> {ANOMALY_LABEL[m.anomaly] || m.anomaly}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {m.totalizerStart ?? "—"} → {m.totalizerEnd ?? "—"}
                        {m.totalizerStartDate && m.totalizerEndDate
                          ? ` (${m.totalizerStartDate} → ${m.totalizerEndDate})`
                          : ""}
                      </p>
                    )}
                  </div>
                  <p className="tabular shrink-0 font-semibold text-foreground">
                    {m.consumptionLitres != null ? litres(m.consumptionLitres) : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Computed {formatDateTime(entry.computedAt)}
          </p>
        </div>
      )}
    </li>
  );
}

/* ------------------------------ Main component ----------------------------- */

export function AdminConsumption() {
  const [period, setPeriod] = React.useState<Period>("daily");
  const [date, setDate] = React.useState(todayISO());
  const [month, setMonth] = React.useState(thisMonthISO());
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        period === "monthly"
          ? `period=monthly&month=${month}`
          : `period=daily&date=${date}`;
      const res = await fetch(`/api/consumption?${qs}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load consumption.");
      setData(body);
    } catch (e: any) {
      setError(e?.message || "Failed to load consumption.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period, date, month]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const rows = !q
      ? data.flats
      : data.flats.filter(
          (f) =>
            f.flat.toLowerCase().includes(q) ||
            (f.ownerName || "").toLowerCase().includes(q)
        );
    return [...rows].sort((a, b) => {
      const na = parseInt(a.flat, 10);
      const nb = parseInt(b.flat, 10);
      if (Number.isNaN(na) || Number.isNaN(nb)) return a.flat.localeCompare(b.flat);
      return na - nb;
    });
  }, [data, query]);

  const kpis = React.useMemo(() => {
    if (!data) return null;
    const totalLitres = data.flats.reduce((a, f) => a + f.consumptionLitres, 0);
    const incomplete = data.flats.filter((f) => !f.complete).length;
    const anomalies = data.flats.reduce(
      (a, f) => a + f.meters.filter((m) => m.anomaly).length,
      0
    );
    return { totalLitres, incomplete, anomalies };
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const header = ["Flat", "Owner", "Consumption (L)", "Complete", "Anomalies"];
    const rows = filtered.map((f) => [
      f.flat,
      f.ownerName,
      Math.round(f.consumptionLitres),
      f.complete ? "Yes" : "No",
      f.meters.filter((m) => m.anomaly).map((m) => ANOMALY_LABEL[m.anomaly!] || m.anomaly).join("; "),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qubecsense-consumption-${period === "monthly" ? month : date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Consumption
          </h1>
          <p className="text-sm text-muted-foreground">
            Exact usage from meter totalizers — daily and monthly, per flat.
          </p>
        </div>
        <Button variant="outline" size="md" onClick={exportCsv} disabled={!data?.flats.length}>
          Quick CSV
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(["daily", "monthly"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {period === "daily" ? (
            <Input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto"
            />
          ) : (
            <Input
              type="month"
              value={month}
              max={thisMonthISO()}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
            />
          )}

          <Input
            placeholder="Search flat or owner…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ml-auto w-full sm:w-56"
          />
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading…
        </div>
      ) : data ? (
        <>
          {/* KPIs */}
          {kpis && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Flats"
                value={data.flatCount}
                sub={period === "monthly" ? month : date}
                icon={IconHome}
                tone="primary"
              />
              <StatCard
                label="Total consumption"
                value={litres(kpis.totalLitres)}
                sub={period === "daily" ? "That day" : "That month"}
                icon={IconDroplet}
                tone="success"
              />
              <StatCard
                label="Incomplete"
                value={kpis.incomplete}
                sub="Missing a reading in period"
                icon={IconAlert}
                tone={kpis.incomplete > 0 ? "warning" : "neutral"}
              />
              <StatCard
                label="Anomalies"
                value={kpis.anomalies}
                sub="Meter reset or replaced"
                icon={IconCheckCircle}
                tone={kpis.anomalies > 0 ? "destructive" : "neutral"}
              />
            </div>
          )}

          {/* Table */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No flats match.
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {filtered.map((f) => (
                  <FlatRow key={f.flat} entry={f} period={period} />
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
