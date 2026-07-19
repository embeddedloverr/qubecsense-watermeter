"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
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
} from "./icons";

export interface NavUser {
  name: string;
  email: string;
  role: "admin" | "technician";
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const techNav: NavItem[] = [
  { href: "/technician", label: "Home", icon: IconHome },
  { href: "/technician/new", label: "Install", icon: IconNewInstall },
];

const adminNav: NavItem[] = [
  { href: "/admin/live-data", label: "Live Data", icon: IconGauge },
  { href: "/admin/billing", label: "Billing", icon: IconRupee },
  { href: "/admin", label: "Overview", icon: IconDashboard },
  { href: "/admin/schedule", label: "Schedule", icon: IconCalendar },
  { href: "/admin/installations", label: "Records", icon: IconHome },
  { href: "/admin/technicians", label: "Team", icon: IconUsers },
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
  const nav = user.role === "admin" ? adminNav : techNav;

  const isActive = (href: string) =>
    pathname === href || (href !== "/admin" && href !== "/technician" && pathname.startsWith(href));

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
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
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-6 w-6", active && "stroke-[2.1]")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
