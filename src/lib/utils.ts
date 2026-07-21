export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(d: string | Date | undefined | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d: string | Date | undefined | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** Derive floor + wing-friendly label from a flat number like "1203". */
export function floorOf(flatNumber: string): number {
  const n = parseInt(flatNumber, 10);
  if (Number.isNaN(n)) return 0;
  return Math.floor(n / 100);
}

/** Landing route for a role after login / password change. */
export function homeFor(role: string): string {
  if (role === "admin") return "/admin/live-data";
  if (role === "resident") return "/resident";
  return "/technician";
}
