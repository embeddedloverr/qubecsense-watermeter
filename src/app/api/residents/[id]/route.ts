import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Flat } from "@/lib/models/Flat";
import { getSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unambiguous alphabet (no 0/O/1/l/I), same as the seed script. The result is
// guaranteed to contain a lower case letter, a capital and a digit so it
// satisfies the same policy residents must meet when they choose their own.
const PW_LOWER = "abcdefghjkmnpqrstuvwxyz";
const PW_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const PW_DIGITS = "23456789";
const PW_ALL = PW_LOWER + PW_UPPER + PW_DIGITS;

function randomPassword(len = 10) {
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(PW_LOWER), pick(PW_UPPER), pick(PW_DIGITS)];
  while (chars.length < len) chars.push(pick(PW_ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

async function loadResident(id: string) {
  await connectDB();
  const user = await User.findById(id);
  if (!user || user.role !== "resident") return null;
  return user;
}

// POST /api/residents/<id>  { action: "reset-password" }
// Issues a new one-time password. The plaintext is returned exactly once —
// it is never stored, only its bcrypt hash.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { action } = await req.json();
    if (action !== "reset-password") {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const user = await loadResident(params.id);
    if (!user) {
      return NextResponse.json({ error: "Resident not found." }, { status: 404 });
    }

    const password = randomPassword();
    user.passwordHash = await hashPassword(password);
    user.mustChangePassword = true;
    await user.save();

    return NextResponse.json({
      password,
      username: user.username,
      flatNumber: user.flatNumber,
    });
  } catch (err) {
    console.error("reset resident password error", err);
    return NextResponse.json(
      { error: "Could not reset the password." },
      { status: 500 }
    );
  }
}

// PATCH /api/residents/<id>
//   { active: boolean }  — enable/disable the account
//   { email: string }    — set/change the flat's login email (where OTPs go)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const user = await loadResident(params.id);
    if (!user) {
      return NextResponse.json({ error: "Resident not found." }, { status: 404 });
    }

    // Email change → update the flat's ownerEmail (OTP delivery address).
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { error: "Enter a valid email address." },
          { status: 400 }
        );
      }
      await Flat.updateOne(
        { flatNumber: user.flatNumber },
        { $set: { ownerEmail: email } }
      );
      return NextResponse.json({ id: String(user._id), email });
    }

    // Active toggle.
    if (typeof body.active === "boolean") {
      user.active = body.active;
      await user.save();
      return NextResponse.json({ id: String(user._id), active: user.active });
    }

    return NextResponse.json(
      { error: "Pass { active } or { email }." },
      { status: 400 }
    );
  } catch (err) {
    console.error("update resident error", err);
    return NextResponse.json(
      { error: "Could not update the account." },
      { status: 500 }
    );
  }
}
