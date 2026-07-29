import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Site } from "@/lib/models/Site";
import { Flat } from "@/lib/models/Flat";
import { User } from "@/lib/models/User";
import { guardSuperadmin } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { parseFlatCsv } from "@/lib/csv";
import { floorOf } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Onboard a site's flats and resident logins. This is what scripts/seed.mjs
// did for Rosalyn, moved server-side and parameterised by site.
//
// Residents sign in with an emailed one-time code, so no password is
// distributed: each account gets a random undisclosed password and
// mustChangePassword, meaning "has not chosen one yet".

const PW = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const undisclosedPassword = () =>
  Array.from({ length: 16 }, () => PW[randomInt(PW.length)]).join("");

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const g = await guardSuperadmin();
  if (!g.ok) return g.res;

  try {
    const { csv, createResidents = true, dryRun = false } = await req.json();
    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ error: "Paste some CSV first." }, { status: 400 });
    }

    await connectDB();
    if (!Types.ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Site not found." }, { status: 404 });
    }
    const site = await Site.findById(params.id)
      .select("_id name residentUsernamePrefix")
      .lean<{ _id: any; name: string; residentUsernamePrefix: string }>();
    if (!site) {
      return NextResponse.json({ error: "Site not found." }, { status: 404 });
    }

    const { rows, errors } = parseFlatCsv(csv);
    if (!rows.length) {
      return NextResponse.json(
        { error: "No usable rows found.", errors },
        { status: 400 }
      );
    }

    const siteId = site._id;
    const prefix = site.residentUsernamePrefix;

    // What already exists, so the preview is accurate and the write idempotent.
    const existingFlats = new Set(
      (
        await Flat.find({ siteId }, { flatNumber: 1 }).lean<any[]>()
      ).map((f) => String(f.flatNumber))
    );
    const usernames = rows.map((r) => `${prefix}_${r.flatNumber}`.toLowerCase());
    const takenUsernames = new Set(
      (
        await User.find({ username: { $in: usernames } }, { username: 1 }).lean<any[]>()
      ).map((u) => String(u.username))
    );

    const newFlats = rows.filter((r) => !existingFlats.has(r.flatNumber)).length;
    const updatedFlats = rows.length - newFlats;
    const newResidents = createResidents
      ? usernames.filter((u) => !takenUsernames.has(u)).length
      : 0;
    const withEmail = rows.filter((r) => r.ownerEmail).length;

    const summary = {
      site: site.name,
      parsed: rows.length,
      newFlats,
      updatedFlats,
      newResidents,
      existingResidents: createResidents ? usernames.length - newResidents : 0,
      withEmail,
      withoutEmail: rows.length - withEmail,
      errors,
    };

    if (dryRun) return NextResponse.json({ dryRun: true, ...summary });

    // --- Flats (upsert, scoped to the site) ---
    await Flat.bulkWrite(
      rows.map((r) => ({
        updateOne: {
          filter: { siteId, flatNumber: r.flatNumber },
          update: {
            $set: {
              siteId,
              flatNumber: r.flatNumber,
              floor: floorOf(r.flatNumber),
              ownerName: r.ownerName,
              ownerEmail: r.ownerEmail,
              ownerPhone: r.ownerPhone,
              vacant: false,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    // --- Resident logins ---
    let created = 0;
    if (createResidents) {
      for (const r of rows) {
        const username = `${prefix}_${r.flatNumber}`.toLowerCase();
        if (takenUsernames.has(username)) continue;
        await User.create({
          siteId,
          name: r.ownerName || `Flat ${r.flatNumber}`,
          username,
          passwordHash: await hashPassword(undisclosedPassword()),
          role: "resident",
          flatNumber: r.flatNumber,
          phone: r.ownerPhone || "",
          active: true,
          // No password has been chosen; sign-in is by emailed code.
          mustChangePassword: true,
        });
        created++;
      }
    }

    return NextResponse.json({ ...summary, newResidents: created });
  } catch (err: any) {
    console.error("site import error", err);

    // Report which key actually collided — guessing sends you chasing the
    // wrong thing (a stale global flatNumber index looks like a username clash).
    const dup = err?.code === 11000 ? err : err?.writeErrors?.[0]?.err;
    if (dup?.code === 11000 || err?.code === 11000) {
      const pattern = dup?.keyPattern || err?.keyPattern || {};
      const fields = Object.keys(pattern).join(", ");
      const onUsername = "username" in pattern;
      return NextResponse.json(
        {
          error: onUsername
            ? "A resident username collided — check that this site's username prefix is unique."
            : `Duplicate key on [${fields || "unknown"}]. If this names flatNumber without siteId, a legacy global index still exists: run migrate-multisite --phase=drop-legacy.`,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Import failed." }, { status: 500 });
  }
}
