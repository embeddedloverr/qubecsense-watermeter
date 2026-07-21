"use client";

import * as React from "react";
import { Button, Input, Label, Spinner } from "@/components/ui";
import { IconX, IconAlert } from "@/components/icons";
import { formatDate } from "@/lib/utils";

interface ExportReading {
  date: string;
  litres: number;
  totalizer: number | null;
  alerts: string[];
}
interface ExportMeter {
  deviceId: string;
  location: string | null;
  total: number;
  readings: ExportReading[];
}
interface ExportFlat {
  flat: string;
  ownerName: string;
  ownerPhone: string;
  total: number;
  meters: ExportMeter[];
}
interface ExportPayload {
  project: string | null;
  building: string | null;
  generatedAt: string;
  requested: { from: string; to: string };
  covered: { from: string | null; to: string | null; days: number };
  flatCount: number;
  totalLitres: number;
  flats: ExportFlat[];
  unassigned: ExportMeter[];
}

const litres = (n: number) => Math.round(n).toLocaleString("en-IN");

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sumByLocation(meters: ExportMeter[], location: string) {
  return meters
    .filter((m) => (m.location || "").toLowerCase() === location)
    .reduce((a, m) => a + m.total, 0);
}

/** Detailed export: one row per meter per day. */
function buildCsv(data: ExportPayload): string {
  const header = [
    "Flat",
    "Owner",
    "Phone",
    "Location",
    "Device ID",
    "Date",
    "Consumption (L)",
    "Totalizer (L)",
    "Alerts",
  ];
  const rows: (string | number)[][] = [];

  const push = (
    flat: string,
    owner: string,
    phone: string,
    m: ExportMeter
  ) => {
    for (const r of m.readings) {
      rows.push([
        flat,
        owner,
        phone,
        m.location || "",
        m.deviceId,
        r.date,
        Math.round(r.litres),
        r.totalizer ?? "",
        r.alerts.join("; "),
      ]);
    }
  };

  for (const f of data.flats) {
    for (const m of f.meters) push(f.flat, f.ownerName, f.ownerPhone, m);
  }
  for (const m of data.unassigned) push("Unassigned", "", "", m);

  return [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** Summary export: one row per flat. */
async function buildPdf(data: ExportPayload): Promise<Blob> {
  // Loaded on demand so the PDF library stays out of the page bundle.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const title = "Water consumption report";
  const subtitle = [data.project, data.building].filter(Boolean).join(" · ");
  const range = `${formatDate(data.requested.from)} – ${formatDate(data.requested.to)}`;

  doc.setFontSize(16);
  doc.text(title, 40, 46);
  doc.setFontSize(10);
  doc.setTextColor(110);
  let y = 62;
  if (subtitle) {
    doc.text(subtitle, 40, y);
    y += 14;
  }
  doc.text(`Period: ${range}  (${data.covered.days} day(s) with data)`, 40, y);
  y += 14;
  doc.text(
    `Generated ${new Date(data.generatedAt).toLocaleString("en-IN")}`,
    40,
    y
  );

  const body = data.flats.map((f) => [
    f.flat,
    f.ownerName || "—",
    litres(sumByLocation(f.meters, "kitchen")),
    litres(sumByLocation(f.meters, "bathroom")),
    litres(f.total),
  ]);

  const unassignedTotal = data.unassigned.reduce((a, m) => a + m.total, 0);
  if (unassignedTotal > 0) {
    body.push(["Unassigned", "—", "—", "—", litres(unassignedTotal)]);
  }

  autoTable(doc, {
    startY: y + 16,
    head: [["Flat", "Owner", "Kitchen (L)", "Bathroom (L)", "Total (L)"]],
    body,
    foot: [
      [
        { content: `${data.flatCount} flats`, colSpan: 4 },
        litres(data.totalLitres),
      ] as any,
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [3, 105, 161], textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 55 },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
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

export function ExportDialog({
  defaultFrom,
  defaultTo,
  onClose,
}: {
  defaultFrom: string;
  defaultTo: string;
  onClose: () => void;
}) {
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [busy, setBusy] = React.useState<"csv" | "pdf" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (format: "csv" | "pdf") => {
    setError(null);
    if (!from || !to) {
      setError("Pick a start and end date.");
      return;
    }
    if (from > to) {
      setError("The start date must be on or before the end date.");
      return;
    }

    setBusy(format);
    try {
      const res = await fetch(
        `/api/live-data/export?from=${from}&to=${to}`,
        { cache: "no-store" }
      );
      const data: ExportPayload = await res.json();
      if (!res.ok) {
        setError((data as any)?.error || "Export failed.");
        return;
      }
      if (!data.flats.length && !data.unassigned.length) {
        setError("No readings in that date range.");
        return;
      }

      const stamp = `${from}_to_${to}`;
      if (format === "csv") {
        const blob = new Blob([buildCsv(data)], {
          type: "text/csv;charset=utf-8;",
        });
        download(blob, `qubecsense-readings-${stamp}.csv`);
      } else {
        const blob = await buildPdf(data);
        download(blob, `qubecsense-report-${stamp}.pdf`);
      }
      onClose();
    } catch {
      setError("Could not build the export. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-card p-5 shadow-xl animate-fade-in sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Export data</h2>
            <p className="text-sm text-muted-foreground">
              Choose a date range and format.
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

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="export-from">From</Label>
            <Input
              id="export-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="export-to">To</Label>
            <Input
              id="export-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mb-4 space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">CSV</span> — every
            reading: one row per meter per day, with totalizer and alerts.
          </p>
          <p>
            <span className="font-medium text-foreground">PDF</span> — summary
            report: one row per flat with kitchen / bathroom totals.
          </p>
          <p>Readings are available for about the last 92 days.</p>
        </div>

        <div className="flex gap-2">
          <Button
            size="md"
            variant="outline"
            className="flex-1"
            disabled={busy !== null}
            onClick={() => run("csv")}
          >
            {busy === "csv" ? <Spinner className="h-4 w-4" /> : null}
            Download CSV
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={busy !== null}
            onClick={() => run("pdf")}
          >
            {busy === "pdf" ? <Spinner className="h-4 w-4" /> : null}
            Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
