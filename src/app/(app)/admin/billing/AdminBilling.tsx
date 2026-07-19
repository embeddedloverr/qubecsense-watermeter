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
  Label,
} from "@/components/ui";
import { IconX, IconAlert, IconDroplet, IconRupee, IconHome } from "@/components/icons";
import { useToast } from "@/components/Toast";

/* ----------------------------------- Types ---------------------------------- */

interface Slab {
  limitLitres: number | null;
  ratePerKl: number;
}

interface SlabCharge {
  litres: number;
  ratePerKl: number;
  amount: number;
}

interface BillRow {
  flat: string;
  ownerName: string;
  ownerPhone: string;
  litres: number;
  meters: { deviceId: string; location: string | null; litres: number }[];
  breakdown: SlabCharge[];
  fixedCharge: number;
  amount: number;
}

interface Report {
  month: string;
  project: string | null;
  building: string | null;
  generatedAt: string;
  coverage: { from: string | null; to: string | null; days: number };
  tariff: { slabs: Slab[]; fixedCharge: number; configured: boolean };
  flatCount: number;
  totalLitres: number;
  totalAmount: number;
  rows: BillRow[];
}

/* --------------------------------- Helpers ---------------------------------- */

const litres = (n: number) => `${Math.round(n).toLocaleString("en-IN")} L`;
const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  return new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

/* ------------------------------- Tariff editor ------------------------------- */

interface SlabDraft {
  limit: string; // "" = open-ended (last slab)
  rate: string;
}

