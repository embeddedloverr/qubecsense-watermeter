"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Textarea,
  Button,
  Badge,
} from "@/components/ui";
import { IconAlert, IconCheckCircle } from "@/components/icons";
import { useToast } from "@/components/Toast";

interface Summary {
  site: string;
  parsed: number;
  newFlats: number;
  updatedFlats: number;
  newResidents: number;
  existingResidents: number;
  withEmail: number;
  withoutEmail: number;
  errors: string[];
  dryRun?: boolean;
}

const SAMPLE = `Flat,Owner,Email,Phone
101,Asha Menon,asha@example.com,9876543210
102,Ravi Kumar,ravi@example.com,9876543211`;

export function ImportFlats({
  siteId,
  prefix,
}: {
  siteId: string;
  prefix: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [csv, setCsv] = React.useState("");
  const [createResidents, setCreateResidents] = React.useState(true);
  const [preview, setPreview] = React.useState<Summary | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/superadmin/sites/${siteId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, createResidents, dryRun }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Import failed.");
        if (body.errors?.length) setPreview({ ...body, errors: body.errors });
        return;
      }
      setPreview(body);
      if (!dryRun) {
        toast(
          `Imported ${body.newFlats + body.updatedFlats} flats and created ${body.newResidents} logins.`,
          "success"
        );
        setCsv("");
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Import flats</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Paste a CSV with a header row. Columns can be in any order —{" "}
            <code>Flat</code>, <code>Owner</code>, <code>Email</code>,{" "}
            <code>Phone</code>. Re-importing updates existing flats rather than
            duplicating them.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
            }}
            rows={10}
            placeholder={SAMPLE}
            className="font-mono text-xs"
          />

          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={createResidents}
              onChange={(e) => setCreateResidents(e.target.checked)}
              className="h-4 w-4 accent-[hsl(201,96%,38%)]"
            />
            <span className="text-foreground">
              Also create resident logins ({prefix}_&lt;flat&gt;)
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="md"
              disabled={!csv.trim() || busy}
              onClick={() => run(true)}
            >
              Preview
            </Button>
            <Button
              size="md"
              loading={busy}
              disabled={!csv.trim() || !preview?.dryRun}
              onClick={() => run(false)}
            >
              Import
            </Button>
            {!preview?.dryRun && csv.trim() && (
              <span className="self-center text-xs text-muted-foreground">
                Preview first to see what will change.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {preview.dryRun ? "Preview" : "Imported"}
            </CardTitle>
            {preview.dryRun ? (
              <Badge tone="warning">Nothing written yet</Badge>
            ) : (
              <Badge tone="success">
                <IconCheckCircle className="h-3.5 w-3.5" /> Done
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fig label="Rows parsed" value={preview.parsed} />
              <Fig label="New flats" value={preview.newFlats} />
              <Fig label="Updated flats" value={preview.updatedFlats} />
              <Fig
                label={preview.dryRun ? "Logins to create" : "Logins created"}
                value={preview.newResidents}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {preview.withEmail} of {preview.parsed} have an email — the rest
              cannot receive a sign-in code until one is added.
            </p>

            {preview.errors?.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-warning/10 p-3 text-xs text-warning">
                {preview.errors.map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Fig({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}
