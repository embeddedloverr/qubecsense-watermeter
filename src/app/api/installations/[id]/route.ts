import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Installation } from "@/lib/models/Installation";
import { Types } from "mongoose";
import { getSession } from "@/lib/auth";
import { guard, guardSite } from "@/lib/guard";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const g =
    session.role === "technician" ? await guardSite() : await guard("records");
  if (!g.ok) return g.res;

  await connectDB();
  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Scoped by site so an id from another site cannot be read.
  const install = await Installation.findOne({
    _id: params.id,
    siteId: g.ctx.siteId,
  })
    .select("-__v")
    .lean();
  if (!install) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Technicians may only view their own records.
  if (
    session.role === "technician" &&
    String((install as any).technicianId) !== session.sub
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ installation: install });
}
