"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Select,
  Input,
  Label,
  Badge,
  Spinner,
  Helper,
} from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  IconSearch,
  IconCheck,
  IconTrash,
  IconCalendar,
} from "@/components/icons";
import { formatDate, todayISO } from "@/lib/utils";

interface Tech {
  _id: string;
  name: string;
  email: string;
}
interface FlatOpt {
  flatNumber: string;
  ownerName: string;
  vacant: boolean;
  installed: boolean;
}
interface SchedEntry {
  _id: string;
  flatNumber: string;
  ownerName: string;
  scheduledDate: string;
  technicianName: string;
  status: string;
}

export function AdminSchedule() {
  const { toast } = useToast();
  const [techs, setTechs] = React.useState<Tech[]>([]);
  const [flats, setFlats] = React.useState<FlatOpt[]>([]);
  const [schedule, setSchedule] = React.useState<SchedEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [techId, setTechId] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const [t, f, s] = await Promise.all([
      fetch("/api/technicians").then((r) => r.json()),
      fetch("/api/flats").then((r) => r.json()),
      fetch("/api/schedule?status=planned").then((r) => r.json()),
    ]);
    setTechs(t.technicians || []);
    setFlats(f.flats || []);
    setSchedule(s.schedule || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const plannedSet = React.useMemo(
    () => new Set(schedule.map((s) => s.flatNumber)),
    [schedule]
  );

  const assignable = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return flats.filter((f) => {
      if (f.installed || plannedSet.has(f.flatNumber)) return false;
      if (!q) return true;
      return (
        f.flatNumber.toLowerCase().includes(q) ||
        f.ownerName.toLowerCase().includes(q)
      );
    });
  }, [flats, query, plannedSet]);

  const toggle = (fn: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(fn) ? next.delete(fn) : next.add(fn);
      return next;
    });
  };

  const submit = async () => {
    if (!techId) return toast("Select a technician.", "error");
    if (picked.size === 0) return toast("Pick at least one flat.", "error");
    setSaving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumbers: Array.from(picked),
          technicianId: techId,
          scheduledDate: date,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`Assigned ${data.created} flat(s).`, "success");
      setPicked(new Set());
      await load();
    } catch (e: any) {
      toast(e.message || "Failed to assign.", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/schedule?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setSchedule((prev) => prev.filter((s) => s._id !== id));
      toast("Removed from schedule.", "success");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Spinner className="h-5 w-5" /> Loading…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Assign panel */}
      <Card>
        <CardHeader>
          <CardTitle>Plan installations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Technician</Label>
              <Select value={techId} onChange={(e) => setTechId(e.target.value)}>
                <option value="">Select…</option>
                {techs.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label required>Date</Label>
              <Input
                type="date"
                value={date}
                min={todayISO()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {techs.length === 0 && (
            <Helper>Add a technician first (Team tab) to assign work.</Helper>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Flats to assign</Label>
              <span className="text-xs text-muted-foreground">
                {picked.size} selected
              </span>
            </div>
            <div className="relative mb-2">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pending flats…"
                className="pl-9"
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              {assignable.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No pending flats match.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {assignable.map((f) => {
                    const sel = picked.has(f.flatNumber);
                    return (
                      <li key={f.flatNumber}>
                        <button
                          type="button"
                          onClick={() => toggle(f.flatNumber)}
                          className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted/50"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                sel
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input"
                              }`}
                            >
                              {sel && <IconCheck className="h-3.5 w-3.5" />}
                            </span>
                            <span className="tabular w-12 font-semibold text-foreground">
                              {f.flatNumber}
                            </span>
                            <span className="truncate text-sm text-muted-foreground">
                              {f.vacant ? "Vacant" : f.ownerName}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <Button
            onClick={submit}
            loading={saving}
            className="w-full"
            disabled={!techId || picked.size === 0}
          >
            Assign {picked.size > 0 ? `${picked.size} flat(s)` : ""}
          </Button>
        </CardContent>
      </Card>

      {/* Planned list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconCalendar className="h-4 w-4 text-secondary" /> Planned schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {schedule.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nothing scheduled yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {schedule.map((s) => (
                <li
                  key={s._id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="tabular font-semibold text-foreground">
                      Flat {s.flatNumber}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {s.technicianName} · {formatDate(s.scheduledDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="primary">Planned</Badge>
                    <button
                      onClick={() => remove(s._id)}
                      aria-label="Remove"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
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
