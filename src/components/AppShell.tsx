"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Role, Capability } from "@/lib/session";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import {
  IconHome,
  IconNewInstall,
  IconDashboard,
  IconCalendar,
  IconUsers,
  IconLogout,
  IconGauge,
  IconRupee,
  IconDroplet,
  IconPen,
  IconMessage,
} from "./icons";

export interface NavUser {
  name: string;
  email: string;
  role: Role;
  /** Granted capabilities. Undefined means "no filtering" (technician/resident). */
  caps?: Capability[];
  siteName?: string;
  /** True when a superadmin is acting inside a site. */
  acting?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** Hidden unless the user holds this capability. */
  cap?: Capability;
  /** Superadmin-only section — a site admin never sees it. */
  superOnly?: boolean;
}

const techNav: NavItem[] = [
  { href: "/technician", label: "Home", icon: IconHome },
  { href: "/technician/new", label: "Install", icon: IconNewInstall },
];

const adminNav: NavItem[] = [
  { href: "/admin/live-data", label: "Live Data", icon: IconGauge, cap: "view_data" },
  { href: "/admin/billing", label: "Billing", icon: IconRupee, cap: "billing" },
  { href: "/admin", label: "Overview", icon: IconDashboard, superOnly: true },
  { href: "/admin/schedule", label: "Schedule", icon: IconCalendar, cap: "schedule", superOnly: true },
  { href: "/admin/installations", label: "Records", icon: IconHome, cap: "records" },
  { href: "/admin/residents", label: "Residents", icon: IconUsers, cap: "residents" },
  { href: "/admin/messages", label: "Messages", icon: IconMessage, cap: "messaging" },
  { href: "/admin/technicians", label: "Team", icon: IconUsers, cap: "technicians", superOnly: true },
];

const residentNav: NavItem[] = [
  { href: "/resident", label: "My Water", icon: IconDroplet },
  { href: "/change-password", label: "Password", icon: IconPen },
];

export function AppShell({
  user,
  children,
}: {
  user: NavUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const baseNav =
    user.role === "admin" || user.role === "superadmin"
      ? adminNav
      : user.role === "resident"
        ? residentNav
        : techNav;

  // Hide anything the admin has not been granted. caps undefined means the
  // role has no capability model (technician / resident / superadmin), so
  // show everything.
  //
  // superOnly is checked against the role rather than the capability set on
  // purpose: sessions last 7 days, so an admin signed in before this shipped
  // still carries the old caps in their token and would otherwise keep seeing
  // links that now redirect.
  const nav = baseNav.filter(
    (i) =>
      (!i.superOnly || user.role === "superadmin") &&
      (!user.caps || !i.cap || user.caps.includes(i.cap))
  );

  const can = (c: Capability) => !user.caps || user.caps.includes(c);

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/admin" &&
      href !== "/technician" &&
      href !== "/resident" &&
      pathname.startsWith(href));

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  // Live unread-message badge on the admin Messages nav item.
  const [unread, setUnread] = React.useState(0);
  const canMessage = can("messaging");
  React.useEffect(() => {
    if (user.role !== "admin" && user.role !== "superadmin") return;
    // Without the capability this would 403 every 20 seconds.
    if (!canMessage) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/messages/unread", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && res.ok) setUnread(data.count || 0);
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // Re-check when navigating (e.g. after opening a thread marks it read).
  }, [user.role, canMessage, pathname]);

  const badgeFor = (href: string) =>
    href === "/admin/messages" && unread > 0 ? unread : 0;

  const exitSite = async () => {
    await fetch("/api/session/site", { method: "DELETE" });
    router.replace("/superadmin");
    router.refresh();
  };

  return (
    <div className="min-h-dvh">
      {/* A superadmin is looking at someone else's site — make that obvious. */}
      {user.acting && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-center text-sm font-medium text-warning-foreground">
          <span>
            Viewing <strong>{user.siteName || "a site"}</strong> as superadmin
          </span>
          <button
            onClick={exitSite}
            className="rounded-md bg-black/15 px-2.5 py-0.5 text-xs font-semibold hover:bg-black/25"
          >
            Exit to all sites
          </button>
        </div>
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Logo />
            {user.siteName && (
              <span className="hidden truncate rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground lg:inline">
                {user.siteName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Desktop nav */}
            <nav className="mr-1 hidden items-center gap-1 md:flex">
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {badgeFor(item.href) > 0 && (
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
                        {badgeFor(item.href)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <ThemeToggle />
            <div className="ml-1 hidden items-center gap-2 border-l border-border pl-3 sm:flex">
              <div className="text-right leading-tight">
                <p className="text-sm font-medium text-foreground">
                  {user.name}
                </p>
                <p className="text-xs capitalize text-muted-foreground">
                  {user.role}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              aria-label="Log out"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <IconLogout className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:pb-10">
        {children}
      </main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-6 w-6", active && "stroke-[2.1]")} />
                {item.label}
                {badgeFor(item.href) > 0 && (
                  <span className="absolute right-1/2 top-1 translate-x-3.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {badgeFor(item.href)}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
