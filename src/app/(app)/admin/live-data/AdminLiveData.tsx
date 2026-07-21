"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  ComposedChart,
  Bar,
  Line,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Badge,
  Button,
  Spinner,
} from "@/components/ui";
import {
  IconSearch,
  IconX,
  IconGauge,
  IconDroplet,
  IconHome,
  IconAlert,
} from "@/components/icons";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ExportDialog } from "./ExportDialog";

/* ----------------------------- API response types ---------------------------- */

interface Reading {
  date: string;
  index: number;
  consumptionLitres: number;
  totalizerLitres: number;
  intraday: number[];
  alerts: string[];
  status: string[];
  receivedAt: string | null;
}

interface Meter {
  deviceId: string;
  registrationId: string | null;
  location: string | null;
  totalConsumptionLitres: number;
  readings: Reading[];
}

interface FlatData {
  flat: string;
  ownerName?: string;
  ownerPhone?: string;
  totalConsumptionLitres: number;
  consumptionByDate: Record<string, number>;
  meters: Meter[];
}

interface LiveData {
  project: string | null;
  building: string | null;
  generatedAt: string;
  range: { from: string | null; to: string | null; dates: string[] } | null;
  flatCount: number;
  meterCount: number;
  flats: FlatData[];
  unassigned: Meter[];
}

/* --------------------------------- Helpers ---------------------------------- */

const litres = (n: number) => `${Math.round(n).toLocaleString("en-IN")} L`;

function latestReading(m: Meter): Reading | undefined {
  return m.readings[m.readings.length - 1];
}

/** Alerts + status flags from the most recent reading of a meter. */
function latestFlags(m: Meter): string[] {
  const r = latestReading(m);
  return r ? [...r.alerts, ...r.status] : [];
}

/**
 * Latest totalizer (lifetime meter reading) across a group of meters.
 * Returns null when none of them has reported a totalizer.
 */
function latestTotalizer(meters: Meter[]): number | null {
  let sum = 0;
  let found = false;
  for (const m of meters) {
    const r = latestReading(m);
    if (r && typeof r.totalizerLitres === "number") {
      sum += r.totalizerLitres;
      found = true;
    }
  }
  return found ? sum : null;
}

const ALERT_LABELS: Record<string, string> = {
  EmptyPipe: "Empty pipe",
  NoConsumption: "No consumption",
  ReverseFlow: "Reverse flow",
  LeakFlow: "Leak",
  ContiFlow: "Continuous flow",
  BurstPipe: "Burst pipe",
  MaxFlow: "Max flow",
  Freeze: "Freeze",
  BadTemp: "Bad temp",
  LowBat: "Low battery",
  Motion: "Motion",
  AirBubbles: "Air bubbles",
};

const STATUS_KEYS = new Set(["BadTemp", "LowBat", "Motion", "AirBubbles"]);

/** Sentinel for the "any alert" filter chip. */
const ANY_ALERT = "__any__";

type SortKey = "flat" | "total" | "latest" | "alerts";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "flat", label: "Flat no." },
  { key: "total", label: "Highest total" },
  { key: "latest", label: "Highest latest day" },
  { key: "alerts", label: "Most alerts" },
];

function FlagBadge({ flag }: { flag: string }) {
  return (
    <Badge tone={STATUS_KEYS.has(flag) ? "warning" : "destructive"}>
      {ALERT_LABELS[flag] || flag}
    </Badge>
  );
}

/* ---------------------------------- Charts ---------------------------------- */

const PRIMARY = "hsl(201 96% 38%)";
const SECONDARY = "hsl(187 72% 40%)";

function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-muted-foreground">
          {p.name}: {Math.round(p.value).toLocaleString("en-IN")} {unit || "L"}
        </p>
      ))}
    </div>
  );
}

