"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Button,
  FieldError,
} from "@/components/ui";
import { IconAlert } from "@/components/icons";
import { useToast } from "@/components/Toast";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function NewSiteForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const [f, setF] = React.useState({
    name: "",
    slug: "",
    project: "",
    city: "",
    residentUsernamePrefix: "",
    dataApiUrl: "https://api.qubecsense.com/api/v1/data",
    dataApiKey: "",
    adminNotifyEmail: "",
  });
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [prefixTouched, setPrefixTouched] = React.useState(false);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Derive slug and prefix from the name until the user edits them directly.
  const onName = (v: string) => {
    setF((p) => ({
      ...p,
      name: v,
      slug: slugTouched ? p.slug : slugify(v),
      residentUsernamePrefix: prefixTouched
        ? p.residentUsernamePrefix
        : slugify(v).replace(/-/g, "").slice(0, 21),
    }));
  };

  const prefixValid = /^[a-z][a-z0-9]{1,20}$/.test(f.residentUsernamePrefix);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!f.name.trim()) return setError("Give the site a name.");
    if (!prefixValid) {
      return setError(
        "Username prefix must be 2–21 lowercase letters/digits starting with a letter."
      );
    }

    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Could not create the site.");
        return;
      }
      toast(`Site "${body.site.name}" created.`, "success");
      router.push(`/superadmin/sites/${body.site.slug}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="name" required>
              Building name
            </Label>
            <Input
              id="name"
              value={f.name}
              onChange={(e) => onName(e.target.value)}
              placeholder="e.g. Greenwood-14"
              required
            />
          </div>
          <div>
            <Label htmlFor="project">Project / society</Label>
            <Input
              id="project"
              value={f.project}
              onChange={(e) => set("project", e.target.value)}
              placeholder="e.g. Regency Anantam"
            />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={f.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="slug">URL slug</Label>
            <Input
              id="slug"
              value={f.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", slugify(e.target.value));
              }}
              placeholder="greenwood-14"
            />
          </div>
          <div>
            <Label htmlFor="prefix" required>
              Resident username prefix
            </Label>
            <Input
              id="prefix"
              value={f.residentUsernamePrefix}
              onChange={(e) => {
                setPrefixTouched(true);
                set(
                  "residentUsernamePrefix",
                  e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "")
                );
              }}
              placeholder="greenwood"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Logins become{" "}
              <strong className="text-foreground">
                {f.residentUsernamePrefix || "prefix"}_101
              </strong>
              . Must be unique across sites and cannot be changed later.
            </p>
            <FieldError>
              {f.residentUsernamePrefix && !prefixValid
                ? "2–21 lowercase letters/digits, starting with a letter."
                : ""}
            </FieldError>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meter data API</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This site&apos;s own QubecSense credentials. Leave blank to add later —
            the site works, it just shows no meter data.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="apiUrl">API URL</Label>
            <Input
              id="apiUrl"
              value={f.dataApiUrl}
              onChange={(e) => set("dataApiUrl", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="apiKey">API key</Label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={f.dataApiKey}
              onChange={(e) => set("dataApiKey", e.target.value)}
              placeholder="Stored encrypted; never shown again"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notify">Office email for resident messages</Label>
            <Input
              id="notify"
              type="email"
              value={f.adminNotifyEmail}
              onChange={(e) => set("adminNotifyEmail", e.target.value)}
              placeholder="office@example.com"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" size="lg" loading={saving}>
          Create site
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => router.push("/superadmin/sites")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
