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
import {
  IconX,
  IconAlert,
  IconDroplet,
  IconRupee,
  IconHome,
  IconCalendar,
  IconShare,
  IconMail,
} from "@/components/icons";
import { useToast } from "@/components/Toast";
import { formatDate } from "@/lib/utils";
import { ANOMALY_LABEL, hasReading } from "@/lib/flatConsumptionTypes";
import { renderBillPdf, renderBillImage, type BillPdfData } from "@/lib/billPdf";

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

interface BillRow {
  flat: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  litres: number;
  complete: boolean;
  meters: Meter[];
  breakdown: SlabCharge[];
  fixedCharge: number;
  amount: number;
}

interface Report {
  period: "cycle" | "range";
  month: string | null;
  from: string;
  to: string;
  cycle: { from: string; to: string; startDay: number } | null;
  project: string | null;
  building: string | null;
  generatedAt: string;
  tariff: {
    slabs: Slab[];
    fixedCharge: number;
    billingCycleStartDay: number;
    configured: boolean;
  };
  flatCount: number;
  totalLitres: number;
  totalLitresExcluded: number;
  totalAmount: number;
  incompleteCount: number;
  rows: BillRow[];
}

type Period = "cycle" | "range";

/* --------------------------------- Helpers ---------------------------------- */

const litres = (n: number) => `${Math.round(n).toLocaleString("en-IN")} L`;
const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** ₹-free amount formatter for jsPDF specifically. jsPDF's built-in fonts
 *  (Helvetica etc.) only cover WinAnsiEncoding — the Rupee sign (U+20B9) was
 *  added to Unicode in 2010 and isn't in that set, so it silently renders as
 *  a tofu glyph instead of failing loudly. Embedding a Unicode font just for
 *  one symbol isn't worth the bundle weight; "Rs." is unambiguous and part
 *  of the standard font. Everywhere else in the app (on-screen, the CSV
 *  exports) is plain HTML/UTF-8 text and renders ₹ correctly already. */
