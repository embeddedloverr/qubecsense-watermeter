import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/messages/unread — total unread resident messages (admin nav badge).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const count = await Message.countDocuments({
    sender: "resident",
    readByAdmin: false,
  });
  return NextResponse.json({ count });
}
