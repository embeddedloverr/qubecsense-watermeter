import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { getSession, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const techs = await User.find({ role: "technician" })
    .select("name email phone active createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ technicians: techs });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { name, email, password, phone } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email and password are required." },
        { status: 400 }
      );
    }
    if (String(password).length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    await connectDB();
    const exists = await User.findOne({
      email: String(email).toLowerCase().trim(),
    });
    if (exists) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 }
      );
    }

    const user = await User.create({
      name,
      email: String(email).toLowerCase().trim(),
      phone: phone || "",
      passwordHash: await hashPassword(password),
      role: "technician",
      active: true,
    });

    return NextResponse.json(
      {
        technician: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("create technician error", err);
    return NextResponse.json(
      { error: "Failed to create technician." },
      { status: 500 }
    );
  }
}
