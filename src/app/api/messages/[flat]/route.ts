import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { Flat } from "@/lib/models/Flat";
import { guard } from "@/lib/guard";
import { sendMail, isMailConfigured } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialise(m: any) {
  return {
    id: String(m._id),
    sender: m.sender,
    senderName: m.senderName || "",
    body: m.body,
    category: m.category || null,
    createdAt: new Date(m.createdAt).toISOString(),
  };
}

// GET /api/messages/<flat> — full thread; marks resident messages read.
export async function GET(
  _req: NextRequest,
  { params }: { params: { flat: string } }
) {
  const g = await guard("messaging");
  if (!g.ok) return g.res;
  const flat = params.flat;
  const siteId = g.ctx.siteId;

  await connectDB();
  const [messages, flatDoc] = await Promise.all([
    Message.find({ flatNumber: flat, siteId }).sort({ createdAt: 1 }).lean(),
    Flat.findOne({ flatNumber: flat, siteId }, { ownerName: 1, ownerPhone: 1 }).lean(),
  ]);

  await Message.updateMany(
    { flatNumber: flat, siteId, sender: "resident", readByAdmin: false },
    { $set: { readByAdmin: true } }
  );

  return NextResponse.json({
    flat,
    ownerName: (flatDoc as any)?.ownerName || "",
    ownerPhone: (flatDoc as any)?.ownerPhone || "",
    messages: (messages as any[]).map(serialise),
  });
}

// POST /api/messages/<flat>  { body }  — admin reply.
export async function POST(
  req: NextRequest,
  { params }: { params: { flat: string } }
) {
  const g = await guard("messaging");
  if (!g.ok) return g.res;
  const session = g.ctx.session;
  const flat = params.flat;
  const siteId = g.ctx.siteId;

  try {
    const { body } = await req.json();
    const text = String(body || "").trim();
    if (!text) {
      return NextResponse.json({ error: "Type a reply." }, { status: 400 });
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }

    await connectDB();
    const msg = await Message.create({
      siteId,
      flatNumber: flat,
      sender: "admin",
      senderName: session.name || "Admin",
      body: text,
      readByAdmin: true,
      readByResident: false,
    });

    // Notify the resident by email (best-effort).
    const flatDoc = await Flat.findOne({ flatNumber: flat, siteId }, { ownerEmail: 1, ownerName: 1 }).lean();
    const to = (flatDoc as any)?.ownerEmail;
    if (isMailConfigured() && to) {
      const appUrl = (process.env.APP_URL || "https://meters.qubecsense.com").replace(/\/$/, "");
      sendMail({
        to,
        subject: `Reply from QubecSense — Flat ${flat}`,
        text: `The QubecSense team replied to your message:\n\n${text}\n\nSign in to reply: ${appUrl}/login`,
      }).catch((e) => console.error("resident notify failed", e));
    }

    return NextResponse.json({ message: serialise(msg) }, { status: 201 });
  } catch (err) {
    console.error("admin reply error", err);
    return NextResponse.json({ error: "Could not send." }, { status: 500 });
  }
}
