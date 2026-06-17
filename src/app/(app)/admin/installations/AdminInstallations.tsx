"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  Input,
  Badge,
  Button,
  Spinner,
} from "@/components/ui";
import {
  IconSearch,
  IconX,
  IconCheckCircle,
  IconGauge,
  IconDroplet,
  IconPen,
  IconPhone,
} from "@/components/icons";
import { formatDate, formatDateTime } from "@/lib/utils";

interface Meter {
  meterSerial: string;
  photoId?: string;
}
interface Install {
  _id: string;
  flatNumber: string;
  ownerName: string;
  ownerPhone: string;
  installationDate: string;
  createdAt: string;
  technicianName: string;
  kitchen: Meter;
  bathroom: Meter;
  signatureId?: string;
  remarks?: string;
}

export function AdminInstallations() {
  const [items, setItems] = React.useState<Install[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState<Install | null>(null);

  React.useEffect(() => {
    fetch("/api/installations")
      .then((r) => r.json())
      .then((d) => setItems(d.installations || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.flatNumber.toLowerCase().includes(q) ||
        i.ownerName.toLowerCase().includes(q) ||
        i.technicianName.toLowerCase().includes(q)
    );
  }, [items, query]);

  const exportCsv = () => {
    const header = [
      "Flat",
      "Owner",
      "Owner Phone",
      "Kitchen Serial",
      "Bathroom Serial",
      "Installation Date",
      "Technician",
      "Recorded At",
    ];
    const rows = filtered.map((i) => [
      i.flatNumber,
      i.ownerName,
      i.ownerPhone,
      i.kitchen?.meterSerial ?? "",
      i.bathroom?.meterSerial ?? "",
      formatDate(i.installationDate),
      i.technicianName,
      formatDateTime(i.createdAt),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qubecsense-installations-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search flat, owner or technician…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="md" onClick={exportCsv} disabled={!filtered.length}>
          Export CSV
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Spinner className="h-5 w-5" /> Loading records…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No installation records found.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Flat</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium">Meters</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Technician</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((i) => (
                  <tr key={i._id} className="hover:bg-muted/40">
                    <td className="tabular px-5 py-3 font-semibold">
                      {i.flatNumber}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {i.ownerName || "Vacant"}
                    </td>
                    <td className="tabular px-5 py-3 text-xs text-muted-foreground">
                      K: {i.kitchen?.meterSerial} · B: {i.bathroom?.meterSerial}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(i.installationDate)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {i.technicianName}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setActive(i)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <ul className="divide-y divide-border md:hidden">
            {filtered.map((i) => (
              <li key={i._id}>
                <button
                  onClick={() => setActive(i)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="tabular font-semibold text-foreground">
                      Flat {i.flatNumber}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {i.ownerName || "Vacant"} · {formatDate(i.installationDate)}
                    </p>
                  </div>
                  <Badge tone="success">
                    <IconCheckCircle className="h-3.5 w-3.5" /> Done
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {active && (
        <DetailModal install={active} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

function MeterPanel({
  title,
  icon: Icon,
  serial,
  photoId,
}: {
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  serial: string;
  photoId?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4 text-secondary" /> {title}
      </p>
      <p className="tabular mb-2 text-xs text-muted-foreground">
        Serial: {serial || "—"}
      </p>
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photos/${photoId}`}
          alt={`${title} meter`}
          className="h-44 w-full rounded-lg border border-border object-cover"
        />
      ) : (
        <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
          No photo
        </div>
      )}
    </div>
  );
}

function DetailModal({
  install,
  onClose,
}: {
  install: Install;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card shadow-xl animate-fade-in sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-5 py-3.5">
          <div>
            <h2 className="tabular text-lg font-bold text-foreground">
              Flat {install.flatNumber}
            </h2>
            <p className="text-sm text-muted-foreground">
              {install.ownerName || "Vacant"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Installation date" value={formatDate(install.installationDate)} />
            <Info label="Recorded" value={formatDateTime(install.createdAt)} />
            <Info label="Technician" value={install.technicianName} />
            {install.ownerPhone && (
              <Info
                label="Owner phone"
                value={
                  <span className="inline-flex items-center gap-1">
                    <IconPhone className="h-3.5 w-3.5" /> {install.ownerPhone}
                  </span>
                }
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <MeterPanel
              title="Kitchen meter"
              icon={IconGauge}
              serial={install.kitchen?.meterSerial}
              photoId={install.kitchen?.photoId}
            />
            <MeterPanel
              title="Bathroom meter"
              icon={IconDroplet}
              serial={install.bathroom?.meterSerial}
              photoId={install.bathroom?.photoId}
            />
          </div>

          {install.remarks && (
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Remarks</p>
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {install.remarks}
              </p>
            </div>
          )}

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <IconPen className="h-4 w-4 text-secondary" /> Owner signature
            </p>
            {install.signatureId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/photos/${install.signatureId}`}
                alt="Owner signature"
                className="h-32 w-full rounded-lg border border-border bg-white object-contain"
              />
            ) : (
              <p className="text-sm text-muted-foreground">No signature.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
