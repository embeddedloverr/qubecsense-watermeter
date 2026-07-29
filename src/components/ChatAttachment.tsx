"use client";

import * as React from "react";
import { compressToFit } from "@/lib/clientImage";
import { IconCamera, IconX, IconSearch } from "./icons";
import { Spinner } from "./ui";

export interface Attachment {
  url: string;
  width: number;
  height: number;
}

/* -------------------------------- Viewer -------------------------------- */

/**
 * Full-screen image viewer. The thumbnail in a chat bubble is deliberately
 * small; this is where the admin actually reads a meter serial or sees where
 * the water is coming from, so it also offers zoom and opening the raw file.
 */
export function ImageViewer({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption?: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The viewer covers the page — stop the thread behind it scrolling.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Attached photo"
      className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white">
        <p className="min-w-0 truncate text-sm">{caption || "Photo"}</p>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg px-3 py-2 text-xs font-medium hover:bg-white/15"
          >
            Open full size
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/15"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className={`flex-1 ${zoomed ? "overflow-auto" : "overflow-hidden"} px-3 pb-3`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={caption || "Attached photo"}
          onClick={() => setZoomed((z) => !z)}
          className={
            zoomed
              ? "max-w-none cursor-zoom-out"
              : "mx-auto h-full max-h-full w-auto max-w-full cursor-zoom-in object-contain"
          }
          style={zoomed ? { width: "200%" } : undefined}
        />
      </div>
      <p className="pb-3 text-center text-[11px] text-white/60">
        Tap the photo to zoom · Esc to close
      </p>
    </div>
  );
}

/* ------------------------------ Bubble image ----------------------------- */

/** The image as it appears inside a message bubble. */
export function AttachmentThumb({
  attachment,
  caption,
}: {
  attachment: Attachment;
  caption?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // Reserve the right box before the image loads so the thread does not jump
  // as photos stream in.
  const ratio =
    attachment.width && attachment.height
      ? attachment.width / attachment.height
      : 4 / 3;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // min-w matters: a bubble with no caption sizes to its timestamp, which
        // collapsed photo-only messages to a thumbnail barely 128px wide.
        className="group relative mt-1 block w-full min-w-[200px] max-w-[300px] overflow-hidden rounded-xl bg-black/10"
        style={{ aspectRatio: String(ratio), maxHeight: 260 }}
        aria-label="View photo full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.url}
          alt={caption || "Attached photo"}
          loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          <IconSearch className="h-3 w-3" /> View
        </span>
      </button>
      {open && (
        <ImageViewer
          src={attachment.url}
          caption={caption}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* -------------------------------- Picker --------------------------------- */

/**
 * Attach button + preview strip for a chat composer. Holds the pending image
 * as a data URL; the caller posts it alongside the message text.
 */
export function AttachPicker({
  value,
  onChange,
  disabled,
  onError,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);

  const pick = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      onError?.("Please choose a photo.");
      return;
    }
    setBusy(true);
    try {
      onChange(await compressToFit(file));
    } catch {
      onError?.("That photo could not be read. Try another.");
    } finally {
      setBusy(false);
      // Let the same file be picked again after removing it.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {busy ? (
          <Spinner className="h-4 w-4" />
        ) : (
          <IconCamera className="h-4 w-4" />
        )}
        {busy ? "Preparing…" : "Photo"}
      </button>
    </>
  );
}

/** Thumbnail of the not-yet-sent image, with a remove control. */
export function AttachPreview({
  dataUrl,
  onRemove,
}: {
  dataUrl: string;
  onRemove: () => void;
}) {
  return (
    <div className="relative inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt="Photo to send"
        className="h-20 w-20 rounded-lg border border-border object-cover"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        className="absolute -right-2 -top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
