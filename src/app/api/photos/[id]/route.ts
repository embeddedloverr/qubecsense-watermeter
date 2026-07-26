import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Photo } from "@/lib/models/Photo";
import { getSession } from "@/lib/auth";
import { guard, guardSite } from "@/lib/guard";

export const runtime = "nodejs";

// Meter photos and owner signatures. Previously any signed-in user could read
// any photo by id (an IDOR — a resident could enumerate other flats' photos
// and signatures). Now: staff only, and only within their own site.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Residents have no UI for these and must not be able to enumerate them.
  if (session.role === "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Admins need the records capability; technicians just need to be in the site.
  const g =
    session.role === "technician" ? await guardSite() : await guard("records");
  if (!g.ok) return g.res;

  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDB();
  // Don't use .lean() — Mongoose must convert BSON Binary → Node Buffer for us.
  const photo = await Photo.findOne({
    _id: params.id,
    siteId: g.ctx.siteId,
  }).select("data contentType");

  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = new Uint8Array(photo.data as Buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
