"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  Spinner,
  FieldError,
} from "@/components/ui";
import { useToast } from "@/components/Toast";
import { IconUsers } from "@/components/icons";
import { formatDate } from "@/lib/utils";

interface Tech {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

export function AdminTechnicians() {
  const { toast } = useToast();
  const [techs, setTechs] = React.useState<Tech[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    const d = await fetch("/api/technicians").then((r) => r.json());
    setTechs(d.technicians || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Required.";
    if (!email.trim()) errs.email = "Required.";
    if (password.length < 6) errs.password = "At least 6 characters.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const res = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Technician ${name} added.`, "success");
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      await load();
    } catch (err: any) {
      toast(err.message || "Failed to add technician.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      {/* Add form */}
      <Card>
        <CardHeader>
          <CardTitle>Add technician</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label required htmlFor="t-name">
                Full name
              </Label>
              <Input
                id="t-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ramesh Kumar"
              />
              <FieldError>{errors.name}</FieldError>
            </div>
            <div>
              <Label required htmlFor="t-email">
                Email
              </Label>
              <Input
                id="t-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ramesh@qubecsense.com"
              />
              <FieldError>{errors.email}</FieldError>
            </div>
            <div>
              <Label htmlFor="t-phone">Phone</Label>
              <Input
                id="t-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label required htmlFor="t-pass">
                Temporary password
              </Label>
              <Input
                id="t-pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
              />
              <FieldError>{errors.password}</FieldError>
            </div>
            <Button type="submit" loading={saving} className="w-full">
              Add technician
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconUsers className="h-4 w-4 text-secondary" /> Technicians (
            {techs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Spinner className="h-5 w-5" /> Loading…
            </div>
          ) : techs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No technicians yet. Add one to get started.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {techs.map((t) => (
                <li
                  key={t._id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {t.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {t.email}
                        {t.phone ? ` · ${t.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={t.active ? "success" : "neutral"}>
                      {t.active ? "Active" : "Inactive"}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(t.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
