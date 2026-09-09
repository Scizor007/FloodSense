"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { HISTORICAL_STATUS_META } from "@/lib/flood/historical-data";
import type { HistoricalDay } from "@/lib/flood/historical-data";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Sun..Sat header row for the calendar grid. */
export function WeekdayHeader() {
  return (
    <div className="grid grid-cols-7 gap-1.5 px-3 pb-2 pt-3 sm:gap-2" aria-hidden>
      {WEEKDAYS.map((d) => (
        <div
          key={d}
          className="text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          {d}
        </div>
      ))}
    </div>
  );
}

/** One calendar cell. `day === null` renders the leading offset spacer. */
export function CalendarDay({
  day,
  selected,
  onSelect,
  index,
}: {
  day: HistoricalDay | null;
  selected: boolean;
  onSelect: (date: string) => void;
  index: number;
}) {
  if (!day) {
    return <div className="min-h-[68px] rounded-lg bg-secondary/25 sm:min-h-[96px]" />;
  }

  const meta = HISTORICAL_STATUS_META[day.status];
  const hasEvent = day.status === "waterlogging" || day.status === "severe";
  const ariaLabel = `${day.date} — ${
    day.rainfallMm > 0 ? `${day.rainfallMm} mm rainfall` : "no rainfall"
  }, ${meta.label}${day.reports > 0 ? `, ${day.reports} reports` : ""}`;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.008, 0.25), duration: 0.25 }}
      onClick={() => onSelect(day.date)}
      aria-label={ariaLabel}
      aria-pressed={selected}
      data-cursor="hover"
      className={cn(
        "group relative flex min-h-[68px] flex-col justify-between overflow-hidden rounded-lg border p-1.5 text-left transition-all duration-200 sm:min-h-[96px] sm:p-2.5",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-primary ring-2 ring-primary/60 ring-offset-1 ring-offset-card"
          : "border-border hover:border-primary/45"
      )}
      style={
        hasEvent
          ? {
              backgroundColor: `${meta.color}${day.status === "severe" ? "14" : "0e"}`,
            }
          : undefined
      }
    >
      {/* date + status dot */}
      <span className="flex w-full items-start justify-between gap-1">
        <span
          className={cn(
            "font-mono text-[13px] font-semibold tabular-nums sm:text-sm",
            day.rainfallMm >= 1 ? "text-foreground" : "text-muted-foreground/70"
          )}
        >
          {day.day}
        </span>
        {day.rainfallMm >= 1 && (
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full"
            style={{ background: meta.color }}
            title={meta.label}
            aria-hidden
          />
        )}
      </span>

      {/* rainfall */}
      <span className="flex w-full flex-col">
        {day.rainfallMm >= 1 ? (
          <span className="font-mono text-[13px] font-bold leading-none tabular-nums text-foreground sm:text-[15px]">
            {day.rainfallMm}
            <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">
              mm
            </span>
          </span>
        ) : (
          <span className="font-mono text-[12px] leading-none text-muted-foreground/50">
            —
          </span>
        )}

        {/* status label — hidden on the tightest screens */}
        <span
          className={cn(
            "mt-1 hidden truncate text-[10px] font-medium leading-tight sm:block",
            hasEvent ? "" : "text-muted-foreground"
          )}
          style={hasEvent ? { color: meta.color } : undefined}
        >
          {meta.short}
        </span>
        {/* documented marker */}
        {day.documented && day.reports > 0 && (
          <span
            className="absolute right-1.5 top-1.5 hidden h-1.5 w-1.5 rounded-full border border-foreground/25 bg-card sm:block"
            title={`${day.reports} documented incident report${day.reports === 1 ? "" : "s"}`}
            aria-hidden
          />
        )}
      </span>
    </motion.button>
  );
}
