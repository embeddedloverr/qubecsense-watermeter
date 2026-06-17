"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Textarea,
  Helper,
  FieldError,
  Badge,
  Spinner,
} from "./ui";
import { FlatCombobox, FlatOption } from "./FlatCombobox";
import { PhotoInput } from "./PhotoInput";
import { SignaturePad } from "./SignaturePad";
import { useToast } from "./Toast";
import { todayISO } from "@/lib/utils";
import {
  IconGauge,
  IconDroplet,
  IconCheckCircle,
  IconPhone,
} from "./icons";

function Section({
  step,
  title,
  desc,
  children,
}: {
  step: number;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="animate-fade-in">
      <CardContent className="pt-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {step}
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function InstallationForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [flats, setFlats] = React.useState<FlatOption[]>([]);
  const [loadingFlats, setLoadingFlats] = React.useState(true);

  const [flat, setFlat] = React.useState<FlatOption | null>(null);
  const [date, setDate] = React.useState(todayISO());
  const [kitchenSerial, setKitchenSerial] = React.useState("");
  const [bathroomSerial, setBathroomSerial] = React.useState("");
  const [kitchenPhoto, setKitchenPhoto] = React.useState<string | null>(null);
  const [bathroomPhoto, setBathroomPhoto] = React.useState<string | null>(null);
  const [signature, setSignature] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [remarks, setRemarks] = React.useState("");

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/flats")
      .then((r) => r.json())
      .then((d) => setFlats(d.flats || []))
      .catch(() => toast("Could not load flats. Check your connection.", "error"))
      .finally(() => setLoadingFlats(false));
  }, [toast]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!flat) e.flat = "Select the flat being installed.";
    if (!date) e.date = "Pick the installation date.";
    if (!kitchenSerial.trim()) e.kitchenSerial = "Enter the kitchen meter serial.";
    if (!kitchenPhoto) e.kitchenPhoto = "Capture the kitchen meter photo.";
    if (!bathroomSerial.trim())
      e.bathroomSerial = "Enter the bathroom meter serial.";
    if (!bathroomPhoto) e.bathroomPhoto = "Capture the bathroom meter photo.";
    if (!signature) e.signature = "Capture the owner's signature.";
    if (!confirmed) e.confirmed = "Owner confirmation is required.";
    setErrors(e);
    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      toast("Please complete all required fields.", "error");
      const first = document.querySelector("[data-invalid='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: flat!.flatNumber,
          installationDate: date,
          kitchenSerial: kitchenSerial.trim(),
          kitchenPhoto,
          bathroomSerial: bathroomSerial.trim(),
          bathroomPhoto,
          signature,
          ownerConfirmed: confirmed,
          remarks: remarks.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");

      toast(`Flat ${flat!.flatNumber} installation saved.`, "success");
      router.push("/technician");
      router.refresh();
    } catch (err: any) {
      toast(err.message || "Failed to save installation.", "error");
      setSubmitting(false);
    }
  };

  const inv = (k: string) => (errors[k] ? "true" : undefined);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Step 1 — Flat */}
      <Section
        step={1}
        title="Flat & schedule"
        desc="Choose the flat and confirm the installation date."
      >
        <div className="space-y-4">
          <div data-invalid={inv("flat")}>
            <Label required>Flat number</Label>
            {loadingFlats ? (
              <div className="flex h-12 items-center gap-2 rounded-lg border border-input px-3.5 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" /> Loading flats…
              </div>
            ) : (
              <FlatCombobox
                flats={flats}
                value={flat?.flatNumber ?? null}
                onChange={(f) => {
                  setFlat(f);
                  setErrors((p) => ({ ...p, flat: "" }));
                }}
              />
            )}
            <FieldError>{errors.flat}</FieldError>
          </div>

          {flat && (
            <div className="rounded-lg bg-accent/60 p-3.5 text-sm animate-fade-in">
              <p className="font-medium text-accent-foreground">
                {flat.vacant ? "Vacant flat" : flat.ownerName}
              </p>
              {!flat.vacant && flat.ownerPhone && (
                <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                  <IconPhone className="h-3.5 w-3.5" />
                  {flat.ownerPhone}
                </p>
              )}
            </div>
          )}

          <div data-invalid={inv("date")}>
            <Label required htmlFor="date">
              Installation date
            </Label>
            <Input
              id="date"
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
            />
            <FieldError>{errors.date}</FieldError>
          </div>
        </div>
      </Section>

      {/* Step 2 — Kitchen meter */}
      <Section
        step={2}
        title="Kitchen meter"
        desc="Serial number and an on-site photo of the installed meter."
      >
        <div className="space-y-4">
          <div data-invalid={inv("kitchenSerial")}>
            <Label required htmlFor="kSerial">
              <span className="inline-flex items-center gap-1.5">
                <IconGauge className="h-4 w-4 text-secondary" /> Meter serial
                number
              </span>
            </Label>
            <Input
              id="kSerial"
              value={kitchenSerial}
              onChange={(e) => setKitchenSerial(e.target.value)}
              placeholder="e.g. QS-K-009123"
              autoCapitalize="characters"
            />
            <FieldError>{errors.kitchenSerial}</FieldError>
          </div>
          <div data-invalid={inv("kitchenPhoto")}>
            <Label required>Meter photo</Label>
            <PhotoInput
              label="kitchen meter"
              value={kitchenPhoto}
              onChange={(v) => setKitchenPhoto(v)}
            />
            <Helper>Compressed automatically before upload.</Helper>
            <FieldError>{errors.kitchenPhoto}</FieldError>
          </div>
        </div>
      </Section>

      {/* Step 3 — Bathroom meter */}
      <Section
        step={3}
        title="Bathroom meter"
        desc="Serial number and an on-site photo of the installed meter."
      >
        <div className="space-y-4">
          <div data-invalid={inv("bathroomSerial")}>
            <Label required htmlFor="bSerial">
              <span className="inline-flex items-center gap-1.5">
                <IconDroplet className="h-4 w-4 text-secondary" /> Meter serial
                number
              </span>
            </Label>
            <Input
              id="bSerial"
              value={bathroomSerial}
              onChange={(e) => setBathroomSerial(e.target.value)}
              placeholder="e.g. QS-B-009124"
              autoCapitalize="characters"
            />
            <FieldError>{errors.bathroomSerial}</FieldError>
          </div>
          <div data-invalid={inv("bathroomPhoto")}>
            <Label required>Meter photo</Label>
            <PhotoInput
              label="bathroom meter"
              value={bathroomPhoto}
              onChange={(v) => setBathroomPhoto(v)}
            />
            <FieldError>{errors.bathroomPhoto}</FieldError>
          </div>
        </div>
      </Section>

      {/* Step 4 — Remarks */}
      <Section step={4} title="Remarks" desc="Optional notes about the job.">
        <Textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="e.g. Old meter removed, valve replaced…"
        />
      </Section>

      {/* Step 5 — Owner sign-off */}
      <Section
        step={5}
        title="Owner confirmation & signature"
        desc="The owner confirms both meters are installed and working."
      >
        <div className="space-y-4">
          <label
            data-invalid={inv("confirmed")}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-input bg-muted/30 p-3.5"
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                setErrors((p) => ({ ...p, confirmed: "" }));
              }}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-input accent-[hsl(var(--primary))]"
            />
            <span className="text-sm text-foreground">
              I confirm that both water meters (kitchen &amp; bathroom) have been
              installed correctly and are functioning. The details above are
              accurate.
            </span>
          </label>
          <FieldError>{errors.confirmed}</FieldError>

          <div data-invalid={inv("signature")}>
            <Label required>Owner signature</Label>
            <SignaturePad
              onChange={(v) => {
                setSignature(v);
                if (v) setErrors((p) => ({ ...p, signature: "" }));
              }}
            />
            <FieldError>{errors.signature}</FieldError>
          </div>
        </div>
      </Section>

      {/* Submit */}
      <div className="sticky bottom-20 z-30 md:bottom-4">
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          className="w-full shadow-lg"
        >
          {!submitting && <IconCheckCircle className="h-5 w-5" />}
          {submitting ? "Saving installation…" : "Save installation"}
        </Button>
      </div>
      {flat && (
        <p className="pb-2 text-center text-xs text-muted-foreground">
          Saving for flat{" "}
          <span className="tabular font-medium text-foreground">
            {flat.flatNumber}
          </span>
          {!flat.vacant && ` · ${flat.ownerName}`}
        </p>
      )}
    </form>
  );
}
