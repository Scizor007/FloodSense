"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HistoricalLegend } from "./historical-legend";

/** [← Previous] August 2025 [Next →] + status legend. */
export function CalendarHeader({
  monthLabel,
  locationName,
  onPrev,
  onNext,
  canPrev,
  canNext,
}: {
  monthLabel: string;
  locationName: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 pb-3.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label={`Previous month (${monthLabel})`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:text-muted-foreground"
        >
          <ChevronLeft className="h-4.5 w-4.5" />
        </button>

        <div className="min-w-[170px] text-center">
          <p className="font-display text-lg font-semibold leading-tight tracking-tight sm:text-xl">
            {monthLabel}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {locationName}
          </p>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label={`Next month (${monthLabel})`}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all",
            "hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:text-muted-foreground"
          )}
        >
          <ChevronRight className="h-4.5 w-4.5" />
        </button>
      </div>

      <HistoricalLegend />
    </div>
  );
}
