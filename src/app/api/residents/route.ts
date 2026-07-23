import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Flat } from "@/lib/models/Flat";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/residents — all flat-wise resident accounts (admin only).
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const [residents, flats] = await Promise.all([
    User.find({ role: "resident" })
      .select("name username flatNumber phone active mustChangePassword lastLoginAt")
      .lean(),
    Flat.find({}, { flatNumber: 1, ownerEmail: 1 }).lean(),
  ]);

  // The login email lives on the flat (ownerEmail) — that's where OTP codes go.
  const emailByFlat = new Map(
    (flats as any[]).map((f) => [String(f.flatNumber), f.ownerEmail || ""])
  );

  // Sort by flat number numerically where possible.
  const rows = (residents as any[])
    .map((r) => ({
      id: String(r._id),
      name: r.name || "",
      username: r.username || "",
      flatNumber: r.flatNumber || "",
      phone: r.phone || "",
      email: emailByFlat.get(String(r.flatNumber)) || "",
      active: r.active !== false,
      pendingFirstLogin: r.mustChangePassword === true,
      lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null,
    }))
    .sort((a, b) => {
      const na = parseInt(a.flatNumber, 10);
      const nb = parseInt(b.flatNumber, 10);
      if (Number.isNaN(na) || Number.isNaN(nb)) {
        return a.flatNumber.localeCompare(b.flatNumber);
      }
      return na - nb;
    });

  return NextResponse.json({
    residents: rows,
    total: rows.length,
    neverLoggedIn: rows.filter((r) => !r.lastLoginAt).length,
    pendingFirstLogin: rows.filter((r) => r.pendingFirstLogin).length,
    inactive: rows.filter((r) => !r.active).length,
    noEmail: rows.filter((r) => !r.email).length,
  });
}
