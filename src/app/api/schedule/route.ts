import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Schedule } from "@/lib/models/Schedule";
import { Flat } from "@/lib/models/Flat";
import { User } from "@/lib/models/User";
import { getSession } from "@/lib/auth";
import { guard, guardSite } from "@/lib/guard";
import { floorOf } from "@/lib/utils";

export const runtime = "nodejs";

/** List schedule entries. Admin sees all; technician sees their own. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role === "resident") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // ?site=<id> lets a superadmin plan another site from the site view.
  // guard() only honours it when the caller actually has access to that site.
  const explicitSite = req.nextUrl.searchParams.get("site") || undefined;
  const g =
    session.role === "technician"
      ? await guardSite()
      : await guard("schedule", { siteId: explicitSite });
  if (!g.ok) return g.res;

  await connectDB();

  const { searchParams } = new URL(req.url);
  const filter: Record<string, unknown> = { siteId: g.ctx.siteId };

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
  const gp = await guard("schedule", {
    siteId: req.nextUrl.searchParams.get("site") || undefined,
  });
  if (!gp.ok) return gp.res;
  const siteId = gp.ctx.siteId;

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

    // Scoped so another site's technician cannot be assigned work here.
    const tech = await User.findOne({
      _id: technicianId,
      role: "technician",
      siteId,
    }).lean<{ _id: any; name: string; role: string }>();
    if (!tech) {
      return NextResponse.json(
        { error: "Selected technician is invalid." },
        { status: 400 }
      );
    }

    const flats = await Flat.find({
      flatNumber: { $in: flatNumbers },
      siteId,
    }).lean();
    const flatMap = new Map(flats.map((f: any) => [f.flatNumber, f]));

    const docs = flatNumbers.map((fn: string) => {
      const f: any = flatMap.get(fn);
      return {
        siteId,
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
  const g = await guard("schedule", {
    siteId: req.nextUrl.searchParams.get("site") || undefined,
  });
  if (!g.ok) return g.res;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await connectDB();
  // Scoped so an id from another site cannot be deleted.
  await Schedule.findOneAndDelete({ _id: id, siteId: g.ctx.siteId });
  return NextResponse.json({ ok: true });
}
