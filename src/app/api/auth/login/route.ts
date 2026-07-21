import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import {
  createSessionToken,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Accept "identifier" (email or username); fall back to "email" for older clients.
    const identifier = String(body.identifier ?? body.email ?? "")
      .toLowerCase()
      .trim();
    const password = body.password;

    if (!identifier || !password) {
      return NextResponse.json(
        { error: "Username/email and password are required." },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (!user || !user.active) {
      return NextResponse.json(
        { error: "Invalid credentials or inactive account." },
        { status: 401 }
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid username/email or password." },
        { status: 401 }
      );
    }

    const token = await createSessionToken({
      sub: user._id.toString(),
      name: user.name,
      email: user.email || "",
      role: user.role,
      username: user.username || undefined,
      flat: user.flatNumber || undefined,
      mustChange: user.mustChangePassword === true,
    });
    setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email || "",
        username: user.username || "",
        role: user.role,
        mustChangePassword: user.mustChangePassword === true,
      },
    });
  } catch (err) {
    console.error("login error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
