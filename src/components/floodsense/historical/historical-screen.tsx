"use client";

import { useState } from "react";
import { MapPin, ChevronDown, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { useFloodStore } from "@/lib/flood/store";
import { HISTORICAL_LOCATIONS, HISTORICAL_MONTHS, DEFAULT_HISTORICAL_MONTH } from "@/lib/flood/historical-data";
import type { HistoricalDay } from "@/lib/flood/historical-data";
import { monthLabel as formatMonthLabel, monthIndex, summarizeMonth } from "@/lib/flood/historical-service";
import { ScreenHeader } from "../shared/risk-widgets";
import { CalendarHeader } from "./calendar-header";
import { CalendarDay, WeekdayHeader } from "./calendar-day";
import { HistoricalSummary } from "./historical-summary";
import { RainfallChart } from "./rainfall-chart";
import { DayDetailsPanel } from "./day-details-panel";
import { useHistoricalMonth } from "./use-historical-month";

const MONTH_IDS = HISTORICAL_MONTHS.map((m) => m.id);
const MONTH_SHORT = ["May", "Jun", "Jul", "Aug", "Sep"];

export function HistoricalScreen() {
  const locationId = useFloodStore((s) => s.historicalLocationId);
  const setLocation = useFloodStore((s) => s.openHistoricalLocation);
  const [month, setMonth] = useState(DEFAULT_HISTORICAL_MONTH);
  // selection is bound to its location+month context, so switching either
  // automatically invalidates the open day (no manual reset, no refs)
  const [selection, setSelection] = useState<{ ctx: string; date: string } | null>(null);
  const ctx = `${locationId}:${month}`;

  const { data, loading, error } = useHistoricalMonth(locationId, month);

  const location =
    HISTORICAL_LOCATIONS.find((l) => l.id === locationId) ?? HISTORICAL_LOCATIONS[0];
  const mIdx = monthIndex(month);
  const mLabel = formatMonthLabel(month);
  const summary = data ? summarizeMonth(data) : null;
  const selectedDay =
    selection && selection.ctx === ctx
      ? (data?.days.find((d) => d.date === selection.date) ?? null)
      : null;
  const selectedDate = selectedDay?.date ?? null;
  const handleSelectDay = (date: string) => setSelection({ ctx, date });

  // calendar grid: leading blanks + days
  const cells: (HistoricalDay | null)[] = [];
  if (data) {
    const [y, mo] = month.split("-").map(Number);
    const leading = new Date(y, mo - 1, 1).getDay();
    for (let i = 0; i < leading; i++) cells.push(null);
    data.days.forEach((d) => cells.push(d));
  }

  const prevMonth = () => mIdx > 0 && setMonth(MONTH_IDS[mIdx - 1]);
  const nextMonth = () => mIdx < MONTH_IDS.length - 1 && setMonth(MONTH_IDS[mIdx + 1]);

  return (
    <div className="space-y-5">
      <ScreenHeader
        eyebrow="Historical analysis"
        title="Calendar"
        desc="What happened at this location when the rain came? Explore rainfall and waterlogging day by day across the 2025 monsoon — which days flooded, how long water stood, and why."
      />

      {/* controls: location + month quick-jump */}
      <div className="glass-card flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl p-3.5">
        <div className="flex items-center gap-2.5">
          <label
            htmlFor="historical-location"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            Historical location
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" aria-hidden />
            <select
              id="historical-location"
              value={locationId}
              onChange={(e) => setLocation(e.target.value)}
              className="h-10 appearance-none rounded-xl border border-input bg-card pl-9 pr-9 text-[13.5px] font-medium text-foreground shadow-sm transition-colors hover:border-primary/50 focus-visible:border-primary focus-visible:outline-none"
            >
              {HISTORICAL_LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Month
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jump to month">
            {HISTORICAL_MONTHS.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMonth(m.id)}
                aria-pressed={month === m.id}
                data-cursor="hover"
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  month === m.id
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {MONTH_SHORT[i]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* summary */}
      {summary ? (
        <HistoricalSummary
          locationName={location.name}
          monthLabel={mLabel}
          summary={summary}
        />
      ) : (
        <div className="glass-card h-[132px] animate-pulse rounded-xl" aria-hidden />
      )}

      {/* calendar */}
      <div className="glass-card overflow-hidden rounded-xl">
        <CalendarHeader
          monthLabel={mLabel}
          locationName={location.name}
          onPrev={prevMonth}
          onNext={nextMonth}
          canPrev={mIdx > 0}
          canNext={mIdx < MONTH_IDS.length - 1}
        />
        <WeekdayHeader />
        {data ? (
          <div className="grid grid-cols-7 gap-1.5 px-3 pb-3 sm:gap-2">
            {cells.map((day, i) => (
              <CalendarDay
                key={day ? day.date : `blank-${i}`}
                day={day}
                selected={!!day && day.date === selectedDate}
                onSelect={handleSelectDay}
                index={i}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5 px-3 pb-3 sm:gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="min-h-[68px] animate-pulse rounded-lg bg-secondary/40 sm:min-h-[96px]"
                aria-hidden
              />
            ))}
          </div>
        )}
      </div>

      {/* chart */}
      {data ? (
        <RainfallChart
          days={data.days}
          monthLabel={mLabel}
          selectedDate={selectedDate}
          onSelectDay={handleSelectDay}
        />
      ) : (
        <div className="glass-card h-[248px] animate-pulse rounded-xl" aria-hidden />
      )}

      {/* error / empty state (defensive — all current locations have data) */}
      {error && (
        <div className="glass-card flex items-center gap-3 rounded-xl p-4 text-sm text-secondary-foreground">
          <CalendarDays className="h-4.5 w-4.5 shrink-0 text-primary" aria-hidden />
          Historical data could not be loaded for this location. Try another month or location.
        </div>
      )}
      {!loading && !data && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-card rounded-xl p-6 text-center"
        >
          <p className="text-sm font-medium">No historical data yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            This location has no historical profile in the current dataset.
          </p>
        </motion.div>
      )}

      {/* day details sheet */}
      <DayDetailsPanel
        day={selectedDay}
        location={location}
        onClose={() => setSelection(null)}
      />
    </div>
  );
}
