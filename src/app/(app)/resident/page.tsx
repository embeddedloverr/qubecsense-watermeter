import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Tariff } from "@/lib/models/Tariff";
import { User } from "@/lib/models/User";
import {
  fetchLiveData,
  LiveDataError,
  resolveSiteCreds,
  type LiveDataCreds,
  type LiveFlat,
} from "@/lib/liveData";
import {
  fetchFlatRange,
  fetchMonthlyHistory,
  lastNMonths,
  HISTORY_MONTHS,
} from "@/lib/flatConsumption";
import {
  STANDARD_TARIFF,
  applySlabs,
  daysBetweenInclusive,
  daysInMonth,
  resolveBillingPeriod,
  resolveFlatConsumption,
  resolveMonthlyHistory,
  standardSlabs,
  type MonthlyHistoryPoint,
} from "@/lib/billing";
import { usageInPeriod, periodRange, type BudgetPeriod } from "@/lib/budget";
import { Card, CardContent } from "@/components/ui";
import { IconAlert } from "@/components/icons";
import { ResidentView } from "./ResidentView";

export const dynamic = "force-dynamic";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ResidentHome() {
  const session = (await getSession())!;
  const flatNumber = session.flat || "";

  const siteId = session.siteId;

  await connectDB();
  const [flatDoc, tariffDoc, userDoc] = await Promise.all([
    flatNumber ? Flat.findOne({ flatNumber, siteId }).lean() : null,
    Tariff.findOne({ key: "default", siteId }).lean(),
    User.findById(session.sub)
      .select("budgetEnabled budgetLitres budgetPeriod")
      .lean(),
  ]);

  let flat: LiveFlat | null = null;
  let project: string | null = null;
  let building: string | null = null;
  let error: string | null = null;
  let creds: LiveDataCreds | undefined;

  try {
    creds = siteId ? await resolveSiteCreds(siteId) : undefined;
    const data = await fetchLiveData({ days: 32, flat: flatNumber }, creds);
    project = data.project;
    building = data.building;
    flat = data.flats.find((f) => f.flat === flatNumber) || null;
  } catch (e) {
    error =
      e instanceof LiveDataError
        ? e.message
        : "Could not load your meter data right now.";
  }

  const billingCycleStartDay: number =
    (tariffDoc as any)?.billingCycleStartDay || 1;

  // The current month is always billed live. Same fixed tariff as admin
  // Billing: slab 1's allowance is 360 L × the days in this cycle.
  const month = currentMonth();
  const resolvedPeriod = resolveBillingPeriod(
    "cycle",
    { month },
    billingCycleStartDay
  );
  const periodDays = resolvedPeriod.ok
    ? daysBetweenInclusive(resolvedPeriod.period.from, resolvedPeriod.period.to)
    : daysInMonth(month);
  const slabs = standardSlabs(periodDays);
  const fixedCharge: number = STANDARD_TARIFF.fixedCharge;

  // Current-month consumption + bill, priced the same way admin Billing
  // prices it — from totalizer start→end deltas, correction-aware — rather
  // than summed from the intraday packets the chart below uses. Those two
  // sources can disagree by design (see lib/billingReport.ts): a resident
  // should never see a different "so far this month" figure here than what
  // Billing will actually charge them. Falls back to the intraday sum only
  // if the totalizer-delta source can't be reached at all.
  let monthLitres = 0;
  let monthComplete = true;
  let monthSourceOk = false;
  if (creds && flatNumber) {
    try {
      if (resolvedPeriod.ok) {
        const range = await fetchFlatRange(
          {
            from: resolvedPeriod.period.from,
            to: resolvedPeriod.period.to,
            flat: flatNumber,
          },
          creds
        );
        const entry = range.flats.find((f) => f.flat === flatNumber);
        if (entry) {
          const resolved = resolveFlatConsumption(flatNumber, entry);
          monthLitres = resolved.litres;
          monthComplete = resolved.complete;
          monthSourceOk = true;
        }
      }
    } catch {
      // Fall through to the intraday-sum fallback below.
    }
  }
  if (!monthSourceOk && flat) {
    for (const m of flat.meters) {
      for (const r of m.readings) {
        if (r.date.startsWith(month)) monthLitres += r.consumptionLitres;
      }
    }
  }
  const bill = applySlabs(monthLitres, slabs, fixedCharge);

  // Last several months, for the monthly trend chart — same totalizer-delta
  // + correction-aware source as the "this month" figure above, via the
  // shared fetchMonthlyHistory/resolveMonthlyHistory helpers also used by
  // the admin Residents page's History panel.
  let monthlyHistory: MonthlyHistoryPoint[] = [];
  if (creds && flatNumber) {
    try {
      const history = await fetchMonthlyHistory(
        flatNumber,
        lastNMonths(HISTORY_MONTHS),
        creds
      );
      monthlyHistory = resolveMonthlyHistory(flatNumber, history);
    } catch {
      // Chart section just won't render — the rest of the page still works.
    }
  }

  // Usage this week / month for the budget widget.
  const flatReadings = flat
    ? flat.meters.flatMap((m) =>
        m.readings.map((r) => ({ date: r.date, litres: r.consumptionLitres }))
      )
    : [];
  const usage = {
    weekly: usageInPeriod(flatReadings, "weekly"),
    monthly: usageInPeriod(flatReadings, "monthly"),
  };

  // Recent usage: latest day vs the day before, and this-week-so-far vs the
  // same portion of last week (fair, not partial-vs-full).
  const byDate = new Map<string, number>();
  for (const r of flatReadings) {
    byDate.set(r.date, (byDate.get(r.date) || 0) + r.litres);
  }
  const shiftDay = (s: string, n: number): string => {
    const d = new Date(`${s}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const sortedDates = [...byDate.keys()].sort();
  const latestDate = sortedDates[sortedDates.length - 1] || null;

  let recent: {
    latestDate: string;
    latestLitres: number;
    prevDayLitres: number | null;
    weekToDate: number;
    lastWeekSame: number | null;
  } | null = null;

  if (latestDate) {
    const latestLitres = byDate.get(latestDate) || 0;
    const prevDay = shiftDay(latestDate, -1);
    const prevDayLitres = byDate.has(prevDay) ? byDate.get(prevDay)! : null;

    const thisMon = periodRange("weekly", new Date(`${latestDate}T00:00:00Z`)).from;
    const elapsed = Math.round(
      (Date.parse(latestDate) - Date.parse(thisMon)) / 86_400_000
    ); // 0-based days from Monday to latest
    const lastMon = shiftDay(thisMon, -7);

    let weekToDate = 0;
    let lastWeekSame = 0;
    // Only a fair comparison if last week has a reading for every day we're
    // comparing against; otherwise (e.g. data collection only just started)
    // we'd be comparing more days against fewer and overstate the change.
    let lastWeekComplete = true;
    for (let i = 0; i <= elapsed; i++) {
      weekToDate += byDate.get(shiftDay(thisMon, i)) || 0;
      const lw = shiftDay(lastMon, i);
      if (byDate.has(lw)) lastWeekSame += byDate.get(lw)!;
      else lastWeekComplete = false;
    }

    recent = {
      latestDate,
      latestLitres,
      prevDayLitres,
      weekToDate,
      lastWeekSame: lastWeekComplete ? lastWeekSame : null,
    };
  }
  const budget = {
    enabled: (userDoc as any)?.budgetEnabled === true,
    litres: (userDoc as any)?.budgetLitres ?? null,
    period: (((userDoc as any)?.budgetPeriod as BudgetPeriod) || "monthly"),
  };

  const ownerName = (flatDoc as any)?.ownerName || session.name;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Flat {flatNumber || "—"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ownerName ? `${ownerName} · ` : ""}
          {[project, building].filter(Boolean).join(" · ") ||
            "Your water usage"}
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="space-y-2 py-10 text-center">
            <IconAlert className="mx-auto h-8 w-8 text-warning" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <ResidentView
          flat={flat}
          month={month}
          monthLitres={monthLitres}
          monthComplete={monthComplete}
          monthlyHistory={monthlyHistory}
          billAmount={bill.amount}
          breakdown={bill.breakdown}
          fixedCharge={fixedCharge}
          tariffConfigured={slabs.length > 0}
          usage={usage}
          budget={budget}
          recent={recent}
        />
      )}
    </div>
  );
}
