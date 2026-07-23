import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { findUserByIdentifier, deliveryEmailFor } from "@/lib/authLookup";
import { sendMail, isMailConfigured } from "@/lib/mailer";
import {
  generateOtp,
  hashOtp,
  maskEmail,
  OTP_TTL_MS,
  OTP_RESEND_MS,
} from "@/lib/otp";

export const runtime = "nodejs";

// POST /api/auth/otp/request  { identifier }
// Emails a one-time code to the account's email. Always returns a generic
// success so the endpoint can't be used to discover which accounts exist.
export async function POST(req: NextRequest) {
  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Email login is not available. Please use your password." },
      { status: 503 }
    );
  }

  try {
    const { identifier } = await req.json();
    if (!identifier || typeof identifier !== "string") {
      return NextResponse.json(
        { error: "Enter your username or email." },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await findUserByIdentifier(identifier);

    // Generic response used whether or not the account exists / has an email.
    const generic = NextResponse.json({
      ok: true,
      message: "If an account exists, a code has been sent.",
    });

    if (!user || !user.active) return generic;

    const email = await deliveryEmailFor(user);
    if (!email) return generic;

    // Throttle resends.
    if (
      user.otpLastSentAt &&
      Date.now() - new Date(user.otpLastSentAt).getTime() < OTP_RESEND_MS
    ) {
      return NextResponse.json(
        {
          ok: true,
          email: maskEmail(email),
          message: "A code was just sent. Please wait a moment before retrying.",
        },
        { status: 429 }
      );
    }

    const otp = generateOtp();
    user.otpHash = hashOtp(otp);
    user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    user.otpAttempts = 0;
    user.otpLastSentAt = new Date();
    await user.save();

    // Dev convenience: never runs in a production build.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[otp-dev] ${user.username || user.email}: ${otp}`);
    }

    const minutes = Math.round(OTP_TTL_MS / 60000);
    await sendMail({
      to: email,
      subject: `${otp} is your QubecSense login code`,
      text: [
        `Your QubecSense login code is: ${otp}`,
        "",
        `It is valid for ${minutes} minutes. Enter it on the sign-in page to log in.`,
        "",
        "If you did not request this, you can ignore this email.",
        "",
        "— QubecSense",
      ].join("\n"),
      html: `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
        <table role="presentation" width="100%"><tr><td align="center">
          <table role="presentation" width="440" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
            <tr><td style="background:#0369a1;padding:18px 24px">
              <span style="color:#fff;font-size:19px;font-weight:700">QubecSense</span>
              <span style="color:#bae6fd;font-size:12px;display:block;letter-spacing:1px">WATER METER PORTAL</span>
            </td></tr>
            <tr><td style="padding:24px;text-align:center">
              <p style="margin:0 0 8px;color:#475569">Your login code</p>
              <p style="margin:0 0 14px;font-size:34px;font-weight:700;letter-spacing:8px;font-family:Consolas,monospace">${otp}</p>
              <p style="margin:0;font-size:14px;color:#64748b">Valid for ${minutes} minutes. Enter it on the sign-in page.</p>
            </td></tr>
            <tr><td style="padding:12px 24px;border-top:1px solid #e2e8f0;background:#f8fafc">
              <p style="margin:0;font-size:12px;color:#94a3b8">If you did not request this, you can ignore this email. — QubecSense</p>
            </td></tr>
          </table>
        </td></tr></table>
      </body></html>`,
    });

    return NextResponse.json({
      ok: true,
      email: maskEmail(email),
      message: "A login code has been sent to your email.",
    });
  } catch (err) {
    console.error("otp request error", err);
    return NextResponse.json(
      { error: "Could not send the code. Please try again." },
      { status: 500 }
    );
  }
}
