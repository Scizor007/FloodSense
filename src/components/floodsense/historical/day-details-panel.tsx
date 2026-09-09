"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, CloudRain, Gauge, FileText, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { HISTORICAL_STATUS_META } from "@/lib/flood/historical-data";
import type { HistoricalDay, HistoricalLocation } from "@/lib/flood/historical-data";
import {
  getRiskFactors,
  formatTime12h,
  situationSourceLabel,
} from "@/lib/flood/historical-service";
import { DATA_HONESTY_NOTE } from "./estimate-tag";
import { EventTimeline } from "./event-timeline";

function DetailTile({
  label,
  value,
  sub,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/80 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
        <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p
        className="mt-1.5 font-mono text-lg font-bold leading-none tabular-nums"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

/** Full daily breakdown: observed vs model-estimated, factors, timeline. */
export function DayDetailsPanel({
  day,
  location,
  onClose,
}: {
  day: HistoricalDay | null;
  location: HistoricalLocation;
  onClose: () => void;
}) {
  // Escape to close + body scroll lock while open
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!day) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [day, onClose]);

  const meta = day ? HISTORICAL_STATUS_META[day.status] : null;
  const isEvent = day?.status === "waterlogging" || day?.status === "severe";
  const factors = day ? getRiskFactors(day, location) : [];

  const weekday = day
    ? new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", {
        weekday: "long",
      })
    : "";
  const dateLabel = day
    ? new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <AnimatePresence>
      {day && meta && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
          {/* backdrop */}
          <motion.button
            type="button"
            aria-label="Close day details"
            className="absolute inset-0 cursor-default bg-[#1a1025]/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* sheet */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`${location.name}, ${dateLabel} details`}
            initial={{ x: 56, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 56, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-card shadow-2xl sm:h-full sm:max-h-none sm:w-[430px] sm:rounded-none sm:border-l sm:border-t-0"
          >
            {/* header */}
            <div className="sticky top-0 z-10 border-b border-border bg-card/95 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                    {weekday} · {dateLabel}
                  </p>
                  <h3 className="font-display mt-1 flex items-center gap-1.5 text-lg font-semibold leading-tight">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {location.name}
                  </h3>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close day details"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* status banner */}
              <div
                className="mt-3 flex items-center gap-2.5 rounded-xl border p-3"
                style={{
                  borderColor: `${meta.color}55`,
                  background: `${meta.color}12`,
                }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[13.5px] font-semibold leading-tight"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </p>
                  {day.rainfallMm >= 1 && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {situationSourceLabel(day)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-5 p-4">
              {/* OBSERVED DATA */}
              <section aria-label="Observed data">
                <p className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  <CloudRain className="h-3.5 w-3.5 text-water" aria-hidden />
                  Observed data
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <DetailTile
                    label="Rainfall"
                    value={day.rainfallMm >= 1 ? `${day.rainfallMm} mm` : "0 mm"}
                    sub="daily total"
                    icon={CloudRain}
                  />
                  <DetailTile
                    label="Peak intensity"
                    value={
                      day.rainfallMm >= 1 ? `${day.peakIntensityMmHr} mm/hr` : "—"
                    }
                    sub="observed max rate"
                    icon={Gauge}
                  />
                  <div className="col-span-2">
                    <DetailTile
                      label="Historical reports"
                      value={`${day.reports}`}
                      sub={
                        day.reports > 0
                          ? "documented incident reports"
                          : "no incident reports on file"
                      }
                      icon={FileText}
                    />
                  </div>
                </div>
              </section>

              {/* MODEL-ESTIMATED */}
              <section aria-label="Model-estimated data">
                <p className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-water" aria-hidden />
                  Model-estimated
                </p>

                {isEvent ? (
                  <div className="grid grid-cols-2 gap-2">
                    <DetailTile
                      label="Waterlogging duration"
                      value={`~${day.estimatedDurationHours} h`}
                      icon={Clock}
                    />
                    <DetailTile
                      label="Occurrence window"
                      value={
                        day.estimatedStartTime && day.estimatedEndTime
                          ? `${formatTime12h(day.estimatedStartTime)} – ${formatTime12h(day.estimatedEndTime)}`
                          : "—"
                      }
                      icon={Clock}
                    />
                    <p className="col-span-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      {day.documented && day.reports > 0
                        ? `Window reconstructed from ${day.reports} documented incident report${day.reports === 1 ? "" : "s"} and rainfall timing.`
                        : "No incident report exists for this day — duration and timing are model-derived."}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
                    <p className="text-[13px] font-medium text-secondary-foreground">
                      No waterlogging modelled for this day
                    </p>
                    <p className="mt-1 text-[12.5px] leading-[1.6] text-muted-foreground">
                      {day.rainfallMm === 0
                        ? "No rainfall was recorded, so no waterlogging is expected at this location."
                        : day.peakIntensityMmHr < 10
                          ? `The ${day.rainfallMm} mm of rain fell as a long, low-intensity spell (peak ${day.peakIntensityMmHr} mm/hr) — below this location's waterlogging trigger.`
                          : `Rainfall of ${day.rainfallMm} mm with a ${day.peakIntensityMmHr} mm/hr peak stayed below this location's waterlogging threshold.`}
                    </p>
                  </div>
                )}
              </section>

              {/* WHY HIGH RISK */}
              {isEvent && factors.length > 0 && (
                <section aria-label="Why was this day high risk">
                  <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                    Why was this day high risk?
                  </p>
                  <ul className="space-y-1.5">
                    {factors.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-[13px] leading-snug text-secondary-foreground"
                      >
                        <ChevronRight
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                          aria-hidden
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* timeline */}
              {isEvent && <EventTimeline day={day} />}

              {/* honesty footnote */}
              <p className="border-t border-border/70 pt-3 text-[11px] leading-relaxed text-muted-foreground">
                {DATA_HONESTY_NOTE}
              </p>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
