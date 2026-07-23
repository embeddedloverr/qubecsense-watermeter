// Water usage budget/alert helpers, shared by the resident dashboard, the
// settings API and the alert cron so they all define "this week/month" and
// the per-period dedupe key identically.

export type BudgetPeriod = "weekly" | "monthly";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Monday (UTC) of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

/** Inclusive [from, to] date strings for the current period containing `now`. */
export function periodRange(
  period: BudgetPeriod,
  now: Date = new Date()
): { from: string; to: string } {
  if (period === "weekly") {
    const mon = startOfWeek(now);
    const sun = new Date(mon);
    sun.setUTCDate(mon.getUTCDate() + 6);
    return { from: iso(mon), to: iso(sun) };
  }
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: iso(first), to: iso(last) };
}

/** Stable key for the current period, used to alert at most once per period. */
export function periodKey(period: BudgetPeriod, now: Date = new Date()): string {
  const { from } = periodRange(period, now);
  return period === "weekly" ? `w:${from}` : `m:${from.slice(0, 7)}`;
}

export function periodLabel(period: BudgetPeriod): string {
  return period === "weekly" ? "this week" : "this month";
}

export function periodNoun(period: BudgetPeriod): string {
  return period === "weekly" ? "week" : "month";
}

/** Sum consumption (litres) of readings that fall inside the current period. */
export function usageInPeriod(
  readings: { date: string; litres: number }[],
  period: BudgetPeriod,
  now: Date = new Date()
): number {
  const { from, to } = periodRange(period, now);
  let total = 0;
  for (const r of readings) {
    if (r.date >= from && r.date <= to) total += r.litres || 0;
  }
  return total;
}

/** Clamp/parse a submitted budget litres value. Returns null if invalid. */
export function normaliseLitres(value: unknown): number | null {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return n;
}
