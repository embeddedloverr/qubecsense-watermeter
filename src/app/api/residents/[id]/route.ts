import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { getSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unambiguous alphabet (no 0/O/1/l/I), same as the seed script.
const PW_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomPassword(len = 10) {
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[randomInt(PW_ALPHABET.length)];
  return out;
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

// PATCH /api/residents/<id>  { active: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { active } = await req.json();
    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "Pass { active: true | false }." },
        { status: 400 }
      );
    }

    const user = await loadResident(params.id);
    if (!user) {
      return NextResponse.json({ error: "Resident not found." }, { status: 404 });
    }

    user.active = active;
    await user.save();

    return NextResponse.json({ id: String(user._id), active: user.active });
  } catch (err) {
    console.error("update resident error", err);
    return NextResponse.json(
      { error: "Could not update the account." },
      { status: 500 }
    );
  }
}