function TariffEditor({
  onSaved,
}: {
  onSaved: (slabs: Slab[], fixedCharge: number) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [slabs, setSlabs] = React.useState<SlabDraft[]>([]);
  const [fixed, setFixed] = React.useState("0");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/billing/tariff")
      .then((r) => r.json())
      .then((d) => {
        const s: Slab[] = d.tariff?.slabs || [];
        setSlabs(
          s.length
            ? s.map((x) => ({
                limit: x.limitLitres === null ? "" : String(x.limitLitres),
                rate: String(x.ratePerKl),
              }))
            : [{ limit: "", rate: "" }]
        );
        setFixed(String(d.tariff?.fixedCharge ?? 0));
        onSaved(s, d.tariff?.fixedCharge ?? 0);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (i: number, field: keyof SlabDraft, value: string) => {
    setSlabs((prev) =>
      prev.map((s, j) => (j === i ? { ...s, [field]: value } : s))
    );
  };

  const addSlab = () =>
    setSlabs((prev) => {
      const copy = [...prev];
      // The previous last slab needs a limit before a new one goes below it.
      return [...copy, { limit: "", rate: "" }];
    });

  const removeSlab = (i: number) =>
    setSlabs((prev) => prev.filter((_, j) => j !== i));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        slabs: slabs.map((s) => ({
          limitLitres: s.limit.trim() === "" ? null : Number(s.limit),
          ratePerKl: Number(s.rate),
        })),
        fixedCharge: Number(fixed) || 0,
      };
      const res = await fetch("/api/billing/tariff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save tariff.");
        return;
      }
      toast("Tariff saved.", "success");
      onSaved(data.tariff.slabs, data.tariff.fixedCharge);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="print:hidden">
        <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading tariff…
        </CardContent>
      </Card>
    );
  }

  let prevLimit = 0;
  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Slab-wise tariff</CardTitle>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Each slab prices the consumption falling between the previous limit
          and its own. Leave the last limit empty for &ldquo;above&rdquo;.
          Rates are ₹ per kilolitre (1000 L).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {slabs.map((s, i) => {
          const from = prevLimit;
          const parsed = Number(s.limit);
          if (s.limit.trim() !== "" && Number.isFinite(parsed)) prevLimit = parsed;
          const isLast = i === slabs.length - 1;
          return (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="w-40 min-w-0 flex-1">
                <Label className="text-xs">
                  {i === 0 ? "Up to (L)" : `From ${from.toLocaleString("en-IN")} L up to`}
                </Label>
                <Input
                  inputMode="numeric"
                  value={s.limit}
                  onChange={(e) => update(i, "limit", e.target.value)}
                  placeholder={isLast ? "No limit (above)" : "e.g. 10000"}
                />
              </div>
              <div className="w-36 min-w-0 flex-1">
                <Label className="text-xs">Rate (₹/kL)</Label>
                <Input
                  inputMode="decimal"
                  value={s.rate}
                  onChange={(e) => update(i, "rate", e.target.value)}
                  placeholder="e.g. 25"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove slab ${i + 1}`}
                onClick={() => removeSlab(i)}
                disabled={slabs.length === 1}
              >
                <IconX className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" size="sm" onClick={addSlab}>
            + Add slab
          </Button>
          <div className="ml-auto w-44">
            <Label className="text-xs">Fixed charge / flat (₹)</Label>
            <Input
              inputMode="decimal"
              value={fixed}
              onChange={(e) => setFixed(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button size="md" onClick={save} loading={saving}>
            Save tariff
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Main component ------------------------------- */

export function AdminBilling() {
  const [month, setMonth] = React.useState(currentMonth());
  const [report, setReport] = React.useState<Report | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<BillRow | null>(null);
  const [tariffConfigured, setTariffConfigured] = React.useState(true);

  const generate = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing/report?month=${month}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to build the report.");
      setReport(data);
    } catch (e: any) {
      setError(e?.message || "Failed to build the report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  React.useEffect(() => {
    generate();
  }, [generate]);

  const exportCsv = () => {
    if (!report) return;
    const header = [
      "Flat",
      "Owner",
      "Phone",
      "Consumption (L)",
      ...report.tariff.slabs.map((_, i) => `Slab ${i + 1} (₹)`),
      "Fixed charge (₹)",
      "Amount (₹)",
    ];
    const rows = report.rows.map((r) => [
      r.flat,
      r.ownerName,
      r.ownerPhone,
      r.litres,
      ...report.tariff.slabs.map((_, i) =>
        (r.breakdown[i]?.amount ?? 0).toFixed(2)
      ),
      r.fixedCharge.toFixed(2),
      r.amount.toFixed(2),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qubecsense-bills-${report.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <TariffEditor
        onSaved={(slabs) => {
          setTariffConfigured(slabs.length > 0);
          generate();
        }}
      />

      {/* Report controls */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-auto"
          aria-label="Billing month"
        />
        <Button variant="outline" size="md" onClick={generate} loading={loading}>
          Refresh report
        </Button>
        <Button variant="outline" size="md" onClick={exportCsv} disabled={!report}>
          Export CSV
        </Button>
        <Button
          variant="outline"
          size="md"
          onClick={() => window.print()}
          disabled={!report}
        >
          Print
        </Button>
      </div>

      {!tariffConfigured && (
        <Card className="border-warning/50 print:hidden">
          <CardContent className="flex items-center gap-2.5 py-3.5 text-sm text-muted-foreground">
            <IconAlert className="h-5 w-5 shrink-0 text-warning" />
            No tariff configured yet — amounts below are ₹0. Set your slab
            rates above and save.
          </CardContent>
        </Card>
      )}

      {loading && !report ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Spinner className="h-5 w-5" /> Building the report…
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="space-y-3 py-12 text-center">
            <IconAlert className="mx-auto h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={generate}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : report ? (
        <>
          {/* Print header */}
          <div className="hidden print:block">
            <h2 className="text-lg font-bold">
              Water bill — {monthLabel(report.month)}
            </h2>
            <p className="text-sm">
              {[report.project, report.building].filter(Boolean).join(" · ")}
            </p>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {monthLabel(report.month)}
            </span>
            {report.coverage.days > 0 ? (
              <span>
                Data: {report.coverage.from} → {report.coverage.to} (
                {report.coverage.days} day{report.coverage.days === 1 ? "" : "s"})
              </span>
            ) : (
              <span>No readings in this month yet.</span>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:hidden">
            <KpiCard
              label="Flats billed"
              value={String(report.flatCount)}
              icon={IconHome}
            />
            <KpiCard
              label="Consumption"
              value={litres(report.totalLitres)}
              icon={IconDroplet}
            />
            <KpiCard
              label="Total billed"
              value={rupees(report.totalAmount)}
              icon={IconRupee}
            />
            <KpiCard
              label="Average bill"
              value={
                report.flatCount
                  ? rupees(report.totalAmount / report.flatCount)
                  : "—"
              }
              icon={IconRupee}
            />
          </div>

          {/* Bills table */}
          {report.rows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No consumption recorded for this month.
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden print:border-0 print:shadow-none">
              {/* Desktop + print table */}
              <div className="hidden md:block print:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Flat</th>
                      <th className="px-5 py-3 font-medium">Owner</th>
                      <th className="px-5 py-3 font-medium">Consumption</th>
                      <th className="px-5 py-3 font-medium">Amount</th>
                      <th className="px-5 py-3 print:hidden" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.rows.map((r) => (
                      <tr key={r.flat} className="hover:bg-muted/40">
                        <td className="tabular px-5 py-3 font-semibold">{r.flat}</td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {r.ownerName || "—"}
                        </td>
                        <td className="tabular px-5 py-3 text-muted-foreground">
                          {litres(r.litres)}
                        </td>
                        <td className="tabular px-5 py-3 font-medium text-foreground">
                          {rupees(r.amount)}
                        </td>
                        <td className="px-5 py-3 text-right print:hidden">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setActive(r)}
                          >
                            Bill
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/40 font-semibold">
                      <td className="px-5 py-3">Total</td>
                      <td className="px-5 py-3" />
                      <td className="tabular px-5 py-3">{litres(report.totalLitres)}</td>
                      <td className="tabular px-5 py-3">{rupees(report.totalAmount)}</td>
                      <td className="print:hidden" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile list */}
              <ul className="divide-y divide-border md:hidden print:hidden">
                {report.rows.map((r) => (
                  <li key={r.flat}>
                    <button
                      onClick={() => setActive(r)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="tabular font-semibold text-foreground">
                          Flat {r.flat}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {r.ownerName || "—"} · {litres(r.litres)}
                        </p>
                      </div>
                      <span className="tabular shrink-0 font-medium text-foreground">
                        {rupees(r.amount)}
                      </span>
                    </button>
                  </li>
                ))}
                <li className="flex items-center justify-between px-4 py-3 font-semibold">
                  <span>Total</span>
                  <span className="tabular">{rupees(report.totalAmount)}</span>
                </li>
              </ul>
            </Card>
          )}
        </>
      ) : null}

      {active && report && (
        <BillModal
          row={active}
          month={report.month}
          building={[report.project, report.building].filter(Boolean).join(" · ")}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
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
      </CardContent>
    </Card>
  );
}

/* -------------------------------- Bill modal --------------------------------- */

function BillModal({
  row,
  month,
  building,
  onClose,
}: {
  row: BillRow;
  month: string;
  building: string;
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

  let from = 0;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl animate-fade-in sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3.5">
          <div>
            <h2 className="tabular text-lg font-bold text-foreground">
              Flat {row.flat} · {monthLabel(month)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {row.ownerName || "—"}
              {row.ownerPhone ? ` · ${row.ownerPhone}` : ""}
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

        <div className="space-y-4 p-5">
          {building && (
            <p className="text-xs text-muted-foreground">{building}</p>
          )}

          {/* Meter split */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Consumption
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {row.meters.map((m) => (
                <li key={m.deviceId} className="flex justify-between">
                  <span>
                    {m.location || "Meter"}{" "}
                    <span className="tabular text-xs">({m.deviceId})</span>
                  </span>
                  <span className="tabular">{litres(m.litres)}</span>
                </li>
              ))}
              <li className="flex justify-between border-t border-border pt-1 font-medium text-foreground">
                <span>Total</span>
                <span className="tabular">{litres(row.litres)}</span>
              </li>
            </ul>
          </div>

          {/* Slab breakdown */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Charges
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {row.breakdown.length === 0 && row.fixedCharge === 0 ? (
                <li>No tariff configured.</li>
              ) : (
                <>
                  {row.breakdown.map((b, i) => {
                    const label = `${from.toLocaleString("en-IN")}–${(from + b.litres).toLocaleString("en-IN")} L @ ₹${b.ratePerKl}/kL`;
                    from += b.litres;
                    return (
                      <li key={i} className="flex justify-between">
                        <span>{label}</span>
                        <span className="tabular">{rupees(b.amount)}</span>
                      </li>
                    );
                  })}
                  {row.fixedCharge > 0 && (
                    <li className="flex justify-between">
                      <span>Fixed charge</span>
                      <span className="tabular">{rupees(row.fixedCharge)}</span>
                    </li>
                  )}
                </>
              )}
              <li className="flex justify-between border-t border-border pt-1 text-base font-semibold text-foreground">
                <span>Amount payable</span>
                <span className="tabular">{rupees(row.amount)}</span>
              </li>
            </ul>
          </div>

          <div className="flex justify-end">
            <Badge tone="primary">
              <IconRupee className="h-3.5 w-3.5" /> {rupees(row.amount)}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
