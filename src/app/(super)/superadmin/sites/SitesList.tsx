"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, Button, Spinner, Badge } from "@/components/ui";
import { IconAlert } from "@/components/icons";
import { useToast } from "@/components/Toast";

interface SiteRow {
  id: string;
  name: string;
  slug: string;
  project: string;
  city: string;
  active: boolean;
  hasDataApi: boolean;
  residentUsernamePrefix: string;
  flats: number;
  residents: number;
  admins: number;
}

export function SitesList() {
  const router = useRouter();
  const { toast } = useToast();
  const [sites, setSites] = React.useState<SiteRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/sites", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to load sites.");
      setSites(body.sites);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load sites.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const enterSite = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/session/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: id }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast(body.error || "Could not enter that site.", "error");
        return;
      }
      router.push("/admin/live-data");
      router.refresh();
    } catch {
      toast("Network error. Please try again.", "error");
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

  if (!sites) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading sites…
        </CardContent>
      </Card>
    );
  }

  if (sites.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-14 text-center">
          <p className="text-sm text-muted-foreground">No sites yet.</p>
          <Link href="/superadmin/sites/new">
            <Button size="md">Create the first site</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Desktop */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Site</th>
              <th className="px-5 py-3 font-medium">Prefix</th>
              <th className="px-5 py-3 font-medium">Flats</th>
              <th className="px-5 py-3 font-medium">Residents</th>
              <th className="px-5 py-3 font-medium">Admins</th>
              <th className="px-5 py-3 font-medium">Data API</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sites.map((s) => (
              <tr key={s.id} className={`hover:bg-muted/40 ${s.active ? "" : "opacity-60"}`}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{s.name}</span>
                    {!s.active && <Badge tone="neutral">Disabled</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {[s.project, s.city].filter(Boolean).join(" · ") || "—"}
                  </span>
                </td>
                <td className="tabular px-5 py-3 text-muted-foreground">
                  {s.residentUsernamePrefix}_
                </td>
                <td className="tabular px-5 py-3 text-muted-foreground">{s.flats}</td>
                <td className="tabular px-5 py-3 text-muted-foreground">{s.residents}</td>
                <td className="tabular px-5 py-3 text-muted-foreground">{s.admins}</td>
                <td className="px-5 py-3">
                  {s.hasDataApi ? (
                    <Badge tone="success">Configured</Badge>
                  ) : (
                    <Badge tone="warning">Not set</Badge>
                  )}
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      loading={busy === s.id}
                      onClick={() => enterSite(s.id)}
                    >
                      Open
                    </Button>
                    <Link href={`/superadmin/sites/${s.slug}`}>
                      <Button size="sm" variant="outline">
                        Manage
                      </Button>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="divide-y divide-border md:hidden">
        {sites.map((s) => (
          <li key={s.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.residentUsernamePrefix}_ · {s.flats} flats · {s.residents} residents
                </p>
              </div>
              {s.hasDataApi ? (
                <Badge tone="success">API</Badge>
              ) : (
                <Badge tone="warning">No API</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" loading={busy === s.id} onClick={() => enterSite(s.id)}>
                Open
              </Button>
              <Link href={`/superadmin/sites/${s.slug}`}>
                <Button size="sm" variant="outline">
                  Manage
                </Button>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
