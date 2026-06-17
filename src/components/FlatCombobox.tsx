"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { IconSearch, IconChevronRight, IconCheck } from "./icons";
import { Badge } from "./ui";

export interface FlatOption {
  flatNumber: string;
  ownerName: string;
  ownerPhone: string;
  vacant: boolean;
  installed: boolean;
}

export function FlatCombobox({
  flats,
  value,
  onChange,
}: {
  flats: FlatOption[];
  value: string | null;
  onChange: (flat: FlatOption | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  const selected = flats.find((f) => f.flatNumber === value) || null;

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flats;
    return flats.filter(
      (f) =>
        f.flatNumber.toLowerCase().includes(q) ||
        f.ownerName.toLowerCase().includes(q)
    );
  }, [flats, query]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-12 w-full items-center justify-between rounded-lg border border-input bg-card px-3.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="tabular font-semibold text-foreground">
              {selected.flatNumber}
            </span>
            <span className="truncate text-sm text-muted-foreground">
              {selected.vacant ? "Vacant flat" : selected.ownerName}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select a flat…</span>
        )}
        <IconChevronRight
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-fade-in">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <IconSearch className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search flat number or owner…"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No flats match “{query}”.
              </li>
            )}
            {filtered.map((f) => {
              const isSel = f.flatNumber === value;
              return (
                <li key={f.flatNumber}>
                  <button
                    type="button"
                    disabled={f.installed}
                    onClick={() => {
                      onChange(f);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors",
                      f.installed
                        ? "cursor-not-allowed opacity-55"
                        : "hover:bg-muted",
                      isSel && "bg-accent"
                    )}
                    role="option"
                    aria-selected={isSel}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="tabular w-12 shrink-0 font-semibold text-foreground">
                        {f.flatNumber}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        {f.vacant ? "Vacant flat" : f.ownerName}
                      </span>
                    </span>
                    {f.installed ? (
                      <Badge tone="success">
                        <IconCheck className="h-3 w-3" /> Done
                      </Badge>
                    ) : isSel ? (
                      <IconCheck className="h-4 w-4 text-primary" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
