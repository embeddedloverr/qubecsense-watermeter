import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import {
  getSession,
  hashPassword,
  verifyPassword,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const { currentPassword, newPassword } = await req.json();

    if (!newPassword || String(newPassword).length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters." },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findById(session.sub);
    if (!user || !user.active) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // On a forced first-login change the user already authenticated with the
    // seeded password, so we don't re-ask for it. Voluntary changes must
    // confirm the current password.
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Enter your current password." },
          { status: 400 }
        );
      }
      const ok = await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "Current password is incorrect." },
          { status: 401 }
        );
      }
    }

    const sameAsOld = await verifyPassword(newPassword, user.passwordHash);
    if (sameAsOld) {
      return NextResponse.json(
        { error: "Choose a password different from your current one." },
        { status: 400 }
      );
    }

    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    await user.save();

    // Re-issue the session so mustChange clears immediately.
    const token = await createSessionToken({
      sub: user._id.toString(),
      name: user.name,
      email: user.email || "",
      role: user.role,
      username: user.username || undefined,
      flat: user.flatNumber || undefined,
      mustChange: false,
    });
    setSessionCookie(token);

    return NextResponse.json({ ok: true, role: user.role });
  } catch (err) {
    console.error("change password error", err);
    return NextResponse.json(
      { error: "Could not change your password. Please try again." },
      { status: 500 }
    );
  }
}
