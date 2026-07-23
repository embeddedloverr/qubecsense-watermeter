import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Flat } from "@/lib/models/Flat";
import { Tariff } from "@/lib/models/Tariff";
import { User } from "@/lib/models/User";
import { fetchLiveData, LiveDataError, type LiveFlat } from "@/lib/liveData";
import { applySlabs, type Slab } from "@/lib/billing";
import { usageInPeriod, type BudgetPeriod } from "@/lib/budget";
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

  await connectDB();
  const [flatDoc, tariffDoc, userDoc] = await Promise.all([
    flatNumber ? Flat.findOne({ flatNumber }).lean() : null,
    Tariff.findOne({ key: "default" }).lean(),
    User.findById(session.sub)
      .select("budgetEnabled budgetLitres budgetPeriod")
      .lean(),
  ]);

  let flat: LiveFlat | null = null;
  let project: string | null = null;
  let building: string | null = null;
  let dates: string[] = [];
  let error: string | null = null;

  try {
    const data = await fetchLiveData({ days: 32, flat: flatNumber });
    project = data.project;
    building = data.building;
    dates = data.range?.dates || [];
    flat = data.flats.find((f) => f.flat === flatNumber) || null;
  } catch (e) {
    error =
      e instanceof LiveDataError
        ? e.message
        : "Could not load your meter data right now.";
  }

  const slabs: Slab[] = (tariffDoc as any)?.slabs || [];
  const fixedCharge: number = (tariffDoc as any)?.fixedCharge || 0;

  // Current-month consumption + bill from the flat's readings.
  const month = currentMonth();
  let monthLitres = 0;
  if (flat) {
    for (const m of flat.meters) {
      for (const r of m.readings) {
        if (r.date.startsWith(month)) monthLitres += r.consumptionLitres;
      }
    }
  }
  const bill = applySlabs(monthLitres, slabs, fixedCharge);

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
          dates={dates}
          month={month}
          monthLitres={monthLitres}
          billAmount={bill.amount}
          breakdown={bill.breakdown}
          fixedCharge={fixedCharge}
          tariffConfigured={slabs.length > 0}
          usage={usage}
          budget={budget}
        />
      )}
    </div>
  );
}
