import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { Flat } from "@/lib/models/Flat";
import { getSession } from "@/lib/auth";
import { sendMail, isMailConfigured } from "@/lib/mailer";
import {
  storeAttachment,
  linkAttachment,
  attachmentPayload,
  AttachmentError,
} from "@/lib/messageAttachment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialise(m: any) {
  return {
    id: String(m._id),
    sender: m.sender,
    senderName: m.senderName || "",
    body: m.body || "",
    category: m.category || null,
    attachment: attachmentPayload(m),
    createdAt: new Date(m.createdAt).toISOString(),
  };
}

// GET /api/resident/messages — the signed-in resident's thread (their flat).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const flat = session.flat || "";
  if (!flat) return NextResponse.json({ messages: [] });

  await connectDB();
  const siteId = session.siteId;
  const messages = await Message.find({ flatNumber: flat, siteId })
    .sort({ createdAt: 1 })
    .lean();

  // Mark admin messages as read by the resident.
  await Message.updateMany(
    { flatNumber: flat, siteId, sender: "admin", readByResident: false },
    { $set: { readByResident: true } }
  );

  return NextResponse.json({ messages: (messages as any[]).map(serialise) });
}

// POST /api/resident/messages  { body, category? }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const flat = session.flat || "";
  if (!flat) {
    return NextResponse.json({ error: "No flat on your account." }, { status: 400 });
  }

  try {
    const { body, category, image } = await req.json();
    const text = String(body || "").trim();
    const hasImage = typeof image === "string" && image !== "";
    // A photo on its own is a complete message — "here is the leak".
    if (!text && !hasImage) {
      return NextResponse.json(
        { error: "Type a message or attach a photo." },
        { status: 400 }
      );
    }
    if (text.length > 2000) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }

    await connectDB();

    let attachment = null;
    try {
      attachment = await storeAttachment({
        dataUrl: image,
        siteId: session.siteId,
        flatNumber: flat,
      });
    } catch (e) {
      if (e instanceof AttachmentError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const msg = await Message.create({
      siteId: session.siteId,
      flatNumber: flat,
      sender: "resident",
      senderName: session.name,
      body: text,
      category: category ? String(category).slice(0, 40) : undefined,
      readByResident: true,
      readByAdmin: false,
      ...(attachment || {}),
    });
    if (attachment) await linkAttachment(attachment.attachmentId, msg._id);

    // Notify the admin inbox by email (best-effort).
    const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER;
    if (isMailConfigured() && to) {
      const appUrl = (process.env.APP_URL || "https://meters.qubecsense.com").replace(/\/$/, "");
      const flatDoc = await Flat.findOne(
        { flatNumber: flat, siteId: session.siteId },
        { ownerName: 1 }
      ).lean();
      const who = (flatDoc as any)?.ownerName || session.name || `Flat ${flat}`;
      const tag = category ? `[${category}] ` : "";
      // The image is not attached to the email — it is only viewable behind a
      // signed-in session, so the notification points at the thread instead.
      const photoNote = attachment ? "\n\n📷 A photo is attached to this message — open the thread to view it." : "";
      sendMail({
        to,
        subject: `New message from Flat ${flat}${attachment ? " (with photo)" : ""}${category ? ` — ${category}` : ""}`,
        text: `${who} (Flat ${flat}) wrote:\n\n${tag}${text || "(no text)"}${photoNote}\n\nReply: ${appUrl}/admin/messages`,
      }).catch((e) => console.error("admin notify failed", e));
    }

    return NextResponse.json({ message: serialise(msg) }, { status: 201 });
  } catch (err) {
    console.error("resident message error", err);
    return NextResponse.json({ error: "Could not send." }, { status: 500 });
  }
}
