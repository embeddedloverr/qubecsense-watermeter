import { cn } from "@/lib/utils";

/** QubecSense wordmark with a water-drop + circuit "sense" mark. */
export function Logo({
  className,
  showText = true,
  size = 32,
}: {
  className?: string;
  showText?: boolean;
  size?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="40" height="40" rx="11" fill="hsl(var(--primary))" />
        <path
          d="M20 8.5c4.4 4.9 7.5 9 7.5 13.1A7.5 7.5 0 0 1 20 29.1a7.5 7.5 0 0 1-7.5-7.5C12.5 17.5 15.6 13.4 20 8.5Z"
          fill="white"
          fillOpacity="0.95"
        />
        <circle cx="20" cy="22" r="2.4" fill="hsl(var(--primary))" />
        <path
          d="M20 22h5.5M20 22v4.5M20 22l-3.8 3.2"
          stroke="hsl(var(--primary))"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="25.5" cy="22" r="1.1" fill="hsl(var(--secondary))" />
        <circle cx="20" cy="26.5" r="1.1" fill="hsl(var(--secondary))" />
        <circle cx="16.2" cy="25.2" r="1.1" fill="hsl(var(--secondary))" />
      </svg>
      {showText && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            QubecSense
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Meter Ops
          </span>
        </span>
      )}
    </span>
  );
}
