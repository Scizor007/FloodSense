"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { HISTORICAL_STATUS_META } from "@/lib/flood/historical-data";
import type { HistoricalDay } from "@/lib/flood/historical-data";

/**
 * Compact daily-rainfall bar chart for the selected month.
 * Shares the exact dataset with the calendar; clicking a bar selects the
 * same day in the calendar (and vice versa).
 */
export function RainfallChart({
  days,
  monthLabel,
  selectedDate,
  onSelectDay,
}: {
  days: HistoricalDay[];
  monthLabel: string;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
}) {
  const maxRain = Math.max(...days.map((d) => d.rainfallMm), 1);
  // nice round axis max (multiples of 20)
  const axisMax = Math.max(20, Math.ceil(maxRain / 20) * 20);
  const peak = days.reduce((a, b) => (b.rainfallMm > a.rainfallMm ? b : a), days[0]);

  const barColor = (d: HistoricalDay) => {
    if (d.status === "severe") return HISTORICAL_STATUS_META.severe.color;
    if (d.status === "waterlogging") return HISTORICAL_STATUS_META.waterlogging.color;
    if (d.status === "watch") return HISTORICAL_STATUS_META.watch.color;
    return "var(--water)";
  };

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-water/15">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
              <rect x="2" y="8" width="2.6" height="6" rx="1" fill="var(--water)" />
              <rect x="6.6" y="4" width="2.6" height="10" rx="1" fill="var(--water)" />
              <rect x="11.2" y="1.5" width="2.6" height="12.5" rx="1" fill="var(--water)" />
            </svg>
          </span>
          Rainfall — daily
        </p>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          {monthLabel} · mm · observed
        </p>
      </div>

      {/* plot area */}
      <div className="relative flex h-[168px] gap-1.5 pl-9">
        {/* y gridlines + labels */}
        <div className="pointer-events-none absolute inset-y-0 left-9 right-0" aria-hidden>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <div
              key={f}
              className="absolute left-0 right-0 border-t border-dashed border-border/70"
              style={{ top: `${(1 - f) * 100}%` }}
            />
          ))}
          <div className="absolute bottom-0 left-0 right-0 border-t border-border" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8" aria-hidden>
          {[axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0].map((v, i) => (
            <span
              key={i}
              className="absolute right-1 -translate-y-1/2 font-mono text-[9.5px] tabular-nums text-muted-foreground"
              style={{ top: `${(1 - v / axisMax) * 100}%` }}
            >
              {Math.round(v)}
            </span>
          ))}
        </div>

        {/* bars */}
        <div className="relative flex h-full flex-1 items-end justify-between gap-[2px] sm:gap-[3px]">
          {days.map((d, i) => {
            const selected = d.date === selectedDate;
            const heightPct = d.rainfallMm >= 1 ? (d.rainfallMm / axisMax) * 100 : 0;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onSelectDay(d.date)}
                aria-label={`${d.date} — ${d.rainfallMm} mm, ${HISTORICAL_STATUS_META[d.status].label}`}
                title={`${monthLabel.split(" ")[0].slice(0, 3)} ${d.day} · ${d.rainfallMm} mm · ${HISTORICAL_STATUS_META[d.status].label}${d.reports > 0 ? ` · ${d.reports} reports` : ""}`}
                data-cursor="hover"
                className="group relative flex h-full min-w-0 flex-1 cursor-pointer items-end focus-visible:outline-none"
              >
                <motion.span
                  initial={{ height: 0 }}
                  animate={{
                    height:
                      d.rainfallMm >= 1
                        ? `${Math.max(heightPct, 2.5)}%`
                        : "3px",
                  }}
                  transition={{ delay: Math.min(i * 0.01, 0.3), duration: 0.4, ease: "easeOut" }}
                  className={cn(
                    "relative z-10 w-full rounded-t-[3px] transition-opacity",
                    d.rainfallMm === 0 && "bg-border/60",
                    selected && "ring-2 ring-primary/70 ring-offset-1 ring-offset-card"
                  )}
                  style={
                    d.rainfallMm >= 1
                      ? {
                          background: barColor(d),
                          opacity: d.rainfallMm >= 10 ? 0.85 : 0.55,
                        }
                      : undefined
                  }
                />
                {/* hover highlight column */}
                <span className="absolute inset-y-0 left-1/2 z-0 w-[300%] -translate-x-1/2 rounded bg-secondary/0 transition-colors group-hover:bg-secondary/50 group-focus-visible:bg-secondary/50" />
              </button>
            );
          })}
        </div>
      </div>

      {/* x labels */}
      <div className="mt-1 flex gap-[2px] pl-9 sm:gap-[3px]" aria-hidden>
        {days.map((d) => {
          const show = d.day % 5 === 0 || d.day === days.length;
          return (
            <span
              key={d.date}
              className={cn(
                "flex-1 text-center font-mono text-[9px] tabular-nums",
                show ? "text-muted-foreground" : "text-transparent"
              )}
            >
              {show ? d.day : "·"}
            </span>
          );
        })}
      </div>

      <p className="mt-2.5 border-t border-border/70 pt-2.5 text-[11px] text-muted-foreground">
        Click a bar to inspect that day in the calendar
        {peak && peak.rainfallMm >= 1 && (
          <span className="font-mono">
            {" "}· peak {peak.rainfallMm} mm on {monthLabel.split(" ")[0].slice(0, 3)} {peak.day}
          </span>
        )}
      </p>
    </div>
  );
}
