import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Message } from "@/lib/models/Message";
import { Flat } from "@/lib/models/Flat";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/messages — one row per flat that has a conversation (admin only).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const threads = await Message.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$flatNumber",
        lastBody: { $first: "$body" },
        lastSender: { $first: "$sender" },
        lastAt: { $first: "$createdAt" },
        unread: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$sender", "resident"] }, { $eq: ["$readByAdmin", false] }] },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { lastAt: -1 } },
  ]);

  const flats = await Flat.find({}, { flatNumber: 1, ownerName: 1 }).lean();
  const nameByFlat = new Map(
    (flats as any[]).map((f) => [String(f.flatNumber), f.ownerName || ""])
  );

  const rows = threads.map((t: any) => ({
    flat: t._id,
    ownerName: nameByFlat.get(String(t._id)) || "",
    lastBody: t.lastBody,
    lastSender: t.lastSender,
    lastAt: new Date(t.lastAt).toISOString(),
    unread: t.unread,
  }));

  return NextResponse.json({
    threads: rows,
    totalUnread: rows.reduce((a, r) => a + r.unread, 0),
  });
}
