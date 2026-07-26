"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
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
  Button,
  Input,
  Textarea,
  Spinner,
} from "@/components/ui";
import {
  IconDroplet,
  IconGauge,
  IconRupee,
  IconChevronRight,
  IconAlert,
  IconCheckCircle,
} from "@/components/icons";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import type { LiveFlat, LiveMeter } from "@/lib/liveData";

interface SlabCharge {
  litres: number;
  ratePerKl: number;
  amount: number;
}

const litres = (n: number) => `${Math.round(n).toLocaleString("en-IN")} L`;
const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function monthLabel(m: string): string {
  return new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

const PRIMARY = "hsl(201 96% 38%)";
const SECONDARY = "hsl(187 72% 40%)";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-muted-foreground">
          {p.name}: {Math.round(p.value).toLocaleString("en-IN")} L
        </p>
      ))}
    </div>
  );
}

function latestReading(m: LiveMeter) {
  return m.readings[m.readings.length - 1];
}

/* --------------------------------- History ---------------------------------- */

interface DayHistory {
  date: string;
  total: number;
  hours: number;
  buckets: { label: string; Kitchen: number; Bathroom: number; Other: number }[];
}

/** Per-day breakdown into the meter's intraday buckets (12 × 2 hours). */
function buildHistory(flat: LiveFlat, dates: string[]): DayHistory[] {
  const out: DayHistory[] = [];

  // Newest day first.
  for (const date of [...dates].sort((a, b) => b.localeCompare(a))) {
    const entries = flat.meters
      .map((m) => ({ meter: m, reading: m.readings.find((x) => x.date === date) }))
      .filter((e) => e.reading);
    if (!entries.length) continue;

    const total = entries.reduce(
      (a, e) => a + (e.reading?.consumptionLitres || 0),
      0
    );
    const bucketCount = Math.max(
      ...entries.map((e) => e.reading?.intraday?.length || 0)
    );
    if (!bucketCount) continue;

    const hours = 24 / bucketCount;
    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      let kitchen = 0;
      let bathroom = 0;
      let other = 0;
      for (const { meter, reading } of entries) {
        const v = reading?.intraday?.[i] || 0;
        const loc = (meter.location || "").toLowerCase();
        if (loc === "kitchen") kitchen += v;
        else if (loc === "bathroom") bathroom += v;
        else other += v;
      }
      return {
        label: `${String(Math.round(i * hours)).padStart(2, "0")}:00`,
        Kitchen: kitchen,
        Bathroom: bathroom,
        Other: other,
      };
    });

    out.push({ date, total, hours, buckets });
  }

  return out;
}

