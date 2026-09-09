"use client";

import { HISTORICAL_STATUS_META } from "@/lib/flood/historical-data";
import type { HistoricalStatus } from "@/lib/flood/historical-data";
import { EstimateTag } from "./estimate-tag";

/** Status legend for the calendar — subtle dots, full labels in tooltips. */
export function HistoricalLegend() {
  const statuses = Object.entries(HISTORICAL_STATUS_META) as [
    HistoricalStatus,
    (typeof HISTORICAL_STATUS_META)[HistoricalStatus],
  ][];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {statuses.map(([key, meta]) => (
        <span
          key={key}
          title={meta.label}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: meta.color }}
            aria-hidden
          />
          {meta.short}
        </span>
      ))}
      <span className="hidden h-3.5 w-px bg-border sm:block" aria-hidden />
      <EstimateTag withTooltip />
    </div>
  );
}
