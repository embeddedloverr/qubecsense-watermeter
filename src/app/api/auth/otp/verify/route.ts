import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { findUserByIdentifier } from "@/lib/authLookup";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { verifyOtp, OTP_MAX_ATTEMPTS } from "@/lib/otp";

export const runtime = "nodejs";

// POST /api/auth/otp/verify  { identifier, otp }
export async function POST(req: NextRequest) {
  try {
    const { identifier, otp } = await req.json();
    if (!identifier || !otp) {
      return NextResponse.json(
        { error: "Enter the code we emailed you." },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await findUserByIdentifier(identifier);
    if (!user || !user.active) {
      return NextResponse.json({ error: "Invalid code." }, { status: 401 });
    }

    if (!user.otpHash || !user.otpExpiresAt) {
      return NextResponse.json(
        { error: "Request a new code to continue." },
        { status: 401 }
      );
    }
    if (Date.now() > new Date(user.otpExpiresAt).getTime()) {
      return NextResponse.json(
        { error: "That code has expired. Request a new one." },
        { status: 401 }
      );
    }
    if ((user.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
      // Burn the code so it can't be brute-forced further.
      user.otpHash = undefined;
      user.otpExpiresAt = undefined;
      await user.save();
      return NextResponse.json(
        { error: "Too many attempts. Request a new code." },
        { status: 401 }
      );
    }

    if (!verifyOtp(String(otp).trim(), user.otpHash)) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      await user.save();
      return NextResponse.json({ error: "Incorrect code." }, { status: 401 });
    }

    // Success — burn the code and start a session.
    user.otpHash = undefined;
    user.otpExpiresAt = undefined;
    user.otpAttempts = 0;
    user.lastLoginAt = new Date();
    await user.save();

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
        role: user.role,
        // True when the resident has never set a password of their own — the
        // "Password" page will let them add one without asking for a current
        // password, but they are not forced to.
        hasPassword: user.mustChangePassword !== true,
      },
    });
  } catch (err) {
    console.error("otp verify error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