const rupeesPdf = (n: number) =>
  `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const DAY_MS = 86_400_000;
/** Inclusive day count between two YYYY-MM-DD dates. */
function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** How far into [from, to] today falls — clamped, since `to` may be in the
 *  future (an open cycle) or the whole range may already be in the past (a
 *  historical range query, which reads as "100% — complete" rather than a
 *  percentage of something still ticking). */
function periodProgress(from: string, to: string) {
  const totalDays = daySpan(from, to);
  const today = todayISO();
  const elapsedDays =
    today < from ? 0 : today > to ? totalDays : daySpan(from, today);
  const pct = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 100;
  return { totalDays, elapsedDays, pct, ongoing: today <= to };
}

/** Human label for whatever period a report covers — a plain range for a
 *  custom export, the month plus its exact cycle dates when the tariff uses
 *  a non-calendar cycle, or just the month name for the ordinary case. */
function periodLabel(report: Report): string {
  if (report.period === "range" || !report.month) {
    return `${formatDate(report.from)} – ${formatDate(report.to)}`;
  }
  const base = monthLabel(report.month);
  return report.cycle && report.cycle.startDay > 1
    ? `${base} (${formatDate(report.cycle.from)} – ${formatDate(report.cycle.to)})`
    : base;
}

/** Filename-safe stamp for exports. */
function periodStamp(report: Report): string {
  return report.period === "cycle" && report.month
    ? report.month
    : `${report.from}_to_${report.to}`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sumByLocation(meters: Meter[], location: string) {
  return meters
    .filter((m) => (m.location || "").toLowerCase() === location)
    .reduce((a, m) => a + (m.consumptionLitres || 0), 0);
}

/** % of the first (cheapest) slab a flat has used this period — like a data
 *  plan's usage bar. `null` when the first slab has no limit (a flat
 *  per-litre tariff has no "allowance" to show progress against). Can
 *  exceed 100 once a flat has moved into the next, pricier slab — the caller
 *  clamps the bar itself but keeps the real number in the label. */
function slabUsagePct(litres: number, firstSlabLimit: number | null | undefined): number | null {
  if (!firstSlabLimit || firstSlabLimit <= 0) return null;
  return (litres / firstSlabLimit) * 100;
}

function SlabUsageBar({ pct }: { pct: number }) {
  const over = pct > 100;
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span
        className={`tabular text-[10px] ${over ? "text-destructive" : "text-muted-foreground"}`}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/* -------------------------------- CSV / PDF ---------------------------------- */

/** One row per FLAT — the whole bill (consumption, slab breakdown, fixed
 *  charge, total) on one line, for spreadsheet work: sorting, filtering, a
 *  pivot table, importing into an accounting tool. The per-meter totalizer
 *  detail lives in the Detailed CSV instead — this one is meant to open
 *  cleanly with exactly as many rows as there are flats.
 *
 *  Takes `rows` separately from `report` so a search-narrowed export
 *  contains only what's on screen, not every flat in the period. */
function buildFlatCsv(report: Report, rows: BillRow[]): string {
  const header = [
    "Flat",
    "Owner",
    "Phone",
    "Consumption (L)",
    "Complete",
    "Anomalies",
    ...report.tariff.slabs.map((_, i) => `Slab ${i + 1} (₹)`),
    "Fixed charge (₹)",
    "Amount (₹)",
  ];
  const csvRows = rows.map((r) => [
    r.flat,
    r.ownerName,
    r.ownerPhone,
    hasReading(r.meters) ? r.litres : "",
    r.complete ? "Yes" : "No",
    r.meters
      .filter((m) => m.anomaly)
      .map((m) => `${m.location || "Meter"}: ${ANOMALY_LABEL[m.anomaly!] || m.anomaly}`)
      .join("; "),
    ...report.tariff.slabs.map((_, i) => (r.breakdown[i]?.amount ?? 0).toFixed(2)),
    r.fixedCharge.toFixed(2),
    r.amount.toFixed(2),
  ]);
  return [header, ...csvRows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** One row per METER, not per flat — includes device id and the exact
 *  totalizer readings the bill was computed from, so the export can stand in
 *  for an audit trail, not just a total. Also takes `rows` separately, same
 *  reason as buildFlatCsv. */
function buildDetailedCsv(flatRows: BillRow[]): string {
  const header = [
    "Flat",
    "Owner",
    "Phone",
    "Meter location",
    "Device ID",
    "Totalizer start",
    "Totalizer start date",
    "Totalizer end",
    "Totalizer end date",
    "Consumption (L)",
    "Anomaly",
    "Complete",
    "Fixed charge (₹)",
    "Amount (₹)",
  ];
  const rows: (string | number)[][] = [];
  for (const r of flatRows) {
    const meters = r.meters.length ? r.meters : [null];
    for (const m of meters) {
      rows.push([
        r.flat,
        r.ownerName,
        r.ownerPhone,
        m?.location || "",
        m?.deviceId || "",
        m?.totalizerStart ?? "",
        m?.totalizerStartDate || "",
        m?.totalizerEnd ?? "",
        m?.totalizerEndDate || "",
        m?.consumptionLitres ?? "",
        m?.anomaly ? ANOMALY_LABEL[m.anomaly] || m.anomaly : "",
        r.complete ? "Yes" : "No",
        r.fixedCharge.toFixed(2),
        r.amount.toFixed(2),
      ]);
    }
  }
  return [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** Summary PDF: one row per flat — Flat, Owner, Kitchen/Bathroom/Total
 *  litres, Amount. Meter-level detail (device id, totalizer) belongs in the
 *  CSV, which residents don't need but an operator auditing a bill does.
 *  `rows` is separate from `report` for the same reason as the CSVs — a
 *  search-narrowed PDF should total only what it lists, not the whole
 *  period. */
async function buildPdf(report: Report, rows: BillRow[]): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const subtitle = [report.project, report.building].filter(Boolean).join(" · ");

  doc.setFontSize(16);
  doc.text("Water bill", 40, 46);
  doc.setFontSize(10);
  doc.setTextColor(110);
  let y = 62;
  if (subtitle) {
    doc.text(subtitle, 40, y);
    y += 14;
  }
  doc.text(periodLabel(report), 40, y);
  y += 14;
  doc.text(
    `Generated ${new Date(report.generatedAt).toLocaleString("en-IN")}`,
    40,
    y
  );

  const body = rows.map((r) => [
    r.flat,
    r.ownerName || "—",
    litres(sumByLocation(r.meters, "kitchen")),
    litres(sumByLocation(r.meters, "bathroom")),
    hasReading(r.meters) ? litres(r.litres) : "No data",
    rupeesPdf(r.amount) + (r.complete ? "" : " *"),
  ]);

  const withReading = rows.filter((r) => hasReading(r.meters));
  const totalLitres = withReading.reduce((a, r) => a + r.litres, 0);
  const totalAmount = rows.reduce((a, r) => a + r.amount, 0);
  const incompleteCount = rows.filter((r) => !r.complete).length;

  autoTable(doc, {
    startY: y + 16,
    head: [["Flat", "Owner", "Kitchen (L)", "Bathroom (L)", "Total (L)", "Amount"]],
    body,
    foot: [
      [
        {
          content: `${rows.length} flat(s)${
            incompleteCount ? ` · ${incompleteCount} incomplete (*)` : ""
          }`,
          colSpan: 4,
        } as any,
        litres(totalLitres),
        rupeesPdf(totalAmount),
      ],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [3, 105, 161], textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 45 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(
        `QubecSense · page ${page}`,
        doc.internal.pageSize.getWidth() - 40,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" }
      );
    },
  });

  return doc.output("blob");
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
  const [cycleDay, setCycleDay] = React.useState("1");
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
        setCycleDay(String(d.tariff?.billingCycleStartDay ?? 1));
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
        billingCycleStartDay: Number(cycleDay) || 1,
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

        {/* Billing cycle */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Label className="text-xs">Billing cycle start day</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                value={cycleDay}
                onChange={(e) => setCycleDay(e.target.value)}
              />
            </div>
            <p className="pb-2.5 text-xs text-muted-foreground">
              {Number(cycleDay) <= 1 || !cycleDay
                ? "Day 1 = the ordinary calendar month (default)."
                : `A cycle runs from the ${ordinal(Number(cycleDay))} of one month
                   to the ${ordinal(Number(cycleDay) - 1)} of the next.`}
            </p>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconCalendar className="h-3.5 w-3.5 shrink-0" />
            e.g. &ldquo;August&rdquo; would cover{" "}
            {billingCyclePreview(cycleDay)}. Applies to reports generated with
            the &ldquo;Cycle&rdquo; period below — the custom
            &ldquo;Range&rdquo; option always uses the exact dates you pick,
            regardless of this setting.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** 1 → "1st", 2 → "2nd", 5 → "5th", 21 → "21st"… */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Live preview of what an example month's cycle would span, for the
 *  currently-typed (not-yet-saved) start day. */
function billingCyclePreview(cycleDayStr: string): string {
  const day = Math.min(28, Math.max(1, Number(cycleDayStr) || 1));
  const from = new Date(Date.UTC(2026, 7, day)); // an arbitrary August
  const to =
    day === 1
      ? new Date(Date.UTC(2026, 8, 0))
      : new Date(Date.UTC(2026, 8, day - 1));
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${fmt(from)} → ${fmt(to)}`;
}

