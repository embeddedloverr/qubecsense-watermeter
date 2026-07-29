"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Button,
  Spinner,
  Badge,
} from "@/components/ui";
import { IconAlert, IconCheckCircle } from "@/components/icons";
import { useToast } from "@/components/Toast";

interface SiteSettings {
  id: string;
  name: string;
  slug: string;
  project: string;
  building: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  dataApiUrl: string;
  dataApiKeyMask: string;
  residentUsernamePrefix: string;
  timezone: string;
  currency: string;
  adminNotifyEmail: string;
  supportPhone: string;
  active: boolean;
}

export function SiteDetail({
  siteId,
  slug,
  name,
}: {
  siteId: string;
  slug: string;
  name: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [site, setSite] = React.useState<SiteSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<
    { ok: boolean; text: string } | null
  >(null);
  const [newKey, setNewKey] = React.useState("");
  const [entering, setEntering] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/superadmin/sites/${siteId}`, {
      cache: "no-store",
    });
    const body = await res.json();
    if (res.ok) setSite(body.site);
  }, [siteId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const set = (k: keyof SiteSettings, v: any) =>
    setSite((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!site) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...site,
          // Empty means "leave the stored key alone".
          dataApiKey: newKey || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Could not save.", "error");
        return;
      }
      toast("Site settings saved.", "success");
      setNewKey("");
      load();
      router.refresh();
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/superadmin/sites/${siteId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test-connection",
          dataApiUrl: site?.dataApiUrl,
          dataApiKey: newKey || undefined,
        }),
      });
      const body = await res.json();
      setTestResult(
        body.ok
          ? {
              ok: true,
              text: `Connected — ${body.building || "site"}: ${body.flatCount} flats, ${body.meterCount} meters, latest ${body.latest || "n/a"}.`,
            }
          : { ok: false, text: body.error || "Connection failed." }
      );
    } catch {
      setTestResult({ ok: false, text: "Connection failed." });
    } finally {
      setTesting(false);
    }
  };

  const enterSite = async () => {
    setEntering(true);
    try {
      const res = await fetch("/api/session/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (!res.ok) {
        toast("Could not enter that site.", "error");
        return;
      }
      router.push("/admin/live-data");
      router.refresh();
    } finally {
      setEntering(false);
    }
  };

  if (!site) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading {name}…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link
            href="/superadmin/sites"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            ← All sites
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            {site.name}
            {!site.active && <Badge tone="neutral">Disabled</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {site.project || "—"} · logins {site.residentUsernamePrefix}_&lt;flat&gt;
          </p>
        </div>
        <Button size="md" loading={entering} onClick={enterSite}>
          Open this site
        </Button>
      </div>

      {/* Per-site management, mounted from the admin components */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NavCard href={`/superadmin/sites/${slug}/flats`} title="Flats" desc="Import & residents" />
        <NavCard href={`/superadmin/sites/${slug}/records`} title="Records" desc="Installations" />
        <NavCard href={`/superadmin/sites/${slug}/technicians`} title="Technicians" desc="Field team" />
        <NavCard href={`/superadmin/admins`} title="Admins" desc="Access & rights" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Building name</Label>
            <Input id="name" value={site.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="project">Project</Label>
            <Input id="project" value={site.project} onChange={(e) => set("project", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" value={site.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="notify">Office email (resident messages)</Label>
            <Input
              id="notify"
              type="email"
              value={site.adminNotifyEmail}
              onChange={(e) => set("adminNotifyEmail", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={site.active}
                onChange={(e) => set("active", e.target.checked)}
                className="h-4 w-4 accent-[hsl(201,96%,38%)]"
              />
              <span className="font-medium text-foreground">Site is active</span>
              <span className="text-muted-foreground">
                — disabling blocks its admins and residents from signing in.
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meter data API</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Credentials for this site&apos;s meters. The key is encrypted at rest
            and never shown again.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="apiUrl">API URL</Label>
            <Input
              id="apiUrl"
              value={site.dataApiUrl}
              onChange={(e) => set("dataApiUrl", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="apiKey">API key</Label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={
                site.dataApiKeyMask
                  ? `Stored: ${site.dataApiKeyMask} — type to replace`
                  : "Not set"
              }
            />
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
                testResult.ok
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {testResult.ok ? (
                <IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{testResult.text}</span>
            </div>
          )}

          <Button variant="outline" size="md" loading={testing} onClick={testConnection}>
            Test connection
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button size="lg" loading={saving} onClick={save}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

function NavCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/40">
        <CardContent className="pt-5">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
