import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Schedule } from "@/lib/models/Schedule";
import { Flat } from "@/lib/models/Flat";
import { User } from "@/lib/models/User";
import { getSession } from "@/lib/auth";
import { floorOf } from "@/lib/utils";

export const runtime = "nodejs";

/** List schedule entries. Admin sees all; technician sees their own. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const filter: Record<string, unknown> = {};

  if (session.role === "technician") {
    filter.technicianId = session.sub;
  } else if (searchParams.get("technicianId")) {
    filter.technicianId = searchParams.get("technicianId");
  }

  const status = searchParams.get("status");
  if (status) filter.status = status;

  const entries = await Schedule.find(filter)
    .sort({ scheduledDate: 1, flatNumber: 1 })
    .lean();

  return NextResponse.json({ schedule: entries });
}

/** Admin assigns one or more flats to a technician on a date. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { flatNumbers, technicianId, scheduledDate, notes } =
      await req.json();

    if (
      !Array.isArray(flatNumbers) ||
      flatNumbers.length === 0 ||
      !technicianId ||
      !scheduledDate
    ) {
      return NextResponse.json(
        { error: "Select at least one flat, a technician and a date." },
        { status: 400 }
      );
    }

    await connectDB();

    const tech = await User.findById(technicianId).lean<{
      _id: any;
      name: string;
      role: string;
    }>();
    if (!tech || tech.role !== "technician") {
      return NextResponse.json(
        { error: "Selected technician is invalid." },
        { status: 400 }
      );
    }

    const flats = await Flat.find({ flatNumber: { $in: flatNumbers } }).lean();
    const flatMap = new Map(flats.map((f: any) => [f.flatNumber, f]));

    const docs = flatNumbers.map((fn: string) => {
      const f: any = flatMap.get(fn);
      return {
        flatNumber: fn,
        floor: f?.floor ?? floorOf(fn),
        ownerName: f?.ownerName ?? "",
        scheduledDate: new Date(scheduledDate),
        technicianId: tech._id,
        technicianName: tech.name,
        status: "planned" as const,
        notes: notes || "",
      };
    });

    const created = await Schedule.insertMany(docs as any);
    return NextResponse.json(
      { created: created.length },
      { status: 201 }
    );
  } catch (err) {
    console.error("create schedule error", err);
    return NextResponse.json(
      { error: "Failed to create schedule." },
      { status: 500 }
    );
  }
}

/** Admin removes a schedule entry. */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await connectDB();
  await Schedule.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
