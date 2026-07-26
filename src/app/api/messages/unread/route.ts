import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/messages/unread — total unread resident messages (admin nav badge).
export async function GET() {
  const g = await guard("messaging");
  if (!g.ok) return g.res;

  await connectDB();
  const count = await Message.countDocuments({
    siteId: g.ctx.siteId,
    sender: "resident",
    readByAdmin: false,
  });
  return NextResponse.json({ count });
}
