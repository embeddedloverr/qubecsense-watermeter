import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/manifest.json", "/favicon.ico"];

function homeFor(role: string): string {
  if (role === "admin") return "/admin/live-data";
  if (role === "resident") return "/resident";
  return "/technician";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public + static + PWA assets through.
  if (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/workbox-") ||
    pathname === "/sw.js" ||
    // Any request for a file with an extension (png, svg, json, js, txt…).
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // Seeded accounts must set their own password before using the app.
  if (session.mustChange && pathname !== "/change-password") {
    const url = req.nextUrl.clone();
    url.pathname = "/change-password";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Keep each role inside its own area.
  const wrongArea =
    (pathname.startsWith("/admin") && session.role !== "admin") ||
    (pathname.startsWith("/technician") && session.role !== "technician") ||
    (pathname.startsWith("/resident") && session.role !== "resident");

  if (wrongArea) {
    const url = req.nextUrl.clone();
    url.pathname = homeFor(session.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protect everything except API, static files and the service worker.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|workbox).*)"],
};
