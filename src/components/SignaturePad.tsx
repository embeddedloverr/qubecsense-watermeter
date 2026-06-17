"use client";

import * as React from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "./ui";
import { IconPen } from "./icons";

/**
 * Captures an owner signature on a canvas and reports a PNG data URL.
 * Calls onChange(null) when cleared.
 */
export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const padRef = React.useRef<SignaturePadLib | null>(null);
  const [empty, setEmpty] = React.useState(true);

  const resize = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width } = canvas.getBoundingClientRect();
    canvas.width = width * ratio;
    canvas.height = 200 * ratio;
    const ctx = canvas.getContext("2d");
    ctx?.scale(ratio, ratio);
    padRef.current?.clear();
    setEmpty(true);
    onChange(null);
  }, [onChange]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePadLib(canvas, {
      penColor: "#0f172a",
      minWidth: 0.8,
      maxWidth: 2.4,
      backgroundColor: "rgba(255,255,255,1)",
    });
    padRef.current = pad;

    const handleEnd = () => {
      const isEmpty = pad.isEmpty();
      setEmpty(isEmpty);
      onChange(isEmpty ? null : pad.toDataURL("image/png"));
    };
    pad.addEventListener("endStroke", handleEnd);

    resize();
    window.addEventListener("resize", resize);
    return () => {
      pad.removeEventListener("endStroke", handleEnd);
      window.removeEventListener("resize", resize);
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = () => {
    padRef.current?.clear();
    setEmpty(true);
    onChange(null);
  };

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-input bg-white">
        <canvas
          ref={canvasRef}
          className="signature-canvas block h-[200px] w-full touch-none"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <IconPen className="h-3.5 w-3.5" />
          {empty ? "Ask the owner to sign above" : "Signature captured"}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
