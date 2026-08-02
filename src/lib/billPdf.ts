// Renders a single flat's bill onto an already-constructed jsPDF document.
//
// Deliberately takes `doc`/`autoTable` as parameters rather than importing
// `jspdf` itself: the admin's "Share PDF" button needs jsPDF lazy-loaded
// client-side (dynamic import, kept out of the main bundle — the existing
// convention in AdminBilling.tsx), while the email-send route needs it
// server-side. A module that imports jsPDF at the top would force one of
// those two into the wrong shape. This file has no environment-specific
// imports at all, so the same rendering logic serves both without
// duplication and without either caller paying for the other's constraints.

export interface BillPdfMeter {
  location: string | null;
  deviceId: string;
  totalizerStart: number | null;
  totalizerStartDate: string | null;
  totalizerEnd: number | null;
  totalizerEndDate: string | null;
  consumptionLitres: number | null;
  anomaly: string | null;
}

export interface BillPdfSlab {
  litres: number;
  ratePerKl: number;
  amount: number;
}

export interface BillPdfData {
  flat: string;
  ownerName: string;
  ownerPhone: string;
  project: string | null;
  building: string | null;
  periodLabel: string;
  meters: BillPdfMeter[];
  litres: number;
  complete: boolean;
  breakdown: BillPdfSlab[];
  fixedCharge: number;
  amount: number;
  generatedAt: string;
}

export const BILL_ANOMALY_LABEL: Record<string, string> = {
  no_reading_in_period: "No reading in period",
  totalizer_decreased: "Meter reset or replaced",
};

