"use client";

import { motion } from "framer-motion";
import { buildEventTimeline } from "@/lib/flood/historical-service";
import type { HistoricalDay } from "@/lib/flood/historical-data";
import { EstimateTag } from "./estimate-tag";

/**
 * Model-estimated progression of a waterlogging event, from first rainfall
 * to recession. Labelled as model-estimated unless the day carries
 * documented incident reports.
 */
export function EventTimeline({ day }: { day: HistoricalDay }) {
  const steps = buildEventTimeline(day);
  if (steps.length === 0) return null;

  const isSevere = day.status === "severe";
  const accent = isSevere
    ? "var(--risk-severe)"
    : "var(--risk-high)";

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Event timeline
        </p>
        <EstimateTag
          label={
            day.documented && day.reports > 0
              ? `Anchored to ${day.reports} report${day.reports === 1 ? "" : "s"}`
              : "Model-estimated"
          }
        />
      </div>

      <ol className="relative space-y-3.5 pl-[70px]">
        {/* rail */}
        <span
          className="absolute bottom-2 left-[52px] top-2 w-px bg-border"
          aria-hidden
        />
        {steps.map((step, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.07, duration: 0.3 }}
            className="relative flex items-center gap-3"
          >
            <span className="absolute left-0 flex w-[44px] justify-end">
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {step.time}
              </span>
            </span>
            <span
              className="relative z-10 -ml-[7px] h-3 w-3 shrink-0 rounded-full border-2"
              style={{
                borderColor: step.major ? accent : "var(--border)",
                background: step.major ? accent : "var(--card)",
                boxShadow: step.major ? `0 0 8px ${accent}80` : undefined,
              }}
              aria-hidden
            />
            <span
              className={`text-[13px] leading-snug ${
                step.major ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
