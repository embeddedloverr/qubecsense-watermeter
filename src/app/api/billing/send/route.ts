import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Tariff } from "@/lib/models/Tariff";
import { guard } from "@/lib/guard";
import { applySlabs, resolveBillingPeriod, type Slab } from "@/lib/billing";
import { LiveDataError, resolveSiteCreds } from "@/lib/liveData";
import { fetchFlatRange } from "@/lib/flatConsumption";
import { renderBillPdf, type BillPdfData } from "@/lib/billPdf";
import { sendMail, isMailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthLabel(m: string): string {
  return new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// POST /api/billing/send  { flat, period, month? | from? & to? }
//
// Rebuilds the bill server-side from the flat number and period alone —
// never from client-submitted amounts — the same way the report route does,
// so a resident can never be emailed a figure the server didn't itself
// compute from meter data and the saved tariff.
export async function POST(req: NextRequest) {
  const g = await guard("billing");
  if (!g.ok) return g.res;

  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on this server." },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const flat = String(body?.flat || "").trim();
    if (!flat) {
      return NextResponse.json({ error: "Missing flat." }, { status: 400 });
    }
    const period = body?.period === "range" ? "range" : "cycle";

    await connectDB();
    const [tariffDoc, flatDoc] = await Promise.all([
      Tariff.findOne({ key: "default", siteId: g.ctx.siteId }).lean(),
      Flat.findOne(
        { siteId: g.ctx.siteId, flatNumber: flat },
        { flatNumber: 1, ownerName: 1, ownerPhone: 1, ownerEmail: 1 }
      ).lean(),
    ]);
    if (!flatDoc) {
      return NextResponse.json({ error: "Flat not found." }, { status: 404 });
    }
    const ownerEmail = (flatDoc as any).ownerEmail?.trim();
    if (!ownerEmail) {
      return NextResponse.json(
        { error: "No email on file for this flat." },
        { status: 400 }
      );
    }

    const slabs: Slab[] = (tariffDoc as any)?.slabs || [];
    const fixedCharge: number = (tariffDoc as any)?.fixedCharge || 0;
    const billingCycleStartDay: number =
      (tariffDoc as any)?.billingCycleStartDay || 1;

    const resolved = resolveBillingPeriod(
      period,
      { month: body?.month, from: body?.from, to: body?.to },
      billingCycleStartDay
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    const { from, to, month, cycle } = resolved.period;

    const creds = await resolveSiteCreds(g.ctx.siteId);
    const consumption = await fetchFlatRange({ from, to, flat }, creds);
    const entry = consumption.flats.find((f) => f.flat === flat);
    if (!entry) {
      return NextResponse.json(
        { error: "No meter data for this flat in that period." },
        { status: 404 }
      );
    }

    const { breakdown, amount } = applySlabs(
      entry.consumptionLitres,
      slabs,
      fixedCharge
    );

    const periodLabel =
      period === "range" || !month
        ? `${formatDate(from)} – ${formatDate(to)}`
        : cycle && cycle.startDay > 1
          ? `${monthLabel(month)} (${formatDate(cycle.from)} – ${formatDate(cycle.to)})`
          : monthLabel(month);

    const pdfData: BillPdfData = {
      flat,
      ownerName: (flatDoc as any).ownerName || "",
      ownerPhone: (flatDoc as any).ownerPhone || "",
      project: g.ctx.site.project || null,
      building: g.ctx.site.building || null,
      periodLabel,
      meters: entry.meters,
      litres: entry.consumptionLitres,
      complete: entry.complete,
      breakdown,
      fixedCharge,
      amount,
      generatedAt: new Date().toISOString(),
    };

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    renderBillPdf(doc, autoTable, pdfData);
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    const buildingLine = [g.ctx.site.project, g.ctx.site.building]
      .filter(Boolean)
      .join(", ");
    await sendMail({
      to: ownerEmail,
      subject: `Water bill — Flat ${flat} — ${periodLabel}`,
      text:
        `Hello${pdfData.ownerName ? ` ${pdfData.ownerName}` : ""},\n\n` +
        `Your water bill for ${periodLabel} is attached.\n\n` +
        `Amount payable: Rs. ${amount.toFixed(2)}\n` +
        (buildingLine ? `\n${buildingLine}\n` : "") +
        `\n— QubecSense`,
      attachments: [
        {
          filename: `qubecsense-bill-flat-${flat}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({ ok: true, sentTo: ownerEmail });
  } catch (err) {
    console.error("billing send error", err);
    return NextResponse.json(
      {
        error:
          err instanceof LiveDataError
            ? err.message
            : "Could not send the bill.",
      },
      { status: 502 }
    );
  }
}
