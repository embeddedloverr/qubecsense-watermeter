import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Installation } from "@/lib/models/Installation";
import { Flat } from "@/lib/models/Flat";
import { Photo } from "@/lib/models/Photo";
import { Schedule } from "@/lib/models/Schedule";
import { getSession } from "@/lib/auth";
import { compressImage, compressSignature } from "@/lib/image";
import { floorOf } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** List installations. Admins see all; technicians see their own. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const mine = searchParams.get("mine") === "1";

  const filter: Record<string, unknown> = {};
  if (session.role === "technician" || mine) {
    filter.technicianId = session.sub;
  }

  const installs = await Installation.find(filter)
    .sort({ createdAt: -1 })
    .select("-__v")
    .lean();

  return NextResponse.json({ installations: installs });
}

/** Create a new installation record with compressed photos + signature. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      flatNumber,
      installationDate,
      kitchenSerial,
      kitchenPhoto,
      bathroomSerial,
      bathroomPhoto,
      signature,
      ownerConfirmed,
      remarks,
    } = body ?? {};

    // --- Validation ---
    const missing: string[] = [];
    if (!flatNumber) missing.push("flat");
    if (!installationDate) missing.push("installation date");
    if (!kitchenSerial) missing.push("kitchen meter serial");
    if (!kitchenPhoto) missing.push("kitchen meter photo");
    if (!bathroomSerial) missing.push("bathroom meter serial");
    if (!bathroomPhoto) missing.push("bathroom meter photo");
    if (!signature) missing.push("owner signature");
    if (missing.length) {
      return NextResponse.json(
        { error: `Please provide: ${missing.join(", ")}.` },
        { status: 400 }
      );
    }
    if (!ownerConfirmed) {
      return NextResponse.json(
        { error: "Owner confirmation is required before saving." },
        { status: 400 }
      );
    }

    await connectDB();

    const existing = await Installation.findOne({ flatNumber }).lean();
    if (existing) {
      return NextResponse.json(
        { error: `Flat ${flatNumber} is already marked as installed.` },
        { status: 409 }
      );
    }

    const flat = await Flat.findOne({ flatNumber }).lean();
    if (!flat) {
      return NextResponse.json(
        { error: `Flat ${flatNumber} not found.` },
        { status: 404 }
      );
    }

    // --- Compress + store media ---
    const [kImg, bImg, sImg] = await Promise.all([
      compressImage(kitchenPhoto),
      compressImage(bathroomPhoto),
      compressSignature(signature),
    ]);

    const [kPhoto, bPhoto, sPhoto] = await Photo.create([
      { kind: "kitchen", ...kImg },
      { kind: "bathroom", ...bImg },
      { kind: "signature", ...sImg },
    ]);

    const f: any = flat;
    const installation = await Installation.create({
      flatNumber,
      floor: f.floor ?? floorOf(flatNumber),
      ownerName: f.ownerName,
      ownerEmail: f.ownerEmail,
      ownerPhone: f.ownerPhone,
      installationDate: new Date(installationDate),
      kitchen: { meterSerial: kitchenSerial, photoId: kPhoto._id },
      bathroom: { meterSerial: bathroomSerial, photoId: bPhoto._id },
      signatureId: sPhoto._id,
      ownerConfirmed: true,
      remarks: remarks || "",
      technicianId: session.sub,
      technicianName: session.name,
      status: "completed",
    } as any);

    // Close out any open schedule entry for this flat.
    await Schedule.updateMany(
      { flatNumber, status: "planned" },
      { $set: { status: "completed" } }
    );

    return NextResponse.json(
      { id: installation._id.toString(), ok: true },
      { status: 201 }
    );
  } catch (err: any) {
    if (err?.code === 11000) {
      return NextResponse.json(
        { error: "This flat is already installed." },
        { status: 409 }
      );
    }
    console.error("create installation error", err);
    return NextResponse.json(
      { error: "Failed to save installation. Please retry." },
      { status: 500 }
    );
  }
}
