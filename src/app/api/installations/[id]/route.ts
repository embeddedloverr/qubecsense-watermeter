import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Installation } from "@/lib/models/Installation";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const install = await Installation.findById(params.id).select("-__v").lean();
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
