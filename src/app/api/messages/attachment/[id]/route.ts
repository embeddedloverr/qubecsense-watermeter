import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { MessageAttachment } from "@/lib/models/MessageAttachment";
import { getSession } from "@/lib/auth";
import { guard } from "@/lib/guard";

export const runtime = "nodejs";

// Serves one chat image.
//
// Two callers, two different rules, and both are narrow:
//   - a resident may read attachments on THEIR OWN flat's thread only, so an
//     id from a neighbour's conversation is a 404 even though they are signed
//     in. (This is the mistake /api/photos/[id] originally shipped with.)
//   - an admin needs the messaging capability, and only within their own site.
// Technicians have no chat and are refused.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let filter: Record<string, unknown>;

  if (session.role === "resident") {
    if (!session.flat || !session.siteId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter = {
      _id: params.id,
      siteId: session.siteId,
      flatNumber: session.flat,
    };
  } else if (session.role === "admin" || session.role === "superadmin") {
    const g = await guard("messaging");
    if (!g.ok) return g.res;
    filter = { _id: params.id, siteId: g.ctx.siteId };
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  // No .lean() — Mongoose must convert BSON Binary to a Node Buffer.
  const att = await MessageAttachment.findOne(filter).select(
    "data contentType"
  );
  if (!att) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(att.data as Buffer), {
    status: 200,
    headers: {
      "Content-Type": att.contentType,
      "Content-Disposition": "inline",
      // Stored bytes are always re-encoded JPEG, but say so explicitly rather
      // than letting a browser sniff its way to something else.
      "X-Content-Type-Options": "nosniff",
      // Caching matters here — the thread re-renders every 12s and these are
      // photos. But the cache key must include the session, or on a shared
      // phone the next person to sign in could be served the previous
      // resident's image straight from the browser cache without the request
      // ever reaching the checks above.
      "Cache-Control": "private, max-age=86400",
      Vary: "Cookie",
    },
  });
}
