"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  Button,
  Spinner,
  Badge,
  Input,
  Label,
} from "@/components/ui";
import { IconAlert, IconCheckCircle } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { formatDateTime } from "@/lib/utils";

interface Access {
  siteId: string;
  siteName: string;
  capabilities: string[];
}
interface Admin {
  id: string;
  name: string;
  email: string;
  role: "admin" | "superadmin";
  active: boolean;
  lastLoginAt: string | null;
  homeSiteId: string | null;
  access: Access[];
}
interface SiteOpt {
  id: string;
  name: string;
  slug: string;
}

const LABELS: Record<string, string> = {
  view_data: "Live data",
  exports: "Exports",
  billing: "Billing",
  residents: "Residents",
  messaging: "Messaging",
  records: "Records",
  schedule: "Schedule",
  technicians: "Technicians",
};

export function AdminsMatrix() {
  const { toast } = useToast();
  const [caps, setCaps] = React.useState<string[]>([]);
  const [sites, setSites] = React.useState<SiteOpt[]>([]);
  const [admins, setAdmins] = React.useState<Admin[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/admins", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load.");
      setCaps(body.capabilities);
      setSites(body.sites);
      setAdmins(body.admins);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  /** Save the whole access list for one admin. */
  const saveAccess = async (admin: Admin, access: Access[]) => {
    setBusy(admin.id);
    try {
      const res = await fetch(`/api/superadmin/admins/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access: access.map((a) => ({
            siteId: a.siteId,
            capabilities: a.capabilities,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Could not save.", "error");
        return;
      }
      setAdmins((prev) =>
        prev
          ? prev.map((a) => (a.id === admin.id ? { ...a, access } : a))
          : prev
      );
      toast("Access updated.", "success");
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const toggleCap = (admin: Admin, siteId: string, cap: string) => {
    const next = admin.access.map((a) =>
      a.siteId === siteId
        ? {
            ...a,
            capabilities: a.capabilities.includes(cap)
              ? a.capabilities.filter((c) => c !== cap)
              : [...a.capabilities, cap],
          }
        : a
    );
    saveAccess(admin, next);
  };

  const addSite = (admin: Admin, siteId: string) => {
    if (!siteId || admin.access.some((a) => a.siteId === siteId)) return;
    const site = sites.find((s) => s.id === siteId);
    saveAccess(admin, [
      ...admin.access,
      { siteId, siteName: site?.name || "", capabilities: [...caps] },
    ]);
  };

  const removeSite = (admin: Admin, siteId: string) =>
    saveAccess(
      admin,
      admin.access.filter((a) => a.siteId !== siteId)
    );

  const toggleActive = async (admin: Admin) => {
    setBusy(admin.id);
    try {
      const res = await fetch(`/api/superadmin/admins/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !admin.active }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Could not update.", "error");
        return;
      }
      toast(`${admin.name} ${body.active ? "enabled" : "disabled"}.`, "success");
      load();
    } finally {
      setBusy(null);
    }
  };

  if (error) {
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

  if (!admins) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading admins…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="md" variant="outline" onClick={() => setCreating((c) => !c)}>
          {creating ? "Cancel" : "New admin"}
        </Button>
      </div>

      {creating && (
        <NewAdminForm
          sites={sites}
          caps={caps}
          onDone={() => {
            setCreating(false);
            load();
          }}
        />
      )}

      {admins.map((admin) => (
        <Card key={admin.id}>
          <CardContent className="space-y-3 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{admin.name}</h3>
                  {admin.role === "superadmin" && (
                    <Badge tone="warning">Superadmin</Badge>
                  )}
                  {!admin.active && <Badge tone="destructive">Disabled</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {admin.email} ·{" "}
                  {admin.lastLoginAt
                    ? `last login ${formatDateTime(admin.lastLoginAt)}`
                    : "never signed in"}
                </p>
              </div>
              <Button
                size="sm"
                variant={admin.active ? "ghost" : "outline"}
                disabled={busy === admin.id}
                onClick={() => toggleActive(admin)}
              >
                {admin.active ? "Disable" : "Enable"}
              </Button>
            </div>

            {admin.role === "superadmin" ? (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <IconCheckCircle className="mr-1 inline h-3.5 w-3.5 text-success" />
                Has every capability on every site, including sites created later.
              </p>
            ) : (
              <>
                {admin.access.length === 0 && (
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                    No site access — this admin cannot sign in to anything yet.
                  </p>
                )}

                {admin.access.map((a) => (
                  <div key={a.siteId} className="rounded-xl border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {a.siteName}
                      </p>
                      <button
                        onClick={() => removeSite(admin, a.siteId)}
                        disabled={busy === admin.id}
                        className="text-xs font-medium text-muted-foreground hover:text-destructive"
                      >
                        Remove access
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {caps.map((c) => {
                        const on = a.capabilities.includes(c);
                        return (
                          <button
                            key={c}
                            onClick={() => toggleCap(admin, a.siteId, c)}
                            disabled={busy === admin.id}
                            aria-pressed={on}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                              on
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {LABELS[c] || c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {sites.some((s) => !admin.access.some((a) => a.siteId === s.id)) && (
                  <div className="flex items-center gap-2">
                    <select
                      onChange={(e) => {
                        addSite(admin, e.target.value);
                        e.target.value = "";
                      }}
                      defaultValue=""
                      disabled={busy === admin.id}
                      className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
                    >
                      <option value="" disabled>
                        Grant access to a site…
                      </option>
                      {sites
                        .filter((s) => !admin.access.some((a) => a.siteId === s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}

      <p className="text-center text-xs text-muted-foreground">
        Changes apply immediately. An admin already signed in sees the new nav
        after their next sign-in, but the permissions themselves take effect at
        once.
      </p>
    </div>
  );
}

function NewAdminForm({
  sites,
  caps,
  onDone,
}: {
  sites: SiteOpt[];
  caps: string[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [f, setF] = React.useState({
    name: "",
    email: "",
    password: "",
    siteId: sites[0]?.id || "",
  });
  const [selected, setSelected] = React.useState<string[]>(caps);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, capabilities: selected }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not create the admin.");
        return;
      }
      toast("Admin created.", "success");
      onDone();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={submit} className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="an" required>
                Name
              </Label>
              <Input
                id="an"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="ae" required>
                Email
              </Label>
              <Input
                id="ae"
                type="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="ap" required>
                Password
              </Label>
              <Input
                id="ap"
                type="password"
                autoComplete="new-password"
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="as" required>
                Site
              </Label>
              <select
                id="as"
                value={f.siteId}
                onChange={(e) => setF({ ...f, siteId: e.target.value })}
                className="flex h-11 w-full rounded-lg border border-input bg-card px-3.5 text-[15px] text-foreground"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Capabilities</Label>
            <div className="flex flex-wrap gap-1.5">
              {caps.map((c) => {
                const on = selected.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setSelected((p) =>
                        p.includes(c) ? p.filter((x) => x !== c) : [...p, c]
                      )
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {LABELS[c] || c}
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="submit" size="md" loading={saving}>
            Create admin
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
