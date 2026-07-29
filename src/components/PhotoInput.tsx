"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { compressFile } from "@/lib/clientImage";
import { IconCamera, IconX, IconCheck } from "./icons";

/**
 * Camera/file photo capture with client-side downscale + JPEG compression.
 * Reports a compressed data URL via onChange. The server compresses again.
 */
export function PhotoInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const dataUrl = await compressFile(file, 1280, 0.7);
      onChange(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-input">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={`${label} preview`}
            className="h-44 w-full object-cover"
          />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-xs font-medium text-success-foreground">
            <IconCheck className="h-3.5 w-3.5" /> Captured
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${label} photo`}
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <IconX className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 rounded-lg bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow hover:bg-card"
          >
            Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-muted/40 text-muted-foreground transition-colors hover:border-ring hover:text-foreground",
            busy && "opacity-60"
          )}
        >
          <IconCamera className="h-8 w-8" />
          <span className="text-sm font-medium">
            {busy ? "Processing…" : `Capture ${label}`}
          </span>
          <span className="text-xs">Tap to use camera or gallery</span>
        </button>
      )}
    </div>
  );
}

