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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { IconDroplet, IconGauge, IconRupee } from "@/components/icons";
import { formatDate } from "@/lib/utils";
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

export function ResidentView({
  flat,
  dates,
  month,
  monthLitres,
  billAmount,
  breakdown,
  fixedCharge,
  tariffConfigured,
}: {
  flat: LiveFlat | null;
  dates: string[];
  month: string;
  monthLitres: number;
  billAmount: number;
  breakdown: SlabCharge[];
  fixedCharge: number;
  tariffConfigured: boolean;
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
    </div>
  );
}