function DailyChart({ data }: { data: { date: string; total: number }[] }) {
  const fmt = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    }),
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={fmt} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip unit="L" />} cursor={{ fill: "hsl(var(--muted))" }} />
        <Bar dataKey="total" name="Consumption" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function IntradayChart({ values }: { values: number[] }) {
  const hours = 24 / values.length;
  const data = values.map((v, i) => ({
    label: `${String(Math.round(i * hours)).padStart(2, "0")}:00`,
    value: v,
  }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip unit="L" />} cursor={{ fill: "hsl(var(--muted))" }} />
        <Bar dataKey="value" name="Litres" fill={SECONDARY} radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Day-wise kitchen/bathroom consumption for one flat, with the building's
 *  per-flat average overlaid for comparison. */
function FlatDailyChart({
  flat,
  dates,
  avgByDate,
}: {
  flat: FlatData;
  dates: string[];
  avgByDate: Record<string, number>;
}) {
  const data = dates.map((date) => {
    let kitchen = 0;
    let bathroom = 0;
    let other = 0;
    for (const m of flat.meters) {
      const r = m.readings.find((x) => x.date === date);
      if (!r) continue;
      const loc = (m.location || "").toLowerCase();
      if (loc === "kitchen") kitchen += r.consumptionLitres;
      else if (loc === "bathroom") bathroom += r.consumptionLitres;
      else other += r.consumptionLitres;
    }
    return {
      label: new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      }),
      Kitchen: kitchen,
      Bathroom: bathroom,
      Other: other,
      "Building avg": Math.round(avgByDate[date] || 0),
    };
  });
  const hasOther = data.some((d) => d.Other > 0);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip unit="L" />} cursor={{ fill: "hsl(var(--muted))" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        <Bar dataKey="Kitchen" stackId="a" fill={PRIMARY} maxBarSize={22} />
        <Bar
          dataKey="Bathroom"
          stackId="a"
          fill={SECONDARY}
          radius={hasOther ? undefined : [3, 3, 0, 0]}
          maxBarSize={22}
        />
        {hasOther && (
          <Bar
            dataKey="Other"
            stackId="a"
            fill="hsl(var(--muted-foreground))"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
        )}
        <Line
          type="monotone"
          dataKey="Building avg"
          stroke="hsl(var(--warning))"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------- Filter chip -------------------------------- */

function Chip({
  label,
  active,
  onClick,
  tone = "neutral",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "neutral" | "warning" | "destructive";
}) {
  const activeClass = {
    neutral: "bg-primary text-primary-foreground",
    warning: "bg-warning text-warning-foreground",
    destructive: "bg-destructive text-destructive-foreground",
  }[tone];
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? activeClass
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/* ------------------------------ Silent meters ------------------------------- */

interface SilentMeter {
  flat: string | null;
  deviceId: string;
  registrationId: string | null;
  location: string | null;
  lastSeen: string;
  daysSince: number;
  ownerName?: string;
  ownerPhone?: string;
}

/** Meters that were reporting but have stopped — flat batteries, lost signal. */
function SilentMeters() {
  const [silent, setSilent] = React.useState<SilentMeter[] | null>(null);
  const [latestDate, setLatestDate] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/live-data/silent?window=30", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || d.error) return;
        setSilent(d.silent || []);
        setLatestDate(d.latestDate || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!silent || silent.length === 0) return null;

  const shown = expanded ? silent : silent.slice(0, 5);

  return (
    <Card className="border-warning/40">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconAlert className="h-4 w-4 text-warning" />
            {silent.length} meter{silent.length === 1 ? "" : "s"} stopped
            reporting
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Last reading is older than the newest day
            {latestDate ? ` (${formatDate(latestDate)})` : ""} — check battery
            or connectivity.
          </p>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ul className="divide-y divide-border border-t border-border">
          {shown.map((m) => (
            <li
              key={m.deviceId}
              className="flex items-center justify-between gap-3 px-5 py-2.5"
            >
              <div className="min-w-0">
                <p className="tabular text-sm font-medium text-foreground">
                  {m.flat ? `Flat ${m.flat}` : "Unassigned"}
                  {m.location ? ` · ${m.location}` : ""}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.ownerName ? `${m.ownerName} · ` : ""}
                  {m.deviceId}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Badge tone={m.daysSince >= 3 ? "destructive" : "warning"}>
                  {m.daysSince}d silent
                </Badge>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Last {formatDate(m.lastSeen)}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {silent.length > 5 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full border-t border-border px-5 py-2.5 text-sm font-medium text-primary hover:bg-muted/40"
          >
            {expanded ? "Show less" : `Show all ${silent.length}`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- Stat card --------------------------------- */

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

/* ------------------------------ Main component ------------------------------- */

const REFRESH_MS = 60_000;

export function AdminLiveData() {
  const [data, setData] = React.useState<LiveData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [days, setDays] = React.useState(14);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<FlatData | null>(null);
  const [alertFilter, setAlertFilter] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<SortKey>("flat");
  const [exporting, setExporting] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/live-data?days=${days}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load live data.");
        setData(body);
        setError(null);
        setUpdatedAt(new Date());
      } catch (e: any) {
        setError(e?.message || "Failed to load live data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [days]
  );

  React.useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Silent auto-refresh so the page stays "live".
  React.useEffect(() => {
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  /** Alert/status flags present across the loaded flats, for the filter chips. */
  const availableFlags = React.useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const f of data.flats) {
      for (const flag of new Set(f.meters.flatMap((m) => latestFlags(m)))) {
        counts.set(flag, (counts.get(flag) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const filteredFlats = React.useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();

    const rows = data.flats.filter((f) => {
      if (q) {
        const hit =
          f.flat.toLowerCase().includes(q) ||
          (f.ownerName || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (alertFilter) {
        const flags = new Set(f.meters.flatMap((m) => latestFlags(m)));
        if (alertFilter === ANY_ALERT) {
          // "Any alert" means a real alert, not just a status flag.
          const hasAlert = f.meters.some(
            (m) => latestReading(m)?.alerts?.length
          );
          if (!hasAlert) return false;
        } else if (!flags.has(alertFilter)) {
          return false;
        }
      }
      return true;
    });

    const latestDate = data.range?.to || "";
    const alertCount = (f: FlatData) =>
      new Set(f.meters.flatMap((m) => latestFlags(m))).size;

    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "total":
          return b.totalConsumptionLitres - a.totalConsumptionLitres;
        case "latest":
          return (
            (b.consumptionByDate[latestDate] || 0) -
            (a.consumptionByDate[latestDate] || 0)
          );
        case "alerts":
          return alertCount(b) - alertCount(a);
        case "flat":
        default: {
          const na = parseInt(a.flat, 10);
          const nb = parseInt(b.flat, 10);
          if (Number.isNaN(na) || Number.isNaN(nb)) {
            return String(a.flat).localeCompare(String(b.flat));
          }
          return na - nb;
        }
      }
    });
    return sorted;
  }, [data, query, alertFilter, sort]);

  const totalsByDate = React.useMemo(() => {
    if (!data?.range) return [];
    const map = new Map<string, number>(data.range.dates.map((d) => [d, 0]));
    for (const f of data.flats) {
      for (const [d, v] of Object.entries(f.consumptionByDate)) {
        map.set(d, (map.get(d) || 0) + v);
      }
    }
    for (const m of data.unassigned) {
      for (const r of m.readings) {
        map.set(r.date, (map.get(r.date) || 0) + r.consumptionLitres);
      }
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));
  }, [data]);

  const kpis = React.useMemo(() => {
    if (!data) return null;
    const allMeters = [
      ...data.flats.flatMap((f) => f.meters),
      ...data.unassigned,
    ];
    const totalLitres = allMeters.reduce(
      (a, m) => a + m.totalConsumptionLitres,
      0
    );
    const alertMeters = allMeters.filter((m) =>
      latestReading(m)?.alerts?.length
    ).length;
    const latestDate = data.range?.to || null;
    const latestLitres = latestDate
      ? totalsByDate.find((t) => t.date === latestDate)?.total || 0
      : 0;
    return { totalLitres, alertMeters, latestDate, latestLitres };
  }, [data, totalsByDate]);

  const exportCsv = () => {
    if (!data) return;
    const header = [
      "Flat",
      "Owner",
      "Location",
      "Device ID",
      "Date",
      "Consumption (L)",
      "Totalizer (L)",
      "Alerts",
      "Status",
    ];
    const rows: (string | number)[][] = [];
    const push = (flat: string, owner: string, m: Meter) => {
      for (const r of m.readings) {
        rows.push([
          flat,
          owner,
          m.location || "",
          m.deviceId,
          r.date,
          r.consumptionLitres,
          r.totalizerLitres,
          r.alerts.join("; "),
          r.status.join("; "),
        ]);
      }
    };
    for (const f of data.flats)
      for (const m of f.meters) push(f.flat, f.ownerName || "", m);
    for (const m of data.unassigned) push("Unassigned", "", m);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qubecsense-live-data-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading live meter data…
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="space-y-3 py-12 text-center">
          <IconAlert className="mx-auto h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => load()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.range) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No meter readings received yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[160px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search flat or owner…"
            className="pl-9"
          />
        </div>
        <Select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-auto"
          aria-label="Date range"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={92}>Last 92 days</option>
        </Select>
        <Button variant="outline" size="md" onClick={() => load()} loading={refreshing}>
          Refresh
        </Button>
        <Button variant="outline" size="md" onClick={exportCsv}>
          Quick CSV
        </Button>
        <Button variant="outline" size="md" onClick={() => setExporting(true)}>
          Export…
        </Button>
      </div>

      {/* Alert filters + sort */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            label="All flats"
            active={alertFilter === null}
            onClick={() => setAlertFilter(null)}
          />
          <Chip
            label="Any alert"
            active={alertFilter === ANY_ALERT}
            onClick={() =>
              setAlertFilter(alertFilter === ANY_ALERT ? null : ANY_ALERT)
            }
            tone="destructive"
          />
          {availableFlags.map(([flag, count]) => (
            <Chip
              key={flag}
              label={`${ALERT_LABELS[flag] || flag} · ${count}`}
              active={alertFilter === flag}
              onClick={() => setAlertFilter(alertFilter === flag ? null : flag)}
              tone={STATUS_KEYS.has(flag) ? "warning" : "destructive"}
            />
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 w-auto text-sm"
            aria-label="Sort flats"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Silent meters */}
      <SilentMeters />

      {/* Meta line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(data.project || data.building) && (
          <span className="font-medium text-foreground">
            {[data.project, data.building].filter(Boolean).join(" · ")}
          </span>
        )}
        <span>
          {formatDate(data.range.from)} – {formatDate(data.range.to)}
        </span>
        {updatedAt && <span>Updated {updatedAt.toLocaleTimeString("en-IN")}</span>}
        {error && <span className="text-destructive">Last refresh failed: {error}</span>}
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Flats reporting"
            value={data.flatCount}
            sub={`${data.meterCount} meters`}
            icon={IconHome}
            tone="primary"
          />
          <StatCard
            label={`Consumption · ${days}d`}
            value={litres(kpis.totalLitres)}
            sub="All meters"
            icon={IconDroplet}
            tone="success"
          />
          <StatCard
            label="Latest day"
            value={litres(kpis.latestLitres)}
            sub={kpis.latestDate ? formatDate(kpis.latestDate) : "—"}
            icon={IconGauge}
            tone="neutral"
          />
          <StatCard
            label="Meters with alerts"
            value={kpis.alertMeters}
            sub="On latest reading"
            icon={IconAlert}
            tone={kpis.alertMeters > 0 ? "destructive" : "neutral"}
          />
        </div>
      )}

      {/* Daily consumption chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily consumption · all meters</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyChart data={totalsByDate} />
        </CardContent>
      </Card>

      {/* Flat table */}
      {filteredFlats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No flats match your search.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Flat</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium">Kitchen</th>
                  <th className="px-5 py-3 font-medium">Bathroom</th>
                  <th className="px-5 py-3 font-medium">Total · {days}d</th>
                  <th className="px-5 py-3 font-medium">Latest day</th>
                  <th className="px-5 py-3 font-medium">Totalizer</th>
                  <th className="px-5 py-3 font-medium">Alerts</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFlats.map((f) => {
                  const kitchen = f.meters.filter(
                    (m) => (m.location || "").toLowerCase() === "kitchen"
                  );
                  const bathroom = f.meters.filter(
                    (m) => (m.location || "").toLowerCase() === "bathroom"
                  );
                  const other = f.meters.filter(
                    (m) =>
                      !["kitchen", "bathroom"].includes(
                        (m.location || "").toLowerCase()
                      )
                  );
                  const sum = (arr: Meter[]) =>
                    arr.reduce((a, m) => a + m.totalConsumptionLitres, 0);
                  const flags = [
                    ...new Set(f.meters.flatMap((m) => latestFlags(m))),
                  ];
                  const latest = data.range?.to
                    ? f.consumptionByDate[data.range.to] || 0
                    : 0;
                  // Lifetime meter readings, kept per location so they can be
                  // checked against the physical meters.
                  const kitchenTotalizer = latestTotalizer(kitchen);
                  const bathroomTotalizer = latestTotalizer(bathroom);
                  const otherTotalizer = latestTotalizer(other);
                  return (
                    <tr key={f.flat} className="hover:bg-muted/40">
                      <td className="tabular px-5 py-3 font-semibold">{f.flat}</td>
                      <td className="max-w-[160px] truncate px-5 py-3 text-muted-foreground">
                        {f.ownerName || "—"}
                      </td>
                      <td className="tabular px-5 py-3 text-muted-foreground">
                        {kitchen.length ? litres(sum(kitchen)) : "—"}
                      </td>
                      <td className="tabular px-5 py-3 text-muted-foreground">
                        {bathroom.length ? litres(sum(bathroom)) : "—"}
                        {other.length > 0 && (
                          <span className="ml-1 text-xs">
                            (+{other.length} other)
                          </span>
                        )}
                      </td>
                      <td className="tabular px-5 py-3 font-medium text-foreground">
                        {litres(f.totalConsumptionLitres)}
                      </td>
                      <td className="tabular px-5 py-3 text-muted-foreground">
                        {litres(latest)}
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3 text-xs text-muted-foreground">
                        {kitchenTotalizer === null &&
                        bathroomTotalizer === null &&
                        otherTotalizer === null ? (
                          "—"
                        ) : (
                          <span className="leading-tight">
                            {kitchenTotalizer !== null && (
                              <span className="block">
                                K {litres(kitchenTotalizer)}
                              </span>
                            )}
                            {bathroomTotalizer !== null && (
                              <span className="block">
                                B {litres(bathroomTotalizer)}
                              </span>
                            )}
                            {otherTotalizer !== null && (
                              <span className="block">
                                O {litres(otherTotalizer)}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {flags.length === 0 ? (
                          <Badge tone="success">OK</Badge>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {flags.slice(0, 3).map((fl) => (
                              <FlagBadge key={fl} flag={fl} />
                            ))}
                            {flags.length > 3 && (
                              <Badge tone="neutral">+{flags.length - 3}</Badge>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setActive(f)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <ul className="divide-y divide-border md:hidden">
            {filteredFlats.map((f) => {
              const flags = [...new Set(f.meters.flatMap((m) => latestFlags(m)))];
              return (
                <li key={f.flat}>
                  <button
                    onClick={() => setActive(f)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="tabular font-semibold text-foreground">
                        Flat {f.flat}
                        {f.ownerName && (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            · {f.ownerName}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {litres(f.totalConsumptionLitres)} · {f.meters.length} meter
                        {f.meters.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    {flags.length === 0 ? (
                      <Badge tone="success">OK</Badge>
                    ) : (
                      <Badge tone="destructive">
                        {flags.length} alert{flags.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Unassigned meters */}
      {data.unassigned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Unassigned meters</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ul className="divide-y divide-border">
              {data.unassigned.map((m) => {
                const flags = latestFlags(m);
                return (
                  <li
                    key={m.deviceId}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                  >
                    <div>
                      <p className="tabular text-sm font-medium text-foreground">
                        {m.deviceId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Not in the registration sheet
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular text-sm text-muted-foreground">
                        {litres(m.totalConsumptionLitres)}
                      </span>
                      {flags.slice(0, 2).map((fl) => (
                        <FlagBadge key={fl} flag={fl} />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {exporting && (
        <ExportDialog
          defaultFrom={data.range.from || ""}
          defaultTo={data.range.to || ""}
          onClose={() => setExporting(false)}
        />
      )}

      {active && (
        <FlatDetailModal
          flat={active}
          dates={data.range.dates}
          avgByDate={Object.fromEntries(
            totalsByDate.map((t) => [
              t.date,
              data.flatCount ? t.total / data.flatCount : 0,
            ])
          )}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------- Detail modal -------------------------------- */

function FlatDetailModal({
  flat,
  dates,
  avgByDate,
  onClose,
}: {
  flat: FlatData;
  dates: string[];
  avgByDate: Record<string, number>;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl animate-fade-in sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3.5">
          <div>
            <h2 className="tabular text-lg font-bold text-foreground">
              Flat {flat.flat}
            </h2>
            <p className="text-sm text-muted-foreground">
              {flat.ownerName && (
                <>
                  {flat.ownerName}
                  {flat.ownerPhone ? ` · ${flat.ownerPhone}` : ""}
                  {" — "}
                </>
              )}
              {litres(flat.totalConsumptionLitres)} in range ·{" "}
              {flat.meters.length} meter{flat.meters.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Day-wise consumption vs building average
            </p>
            <FlatDailyChart flat={flat} dates={dates} avgByDate={avgByDate} />
          </div>

          {flat.meters.map((m) => (
            <MeterDetail key={m.deviceId} meter={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MeterDetail({ meter }: { meter: Meter }) {
  const latest = latestReading(meter);
  const isKitchen = (meter.location || "").toLowerCase() === "kitchen";
  const Icon = isKitchen ? IconGauge : IconDroplet;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Icon className="h-4 w-4 text-secondary" />
            {meter.location || "Meter"}
          </p>
          <p className="tabular text-xs text-muted-foreground">
            Device {meter.deviceId}
            {meter.registrationId && meter.registrationId !== meter.deviceId
              ? ` · Sheet ${meter.registrationId}`
              : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular text-sm font-semibold text-foreground">
            {litres(meter.totalConsumptionLitres)}
          </p>
          <p className="text-xs text-muted-foreground">in range</p>
        </div>
      </div>

      {latest && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Latest reading</p>
            <p className="font-medium text-foreground">{formatDate(latest.date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Totalizer</p>
            <p className="tabular font-medium text-foreground">
              {litres(latest.totalizerLitres)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="font-medium text-foreground">
              {latest.receivedAt ? formatDateTime(latest.receivedAt) : "—"}
            </p>
          </div>
        </div>
      )}

      {latest && (latest.alerts.length > 0 || latest.status.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...latest.alerts, ...latest.status].map((fl) => (
            <FlagBadge key={fl} flag={fl} />
          ))}
        </div>
      )}

      {latest && latest.intraday.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs text-muted-foreground">
            Intraday · {formatDate(latest.date)} · litres per{" "}
            {24 / latest.intraday.length}h
          </p>
          <IntradayChart values={latest.intraday} />
        </div>
      )}

      {meter.readings.length > 1 && (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-1 text-xs text-muted-foreground">Daily readings</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Date</th>
                <th className="py-1.5 pr-3 font-medium">Consumption</th>
                <th className="py-1.5 pr-3 font-medium">Totalizer</th>
                <th className="py-1.5 font-medium">Alerts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...meter.readings].reverse().map((r) => (
                <tr key={r.index}>
                  <td className="py-1.5 pr-3 text-foreground">{formatDate(r.date)}</td>
                  <td className="tabular py-1.5 pr-3 text-muted-foreground">
                    {litres(r.consumptionLitres)}
                  </td>
                  <td className="tabular py-1.5 pr-3 text-muted-foreground">
                    {litres(r.totalizerLitres)}
                  </td>
                  <td className="py-1.5 text-muted-foreground">
                    {[...r.alerts, ...r.status].join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