function HistorySection({
  flat,
  dates,
}: {
  flat: LiveFlat;
  dates: string[];
}) {
  const history = React.useMemo(() => buildHistory(flat, dates), [flat, dates]);
  // Newest day expanded by default.
  const [open, setOpen] = React.useState<string | null>(history[0]?.date ?? null);

  if (!history.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="pb-5 pt-0 text-sm text-muted-foreground">
          No day-wise history yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tap a day to see usage in {history[0].hours}-hour blocks.
        </p>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ul className="divide-y divide-border border-t border-border">
          {history.map((day) => {
            const expanded = open === day.date;
            const hasOther = day.buckets.some((b) => b.Other > 0);
            return (
              <li key={day.date}>
                <button
                  onClick={() => setOpen(expanded ? null : day.date)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    <IconChevronRight
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        expanded ? "rotate-90" : ""
                      }`}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {formatDate(day.date)}
                    </span>
                  </div>
                  <span className="tabular text-sm text-muted-foreground">
                    {litres(day.total)}
                  </span>
                </button>

                {expanded && (
                  <div className="px-3 pb-4">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={day.buckets}
                        margin={{ top: 4, right: 8, left: -14, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="hsl(var(--border))"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{
                            fontSize: 10,
                            fill: "hsl(var(--muted-foreground))",
                          }}
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{
                            fontSize: 10,
                            fill: "hsl(var(--muted-foreground))",
                          }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          content={<ChartTooltip />}
                          cursor={{ fill: "hsl(var(--muted))" }}
                        />
                        <Bar
                          dataKey="Kitchen"
                          stackId="a"
                          fill={PRIMARY}
                          maxBarSize={18}
                        />
                        <Bar
                          dataKey="Bathroom"
                          stackId="a"
                          fill={SECONDARY}
                          radius={hasOther ? undefined : [3, 3, 0, 0]}
                          maxBarSize={18}
                        />
                        {hasOther && (
                          <Bar
                            dataKey="Other"
                            stackId="a"
                            fill="hsl(var(--muted-foreground))"
                            radius={[3, 3, 0, 0]}
                            maxBarSize={18}
                          />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Recent usage -------------------------------- */

/** Trend vs a previous value. For water, using less is good (down = green). */
function Trend({
  current,
  previous,
  suffix,
}: {
  current: number;
  previous: number | null;
  suffix: string;
}) {
  if (previous == null || previous <= 0) {
    return <span className="text-xs text-muted-foreground">no prior data</span>;
  }
  const diff = current - previous;
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  if (pct === 0) {
    return <span className="text-xs text-muted-foreground">about the same {suffix}</span>;
  }
  const up = diff > 0;
  return (
    <span
      className={`text-xs font-medium ${up ? "text-warning" : "text-success"}`}
    >
      {up ? "▲" : "▼"} {pct}% {suffix}
    </span>
  );
}

function RecentUsageCard({
  recent,
}: {
  recent: {
    latestDate: string;
    latestLitres: number;
    prevDayLitres: number | null;
    weekToDate: number;
    lastWeekSame: number | null;
  };
}) {
  // "Yesterday" if the latest reading is literally yesterday, else "Latest day".
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const isYesterday = recent.latestDate === y.toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent usage</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">
            {isYesterday ? "Yesterday" : "Latest day"} ·{" "}
            {formatDate(recent.latestDate)}
          </p>
          <p className="tabular mt-1 text-2xl font-bold text-foreground">
            {litres(recent.latestLitres)}
          </p>
          <p className="mt-0.5">
            <Trend
              current={recent.latestLitres}
              previous={recent.prevDayLitres}
              suffix="vs day before"
            />
          </p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">This week so far</p>
          <p className="tabular mt-1 text-2xl font-bold text-foreground">
            {litres(recent.weekToDate)}
          </p>
          <p className="mt-0.5">
            <Trend
              current={recent.weekToDate}
              previous={recent.lastWeekSame}
              suffix="vs last week"
            />
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Budget / alert ------------------------------ */

type BudgetPeriod = "weekly" | "monthly";

function BudgetCard({
  usage,
  initial,
}: {
  usage: { weekly: number; monthly: number };
  initial: { enabled: boolean; litres: number | null; period: BudgetPeriod };
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [period, setPeriod] = React.useState<BudgetPeriod>(initial.period);
  const [limit, setLimit] = React.useState(
    initial.litres != null ? String(initial.litres) : ""
  );
  const [saving, setSaving] = React.useState(false);
  // The saved settings drive the live status line; edits only take effect on save.
  const [saved, setSaved] = React.useState(initial);

  const used = saved.period === "weekly" ? usage.weekly : usage.monthly;
  const active = saved.enabled && saved.litres != null && saved.litres > 0;
  const pct = active ? Math.min(100, (used / (saved.litres || 1)) * 100) : 0;
  const over = active && used > (saved.litres || 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/resident/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          period,
          litres: enabled ? Number(limit) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not save.", "error");
        return;
      }
      setSaved({ enabled: data.enabled, litres: data.litres, period: data.period });
      toast(
        data.enabled ? "Usage alert saved." : "Usage alert turned off.",
        "success"
      );
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Usage alert</CardTitle>
        {active &&
          (over ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
              <IconAlert className="h-3.5 w-3.5" /> Over limit
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <IconCheckCircle className="h-3.5 w-3.5" /> Within limit
            </span>
          ))}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live status vs the saved limit */}
        {active && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Used {saved.period === "weekly" ? "this week" : "this month"}
              </span>
              <span className="tabular font-medium text-foreground">
                {litres(used)} / {litres(saved.litres || 0)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  over ? "bg-destructive" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {over && (
              <p className="mt-1.5 text-xs text-destructive">
                {litres(used - (saved.litres || 0))} over your limit. We&apos;ll
                email you about this.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Get an email if your flat&apos;s water use goes over a limit you set.
        </p>

        {/* Enable toggle */}
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            Email me when I go over
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              enabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>

        {enabled && (
          <div className="space-y-3">
            {/* Period selector */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["weekly", "monthly"] as BudgetPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-md py-1.5 text-sm font-medium capitalize transition-colors ${
                    period === p
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Limit input */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Limit ({period === "weekly" ? "per week" : "per month"})
              </label>
              <div className="relative">
                <Input
                  inputMode="numeric"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="e.g. 30000"
                  className="pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  litres
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                So far {period === "weekly" ? "this week" : "this month"}:{" "}
                {litres(period === "weekly" ? usage.weekly : usage.monthly)}
              </p>
            </div>
          </div>
        )}

        <Button
          size="md"
          onClick={save}
          loading={saving}
          disabled={enabled && (!limit || Number(limit) <= 0)}
          className="w-full"
        >
          Save alert settings
        </Button>
      </CardContent>
    </Card>
  );
}

export function ResidentView({
  flat,
  dates,
  month,
  monthLitres,
  billAmount,
  breakdown,
  fixedCharge,
  tariffConfigured,
  usage,
  budget,
  recent,
}: {
  flat: LiveFlat | null;
  dates: string[];
  month: string;
  monthLitres: number;
  billAmount: number;
  breakdown: SlabCharge[];
  fixedCharge: number;
  tariffConfigured: boolean;
  usage: { weekly: number; monthly: number };
  budget: { enabled: boolean; litres: number | null; period: "weekly" | "monthly" };
  recent: {
    latestDate: string;
    latestLitres: number;
    prevDayLitres: number | null;
    weekToDate: number;
    lastWeekSame: number | null;
  } | null;
}) {
  if (!flat || flat.meters.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No meter readings have been received for your flat yet. Please check
          back once your meters start reporting.
        </CardContent>
      </Card>
    );
  }

  const chartData = dates.map((date) => {
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
    };
  });
  const hasOther = chartData.some((d) => d.Other > 0);

  let from = 0;

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">This month</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <IconDroplet className="h-5 w-5" />
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              {litres(monthLitres)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {monthLabel(month)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Estimated bill</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success">
                <IconRupee className="h-5 w-5" />
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-bold text-foreground sm:text-3xl">
              {tariffConfigured ? rupees(billAmount) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tariffConfigured ? "So far this month" : "Tariff not set"}
            </p>
          </CardContent>
        </Card>

      </div>

      {/* Recent usage — latest day + week-over-week */}
      {recent && <RecentUsageCard recent={recent} />}

      {/* Usage alert / budget */}
      <BudgetCard usage={usage} initial={budget} />

      {/* Daily chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily consumption</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
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
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "hsl(var(--muted))" }}
              />
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
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bill breakdown */}
      {tariffConfigured && (
        <Card>
          <CardHeader>
            <CardTitle>Bill · {monthLabel(month)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {breakdown.map((b, i) => {
                const label = `${from.toLocaleString("en-IN")}–${(from + b.litres).toLocaleString("en-IN")} L @ ₹${b.ratePerKl}/kL`;
                from += b.litres;
                return (
                  <li key={i} className="flex justify-between">
                    <span>{label}</span>
                    <span className="tabular">{rupees(b.amount)}</span>
                  </li>
                );
              })}
              {fixedCharge > 0 && (
                <li className="flex justify-between">
                  <span>Fixed charge</span>
                  <span className="tabular">{rupees(fixedCharge)}</span>
                </li>
              )}
              <li className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
                <span>Total so far</span>
                <span className="tabular">{rupees(billAmount)}</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Day-wise history with intraday detail */}
      <HistorySection flat={flat} dates={dates} />

      {/* Per-meter detail */}
      <Card>
        <CardHeader>
          <CardTitle>Your meters</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <ul className="divide-y divide-border">
            {flat.meters.map((m) => {
              const r = latestReading(m);
              return (
                <li
                  key={m.deviceId}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-secondary">
                      {(m.location || "").toLowerCase() === "kitchen" ? (
                        <IconGauge className="h-4 w-4" />
                      ) : (
                        <IconDroplet className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {m.location || "Meter"}
                      </p>
                      <p className="tabular text-xs text-muted-foreground">
                        ID {m.registrationId || m.deviceId}
                      </p>
                      <p className="tabular text-xs text-muted-foreground">
                        {r ? `Latest ${formatDate(r.date)}` : "No reading"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm font-medium text-foreground">
                      {r ? litres(r.totalizerLitres) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">totalizer</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Contact the admin / report a problem */}
      <ContactCard />
    </div>
  );
}

/* --------------------------- Contact admin / chat --------------------------- */

interface ChatMessage {
  id: string;
  sender: "resident" | "admin";
  senderName: string;
  body: string;
  category: string | null;
  createdAt: string;
}

const PROBLEMS = [
  "Suspected leak",
  "Meter not working",
  "Billing question",
  "Other",
];

function ContactCard() {
  const { toast } = useToast();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/resident/messages", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setMessages(data.messages || []);
    } catch {
      /* ignore transient errors */
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const pickProblem = (p: string) => {
    setCategory(p);
    setBody((b) => (b ? b : `${p}: `));
    taRef.current?.focus();
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch("/api/resident/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not send.", "error");
        return;
      }
      setMessages((m) => [...m, data.message]);
      setBody("");
      setCategory(null);
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact the manager</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Report a problem or ask a question. You&apos;ll get a reply here and by
          email.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Report-a-problem quick buttons */}
        <div className="flex flex-wrap gap-1.5">
          {PROBLEMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => pickProblem(p)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                category === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Thread */}
        <div
          ref={scrollRef}
          className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3"
        >
          {!loaded ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Loading…
            </div>
          ) : messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No messages yet. Pick a problem above or type below to start.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === "resident" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.sender === "resident"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-card text-foreground shadow-sm"
                  }`}
                >
                  {m.category && (
                    <p
                      className={`mb-0.5 text-[11px] font-semibold ${
                        m.sender === "resident"
                          ? "text-primary-foreground/80"
                          : "text-primary"
                      }`}
                    >
                      {m.category}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`mt-0.5 text-[10px] ${
                      m.sender === "resident"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {m.sender === "admin" ? "Manager · " : ""}
                    {new Date(m.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Composer */}
        <form onSubmit={send} className="space-y-2">
          <Textarea
            ref={taRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your message…"
            rows={2}
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="md"
              loading={sending}
              disabled={!body.trim()}
            >
              Send
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
