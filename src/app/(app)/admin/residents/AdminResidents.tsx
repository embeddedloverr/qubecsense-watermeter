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
import { IconSearch, IconX, IconAlert, IconUsers, IconCheckCircle } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { formatDateTime } from "@/lib/utils";

interface Resident {
  id: string;
  name: string;
  username: string;
  flatNumber: string;
  phone: string;
  active: boolean;
  pendingFirstLogin: boolean;
  lastLoginAt: string | null;
}

interface Summary {
  residents: Resident[];
  total: number;
  neverLoggedIn: number;
  pendingFirstLogin: number;
  inactive: number;
}

type Filter = "all" | "never" | "pending" | "inactive";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "never", label: "Never logged in" },
  { key: "pending", label: "Password not set" },
  { key: "inactive", label: "Disabled" },
];

export function AdminResidents() {
  const { toast } = useToast();
  const [data, setData] = React.useState<Summary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<{
    flat: string;
    username: string;
    password: string;
  } | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/residents", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load residents.");
      setData(body);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load residents.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.residents.filter((r) => {
      if (filter === "never" && r.lastLoginAt) return false;
      if (filter === "pending" && !r.pendingFirstLogin) return false;
      if (filter === "inactive" && r.active) return false;
      if (!q) return true;
      return (
        r.flatNumber.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q)
      );
    });
  }, [data, query, filter]);

  const resetPassword = async (r: Resident) => {
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/residents/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-password" }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Could not reset the password.", "error");
        return;
      }
      setIssued({
        flat: r.flatNumber,
        username: body.username,
        password: body.password,
      });
      load();
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (r: Resident) => {
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/residents/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.active }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Could not update the account.", "error");
        return;
      }
      toast(
        `Flat ${r.flatNumber} ${body.active ? "enabled" : "disabled"}.`,
        "success"
      );
      load();
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading resident accounts…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="space-y-3 py-12 text-center">
          <IconAlert className="mx-auto h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Accounts" value={data.total} icon={IconUsers} />
        <Stat label="Never logged in" value={data.neverLoggedIn} icon={IconAlert} tone="warning" />
        <Stat label="Password not set" value={data.pendingFirstLogin} icon={IconAlert} tone="warning" />
        <Stat label="Disabled" value={data.inactive} icon={IconX} tone="neutral" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search flat, owner or username…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No accounts match this view.
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
                  <th className="px-5 py-3 font-medium">Username</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Last login</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="tabular px-5 py-3 font-semibold">{r.flatNumber}</td>
                    <td className="max-w-[180px] truncate px-5 py-3 text-muted-foreground">
                      {r.name || "—"}
                    </td>
                    <td className="tabular px-5 py-3 text-muted-foreground">
                      {r.username}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge resident={r} />
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "Never"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === r.id}
                          onClick={() => resetPassword(r)}
                        >
                          Reset password
                        </Button>
                        <Button
                          size="sm"
                          variant={r.active ? "ghost" : "outline"}
                          disabled={busyId === r.id}
                          onClick={() => toggleActive(r)}
                        >
                          {r.active ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <ul className="divide-y divide-border md:hidden">
            {filtered.map((r) => (
              <li key={r.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tabular font-semibold text-foreground">
                      Flat {r.flatNumber}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.name || "—"} · {r.username}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.lastLoginAt
                        ? `Last login ${formatDateTime(r.lastLoginAt)}`
                        : "Never logged in"}
                    </p>
                  </div>
                  <StatusBadge resident={r} />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === r.id}
                    onClick={() => resetPassword(r)}
                  >
                    Reset password
                  </Button>
                  <Button
                    size="sm"
                    variant={r.active ? "ghost" : "outline"}
                    disabled={busyId === r.id}
                    onClick={() => toggleActive(r)}
                  >
                    {r.active ? "Disable" : "Enable"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {issued && (
        <IssuedPasswordModal issued={issued} onClose={() => setIssued(null)} />
      )}
    </div>
  );
}

function StatusBadge({ resident }: { resident: Resident }) {
  if (!resident.active) return <Badge tone="destructive">Disabled</Badge>;
  if (resident.pendingFirstLogin)
    return <Badge tone="warning">Password not set</Badge>;
  return (
    <Badge tone="success">
      <IconCheckCircle className="h-3.5 w-3.5" /> Active
    </Badge>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone?: "primary" | "warning" | "neutral";
}) {
  const toneClass = {
    primary: "bg-accent text-accent-foreground",
    warning: "bg-warning/15 text-warning",
    neutral: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <p className="tabular mt-2 text-2xl font-bold text-foreground sm:text-3xl">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

/** Shows a freshly issued password once — it is not stored in plaintext. */
function IssuedPasswordModal({
  issued,
  onClose,
}: {
  issued: { flat: string; username: string; password: string };
  onClose: () => void;
}) {
  const { toast } = useToast();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Username: ${issued.username}\nPassword: ${issued.password}`
      );
      toast("Copied to clipboard.", "success");
    } catch {
      toast("Could not copy — select the text manually.", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl animate-fade-in">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              New password · Flat {issued.flat}
            </h2>
            <p className="text-sm text-muted-foreground">
              Shown once — copy it now.
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

        <dl className="mb-4 space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Username</dt>
            <dd className="tabular font-medium text-foreground">{issued.username}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Password</dt>
            <dd className="tabular select-all font-semibold text-foreground">
              {issued.password}
            </dd>
          </div>
        </dl>

        <p className="mb-4 text-xs text-muted-foreground">
          The resident will be asked to choose their own password when they sign
          in with this.
        </p>

        <div className="flex gap-2">
          <Button size="md" onClick={copy} className="flex-1">
            Copy
          </Button>
          <Button size="md" variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