const litres = (n: number) => `${Math.round(n).toLocaleString("en-IN")} L`;
// "Rs." not "₹" — jsPDF's built-in fonts don't cover the Rupee sign
// (U+20B9, added to Unicode in 2010); see AdminBilling.tsx's rupeesPdf for
// the full reasoning. Same constraint applies here, same fix.
const rupeesPdf = (n: number) =>
  `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Mutates `doc` in place, drawing the whole single-page bill. */
export function renderBillPdf(doc: any, autoTable: any, d: BillPdfData): void {
  const hasReading = d.meters.some((m) => m.consumptionLitres !== null);

  doc.setFontSize(16);
  doc.text("Water bill", 40, 46);
  doc.setFontSize(10);
  doc.setTextColor(110);
  let y = 62;
  const subtitle = [d.project, d.building].filter(Boolean).join(" · ");
  if (subtitle) {
    doc.text(subtitle, 40, y);
    y += 14;
  }
  doc.text(d.periodLabel, 40, y);
  y += 14;
  doc.text(`Generated ${new Date(d.generatedAt).toLocaleString("en-IN")}`, 40, y);

  doc.setFontSize(13);
  doc.setTextColor(20);
  y += 26;
  doc.text(`Flat ${d.flat}`, 40, y);
  doc.setFontSize(10);
  doc.setTextColor(90);
  y += 16;
  doc.text(
    [d.ownerName, d.ownerPhone].filter(Boolean).join("  ·  ") || "—",
    40,
    y
  );
  if (!d.complete) {
    doc.setTextColor(180, 120, 0);
    doc.text("Incomplete — see anomaly notes below", 40, y + 14);
    doc.setTextColor(90);
  }

  autoTable(doc, {
    startY: y + 22,
    head: [["Meter", "Device ID", "Totalizer", "Consumption"]],
    body: d.meters.length
      ? d.meters.map((m) => [
          m.location || "Meter",
          m.deviceId,
          m.anomaly
            ? BILL_ANOMALY_LABEL[m.anomaly] || m.anomaly
            : `${m.totalizerStart ?? "—"} → ${m.totalizerEnd ?? "—"}`,
          m.consumptionLitres != null ? litres(m.consumptionLitres) : "—",
        ])
      : [["No meters registered.", "", "", ""]],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [3, 105, 161], textColor: 255 },
    columnStyles: { 3: { halign: "right" } },
    foot: [
      [
        { content: "Total", colSpan: 3 } as any,
        hasReading ? litres(d.litres) : "No data",
      ],
    ],
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
  });

  const chargeRows: (string | number)[][] = [];
  let from = 0;
  for (const b of d.breakdown) {
    chargeRows.push([
      `${from.toLocaleString("en-IN")}–${(from + b.litres).toLocaleString("en-IN")} L @ Rs. ${b.ratePerKl}/kL`,
      rupeesPdf(b.amount),
    ]);
    from += b.litres;
  }
  if (d.fixedCharge > 0) {
    chargeRows.push(["Fixed charge", rupeesPdf(d.fixedCharge)]);
  }
  if (chargeRows.length === 0) {
    chargeRows.push(["No tariff configured.", ""]);
  }

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [["Charges", ""]],
    body: chargeRows,
    foot: [["Amount payable", rupeesPdf(d.amount)]],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [3, 105, 161], textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold", fontSize: 11 },
    columnStyles: { 1: { halign: "right" } },
  });
}

/**
 * Draws the same bill as a PNG image via the Canvas 2D API — no extra
 * dependency (no html2canvas), and always rendered on a plain white
 * background regardless of the admin's light/dark theme, since that's what
 * actually looks right shared as a WhatsApp image. Browser-only; never
 * called from the email-send route, which uses renderBillPdf instead.
 */
export async function renderBillImage(d: BillPdfData): Promise<Blob> {
  const W = 900;
  const PAD = 48;
  const hasReading = d.meters.some((m) => m.consumptionLitres !== null);
  const litres = (n: number) => `${Math.round(n).toLocaleString("en-IN")} L`;
  const rupees = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Two passes: measure the content height first (canvas height can't
  // change after creation), then draw for real.
  const rowH = 34;
  const meterRows = Math.max(d.meters.length, 1);
  const chargeRows = Math.max(d.breakdown.length + (d.fixedCharge > 0 ? 1 : 0), 1);
  const H =
    PAD * 2 +
    170 + // header block
    40 +
    meterRows * rowH +
    50 +
    40 +
    chargeRows * rowH +
    60 +
    (d.complete ? 0 : 30);

  const canvas = document.createElement("canvas");
  const scale = 2; // crisp on high-DPI phone screens
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  let y = PAD;
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillText("Water bill", PAD, y);
  y += 26;

  ctx.font = "13px Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  const subtitle = [d.project, d.building].filter(Boolean).join(" · ");
  if (subtitle) {
    y += 20;
    ctx.fillText(subtitle, PAD, y);
  }
  y += 20;
  ctx.fillText(d.periodLabel, PAD, y);

  y += 36;
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.fillText(`Flat ${d.flat}`, PAD, y);
  y += 22;
  ctx.font = "13px Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText([d.ownerName, d.ownerPhone].filter(Boolean).join("  ·  ") || "—", PAD, y);
  if (!d.complete) {
    y += 18;
    ctx.fillStyle = "#b45309";
    ctx.fillText("Incomplete — see meter notes below", PAD, y);
  }

  y += 30;
  const drawSectionHeader = (label: string) => {
    ctx.fillStyle = "#0369a1";
    ctx.fillRect(PAD, y, W - PAD * 2, 28);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial, sans-serif";
    ctx.fillText(label, PAD + 10, y + 19);
    y += 28;
  };

  drawSectionHeader("CONSUMPTION");
  ctx.font = "13px Arial, sans-serif";
  if (d.meters.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.fillText("No meters registered.", PAD + 10, (y += rowH) - 10);
  } else {
    for (const m of d.meters) {
      ctx.fillStyle = "#0f172a";
      ctx.fillText(`${m.location || "Meter"} (${m.deviceId})`, PAD + 10, y + 22);
      ctx.textAlign = "right";
      ctx.fillText(
        m.consumptionLitres != null ? litres(m.consumptionLitres) : "—",
        W - PAD - 10,
        y + 22
      );
      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = "11px Arial, sans-serif";
      ctx.fillText(
        m.anomaly
          ? BILL_ANOMALY_LABEL[m.anomaly] || m.anomaly
          : `Totalizer ${m.totalizerStart ?? "—"} → ${m.totalizerEnd ?? "—"}`,
        PAD + 10,
        y + 34
      );
      ctx.font = "13px Arial, sans-serif";
      y += rowH;
    }
  }
  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(PAD, y + 6);
  ctx.lineTo(W - PAD, y + 6);
  ctx.stroke();
  y += 10;
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.fillText("Total", PAD + 10, y + 16);
  ctx.textAlign = "right";
  ctx.fillText(hasReading ? litres(d.litres) : "No data", W - PAD - 10, y + 16);
  ctx.textAlign = "left";
  y += 40;

  drawSectionHeader("CHARGES");
  ctx.font = "13px Arial, sans-serif";
  let from = 0;
  const lines: [string, string][] = d.breakdown.map((b) => {
    const label = `${from.toLocaleString("en-IN")}–${(from + b.litres).toLocaleString("en-IN")} L @ ₹${b.ratePerKl}/kL`;
    from += b.litres;
    return [label, rupees(b.amount)];
  });
  if (d.fixedCharge > 0) lines.push(["Fixed charge", rupees(d.fixedCharge)]);
  if (lines.length === 0) lines.push(["No tariff configured.", ""]);
  for (const [label, amt] of lines) {
    ctx.fillStyle = "#0f172a";
    ctx.fillText(label, PAD + 10, y + 22);
    ctx.textAlign = "right";
    ctx.fillText(amt, W - PAD - 10, y + 22);
    ctx.textAlign = "left";
    y += rowH;
  }

  y += 6;
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(PAD, y, W - PAD * 2, 44);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 16px Arial, sans-serif";
  ctx.fillText("Amount payable", PAD + 10, y + 28);
  ctx.textAlign = "right";
  ctx.fillText(rupees(d.amount), W - PAD - 10, y + 28);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}
