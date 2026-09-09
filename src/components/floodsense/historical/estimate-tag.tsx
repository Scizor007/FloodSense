"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const DATA_HONESTY_NOTE =
  "Historical rainfall can be obtained from weather datasets. Exact waterlogging duration and timing are shown as estimates unless supported by a documented incident report.";

/**
 * "Model-estimated" label used wherever a value is derived by the FloodSense
 * model rather than observed. Optional tooltip explains the observed-vs-
 * estimated contract (data honesty requirement).
 */
export function EstimateTag({
  withTooltip = false,
  label = "Model-estimated",
  className,
  tooltipClassName,
}: {
  withTooltip?: boolean;
  label?: string;
  className?: string;
  tooltipClassName?: string;
}) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed border-water/60 bg-water/5 px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.08em] text-water-deep"
        )}
      >
        {label}
        {withTooltip && (
          <button
            type="button"
            aria-label="What does model-estimated mean?"
            className="rounded-full p-[2px] text-water-deep/70 transition-colors hover:text-water-deep"
          >
            <Info className="h-3 w-3" aria-hidden />
          </button>
        )}
      </span>
      {withTooltip && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-60 -translate-x-1/2 rounded-lg border border-border bg-popover p-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-popover-foreground opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100",
            tooltipClassName
          )}
        >
          {DATA_HONESTY_NOTE}
        </span>
      )}
    </span>
  );
}
