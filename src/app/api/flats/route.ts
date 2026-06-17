import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Installation } from "@/lib/models/Installation";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

/** Returns all flats annotated with whether they're already installed. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const [flats, installs] = await Promise.all([
    Flat.find().lean(),
    Installation.find({}, { flatNumber: 1 }).lean(),
  ]);

  const installedSet = new Set(installs.map((i: any) => i.flatNumber));

  const data = flats
    .map((f: any) => ({
      flatNumber: f.flatNumber,
      floor: f.floor,
      ownerName: f.ownerName,
      ownerEmail: f.ownerEmail,
      ownerPhone: f.ownerPhone,
      vacant: f.vacant,
      installed: installedSet.has(f.flatNumber),
    }))
    // Numeric order (101, 102 … 1001) rather than string order.
    .sort((a, b) => parseInt(a.flatNumber, 10) - parseInt(b.flatNumber, 10));

  return NextResponse.json({ flats: data });
}