/* ------------------------------ Main component ------------------------------- */

export function AdminBilling() {
  const { toast } = useToast();
  const [period, setPeriod] = React.useState<Period>("cycle");
  const [month, setMonth] = React.useState(currentMonth());
  const [from, setFrom] = React.useState(daysAgoISO(29));
  const [to, setTo] = React.useState(todayISO());
  const [rangeError, setRangeError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<Report | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<BillRow | null>(null);
  const [tariffConfigured, setTariffConfigured] = React.useState(true);
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const generate = React.useCallback(async () => {
    if (period === "range") {
      if (!from || !to) return;
      if (from > to) {
        setRangeError("The start date must be on or before the end date.");
        return;
      }
    }
    setRangeError(null);
    setLoading(true);
    setError(null);
    try {
      const qs =
        period === "range"
          ? `period=range&from=${from}&to=${to}`
          : `period=cycle&month=${month}`;
      const res = await fetch(`/api/billing/report?${qs}`, {
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
  }, [period, month, from, to]);

  React.useEffect(() => {
    generate();
  }, [generate]);

  // Search narrows both the table AND the exports — "show me flat 501" should
  // mean the CSV/PDF someone downloads next also has just flat 501, not the
  // whole period they happened to be looking at. KPIs stay on the full
  // report regardless, since "Total billed" should mean the whole bill run.
  const filtered = React.useMemo(() => {
    if (!report) return [];
    const q = query.trim().toLowerCase();
    const rows = !q
      ? report.rows
      : report.rows.filter(
          (r) =>
            r.flat.toLowerCase().includes(q) ||
            (r.ownerName || "").toLowerCase().includes(q)
        );
    return [...rows].sort((a, b) => {
      const na = parseInt(a.flat, 10);
      const nb = parseInt(b.flat, 10);
      if (Number.isNaN(na) || Number.isNaN(nb)) return a.flat.localeCompare(b.flat);
      return na - nb;
    });
  }, [report, query]);

  // The table's own footer sums what's actually listed — with a search
  // active, showing the whole period's total under 2 visible rows would
  // look like the filter did nothing.
  const filteredTotals = React.useMemo(() => {
    const withReading = filtered.filter((r) => hasReading(r.meters));
    return {
      totalLitres: withReading.reduce((a, r) => a + r.litres, 0),
      totalAmount: filtered.reduce((a, r) => a + r.amount, 0),
    };
  }, [filtered]);

  // null when the tariff's first slab has no cap (a flat per-litre rate) —
  // there's no "allowance" to show a usage bar against in that case.
  const firstSlabLimit = report?.tariff.slabs[0]?.limitLitres ?? null;

  const exportFlatCsv = () => {
    if (!report) return;
    const blob = new Blob([buildFlatCsv(report, filtered)], {
      type: "text/csv;charset=utf-8;",
    });
    download(blob, `qubecsense-bills-${periodStamp(report)}.csv`);
  };

  const exportDetailedCsv = () => {
    if (!report) return;
    const blob = new Blob([buildDetailedCsv(filtered)], {
      type: "text/csv;charset=utf-8;",
    });
    download(blob, `qubecsense-bills-detailed-${periodStamp(report)}.csv`);
  };

  const exportPdf = async () => {
    if (!report) return;
    setExportingPdf(true);
    try {
      const blob = await buildPdf(report, filtered);
      download(blob, `qubecsense-bills-${periodStamp(report)}.pdf`);
    } catch {
      toast("Could not build the PDF. Please try again.", "error");
    } finally {
      setExportingPdf(false);
    }
  };

  const allNoData =
    report != null &&
    report.rows.length > 0 &&
    report.totalLitresExcluded === report.rows.length;

  return (
    <div className="space-y-4">
      <TariffEditor
        onSaved={(slabs) => {
          setTariffConfigured(slabs.length > 0);
          generate();
        }}
      />

      {/* Report controls */}
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(["cycle", "range"] as Period[]).map((p) => (
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

          {period === "cycle" ? (
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
              aria-label="Billing month"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={from}
                max={to || todayISO()}
                onChange={(e) => setFrom(e.target.value)}
                className="w-auto"
                aria-label="From date"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={to}
                min={from || undefined}
                max={todayISO()}
                onChange={(e) => setTo(e.target.value)}
                className="w-auto"
                aria-label="To date"
              />
            </div>
          )}

          <Input
            placeholder="Search flat or owner…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-56 print:hidden"
          />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="md" onClick={generate} loading={loading}>
              Refresh
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={exportFlatCsv}
              disabled={!report}
            >
              Flat-wise CSV
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={exportDetailedCsv}
              disabled={!report}
            >
              Meter-wise CSV
            </Button>
            <Button
              variant="outline"
              size="md"
              onClick={exportPdf}
              loading={exportingPdf}
              disabled={!report}
            >
              PDF
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
        </CardContent>
      </Card>

      {rangeError && (
        <Card className="print:hidden">
          <CardContent className="py-4 text-center text-sm text-destructive">
            {rangeError}
          </CardContent>
        </Card>
      )}

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
              Water bill — {periodLabel(report)}
            </h2>
            <p className="text-sm">
              {[report.project, report.building].filter(Boolean).join(" · ")}
            </p>
          </div>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {periodLabel(report)}
            </span>
          </div>

          {/* All-flats-no-data banner — the case that most looks like a
              broken report: a period before any meter had a baseline
              reading legitimately returns zero usable readings for
              everyone. */}
          {allNoData && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm text-warning print:hidden">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No meter had a reading at the start of this period — usually
                because installation happened partway through it. Amounts
                below are fixed charges only. Try a more recent period.
              </span>
            </div>
          )}

          {/* Cycle progress — how far into this period today falls, so a
              small total early in the period reads as "not finished yet"
              rather than as a broken report. */}
          {report.rows.length > 0 &&
            (() => {
              const prog = periodProgress(report.from, report.to);
              return (
                <Card className="print:hidden">
                  <CardContent className="py-3.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">
                        {prog.ongoing ? "Period in progress" : "Period complete"}
                      </span>
                      <span className="tabular text-muted-foreground">
                        Day {prog.elapsedDays} of {prog.totalDays} · {prog.pct}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all ${
                          prog.ongoing ? "bg-primary" : "bg-success"
                        }`}
                        style={{ width: `${prog.pct}%` }}
                      />
                    </div>
                    {prog.ongoing && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Totals below will keep changing until this period closes
                        on {formatDate(report.to)}.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 print:hidden">
            <KpiCard
              label="Flats billed"
              value={String(report.flatCount)}
              icon={IconHome}
            />
            <KpiCard
              label="Consumption"
              value={litres(report.totalLitres)}
              sub={
                report.totalLitresExcluded > 0
                  ? `${report.totalLitresExcluded} excluded — no data`
                  : undefined
              }
              icon={IconDroplet}
            />
            <KpiCard
              label="Incomplete"
              value={String(report.incompleteCount)}
              sub="Missing a reading in period"
              icon={IconAlert}
              tone={report.incompleteCount > 0 ? "warning" : undefined}
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
                No flats to bill for this period.
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No flats match &ldquo;{query}&rdquo;.
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
                    {filtered.map((r) => {
                      const got = hasReading(r.meters);
                      return (
                        <tr key={r.flat} className="hover:bg-muted/40">
                          <td className="tabular px-5 py-3 font-semibold">
                            <div className="flex items-center gap-1.5">
                              {r.flat}
                              {!r.complete && (
                                <Badge tone="warning">Incomplete</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {r.ownerName || "—"}
                          </td>
                          <td
                            className={`tabular px-5 py-3 ${
                              got ? "text-muted-foreground" : "text-muted-foreground/60"
                            }`}
                          >
                            {got ? litres(r.litres) : "No data"}
                            {got &&
                              (() => {
                                const pct = slabUsagePct(r.litres, firstSlabLimit);
                                return pct !== null ? <SlabUsageBar pct={pct} /> : null;
                              })()}
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
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/40 font-semibold">
                      <td className="px-5 py-3">Total</td>
                      <td className="px-5 py-3" />
                      <td className="tabular px-5 py-3">{litres(filteredTotals.totalLitres)}</td>
                      <td className="tabular px-5 py-3">{rupees(filteredTotals.totalAmount)}</td>
                      <td className="print:hidden" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile list */}
              <ul className="divide-y divide-border md:hidden print:hidden">
                {filtered.map((r) => {
                  const got = hasReading(r.meters);
                  return (
                    <li key={r.flat}>
                      <button
                        onClick={() => setActive(r)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="tabular font-semibold text-foreground">
                              Flat {r.flat}
                            </p>
                            {!r.complete && (
                              <Badge tone="warning">Incomplete</Badge>
                            )}
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            {r.ownerName || "—"} ·{" "}
                            {got ? litres(r.litres) : "No data"}
                          </p>
                          {got &&
                            (() => {
                              const pct = slabUsagePct(r.litres, firstSlabLimit);
                              return pct !== null ? <SlabUsageBar pct={pct} /> : null;
                            })()}
                        </div>
                        <span className="tabular shrink-0 font-medium text-foreground">
                          {rupees(r.amount)}
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li className="flex items-center justify-between px-4 py-3 font-semibold">
                  <span>Total</span>
                  <span className="tabular">{rupees(filteredTotals.totalAmount)}</span>
                </li>
              </ul>
            </Card>
          )}
        </>
      ) : null}

      {active && report && (
        <BillModal
          row={active}
          periodText={periodLabel(report)}
          project={report.project}
          building={report.building}
          sendPayload={
            period === "range"
              ? { period: "range", from, to }
              : { period: "cycle", month }
          }
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone?: "warning";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              tone === "warning"
                ? "bg-warning/15 text-warning"
                : "bg-accent text-accent-foreground"
            }`}
          >
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

/* -------------------------------- Bill modal --------------------------------- */

type SendPayload =
  | { period: "cycle"; month: string | null }
  | { period: "range"; from: string; to: string };

/** Web Share API with files, when the browser/OS supports it (Windows 11 +
 *  Chrome/Edge does — that's the share sheet, letting the admin pick
 *  WhatsApp or anything else installed, with the file attached). Falls back
 *  to a plain download so the feature still works everywhere, just without
 *  the one-tap hand-off. */
async function shareOrDownloadFile(file: File, title: string, text: string) {
  const nav = navigator as any;
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title, text });
    return "shared" as const;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded" as const;
}

function BillModal({
  row,
  periodText,
  project,
  building,
  sendPayload,
  onClose,
}: {
  row: BillRow;
  periodText: string;
  project: string | null;
  building: string | null;
  sendPayload: SendPayload;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [sharing, setSharing] = React.useState<"pdf" | "image" | null>(null);
  const [emailing, setEmailing] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const got = hasReading(row.meters);
  let from = 0;

  const pdfData = (): BillPdfData => ({
    flat: row.flat,
    ownerName: row.ownerName,
    ownerPhone: row.ownerPhone,
    project,
    building,
    periodLabel: periodText,
    meters: row.meters,
    litres: row.litres,
    complete: row.complete,
    breakdown: row.breakdown,
    fixedCharge: row.fixedCharge,
    amount: row.amount,
    generatedAt: new Date().toISOString(),
  });

  const shareTitle = `Water bill — Flat ${row.flat}`;
  const shareText = `Flat ${row.flat} · ${periodText} · ${rupees(row.amount)}`;

  const shareAsPdf = async () => {
    setSharing("pdf");
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      renderBillPdf(doc, autoTable, pdfData());
      const blob = doc.output("blob") as Blob;
      const file = new File([blob], `qubecsense-bill-flat-${row.flat}.pdf`, {
        type: "application/pdf",
      });
      const result = await shareOrDownloadFile(file, shareTitle, shareText);
      if (result === "downloaded") {
        toast("Sharing isn't available here — downloaded instead.", "success");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast("Could not build the PDF. Please try again.", "error");
      }
    } finally {
      setSharing(null);
    }
  };

  const shareAsImage = async () => {
    setSharing("image");
    try {
      const blob = await renderBillImage(pdfData());
      const file = new File([blob], `qubecsense-bill-flat-${row.flat}.png`, {
        type: "image/png",
      });
      const result = await shareOrDownloadFile(file, shareTitle, shareText);
      if (result === "downloaded") {
        toast("Sharing isn't available here — downloaded instead.", "success");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast("Could not build the image. Please try again.", "error");
      }
    } finally {
      setSharing(null);
    }
  };

  const emailBill = async () => {
    setEmailing(true);
    try {
      const res = await fetch("/api/billing/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flat: row.flat, ...sendPayload }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not send the bill.", "error");
        return;
      }
      toast(`Bill emailed to ${data.sentTo}.`, "success");
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setEmailing(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl animate-fade-in sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3.5">
          <div>
            <h2 className="tabular flex items-center gap-1.5 text-lg font-bold text-foreground">
              Flat {row.flat}
              {!row.complete && <Badge tone="warning">Incomplete</Badge>}
            </h2>
            <p className="text-sm text-muted-foreground">
              {row.ownerName || "—"}
              {row.ownerPhone ? ` · ${row.ownerPhone}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{periodText}</p>
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
          {(project || building) && (
            <p className="text-xs text-muted-foreground">
              {[project, building].filter(Boolean).join(" · ")}
            </p>
          )}

          {/* Meter split — device id + totalizer readings behind the total */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Consumption
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {row.meters.length === 0 ? (
                <li>No meters registered.</li>
              ) : (
                row.meters.map((m) => (
                  <li key={m.deviceKey} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        {m.location || "Meter"}{" "}
                        <span className="tabular text-xs text-muted-foreground">
                          ({m.deviceId})
                        </span>
                      </span>
                      <span className="tabular">
                        {m.consumptionLitres != null ? litres(m.consumptionLitres) : "—"}
                      </span>
                    </div>
                    {m.anomaly ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <IconAlert className="h-3 w-3" />
                        {ANOMALY_LABEL[m.anomaly] || m.anomaly}
                      </p>
                    ) : (
                      <p className="mt-1 tabular text-xs text-muted-foreground">
                        Totalizer {m.totalizerStart ?? "—"} → {m.totalizerEnd ?? "—"}
                        {m.totalizerStartDate && m.totalizerEndDate
                          ? ` (${m.totalizerStartDate} → ${m.totalizerEndDate})`
                          : ""}
                      </p>
                    )}
                  </li>
                ))
              )}
              <li className="flex justify-between border-t border-border pt-1 font-medium text-foreground">
                <span>Total</span>
                <span className="tabular">
                  {got ? litres(row.litres) : "No data"}
                </span>
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

          {/* Share / email */}
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Share this bill</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={shareAsPdf}
                loading={sharing === "pdf"}
                disabled={sharing !== null}
              >
                <IconShare className="h-4 w-4" /> Share PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={shareAsImage}
                loading={sharing === "image"}
                disabled={sharing !== null}
              >
                <IconShare className="h-4 w-4" /> Share image
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={emailBill}
                loading={emailing}
                disabled={!row.ownerEmail || emailing}
              >
                <IconMail className="h-4 w-4" /> Email bill
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {row.ownerEmail
                ? `Email sends to ${row.ownerEmail}. Share opens your device's share sheet — pick WhatsApp or any app.`
                : "No email on file for this flat — add one on the Residents page to enable emailing."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
