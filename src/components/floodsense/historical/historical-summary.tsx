"use client";

import { motion } from "framer-motion";
import { MapPin, CloudRain, Droplets, Waves, AlertTriangle, Clock, TrendingUp, Flag } from "lucide-react";
import { HISTORICAL_STATUS_META } from "@/lib/flood/historical-data";
import type { MonthSummary } from "@/lib/flood/historical-service";
import { EstimateTag } from "./estimate-tag";

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  valueColor,
  delay,
  tag,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  valueColor?: string;
  delay: number;
  tag?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="flex flex-col justify-between gap-1.5 rounded-xl border border-border bg-card/70 p-3"
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden />
      </div>
      <div>
        <p
          className="font-mono text-xl font-bold leading-none tabular-nums sm:text-2xl"
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {sub && (
            <p className="font-mono text-[10.5px] text-muted-foreground">{sub}</p>
          )}
          {tag}
        </div>
      </div>
    </motion.div>
  );
}

/** Location + month summary strip above the calendar. */
export function HistoricalSummary({
  locationName,
  monthLabel,
  summary,
}: {
  locationName: string;
  monthLabel: string;
  summary: MonthSummary;
}) {
  const riskMeta = summary.highestRiskDay
    ? HISTORICAL_STATUS_META[summary.highestRiskDay.status]
    : null;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-primary" aria-hidden />
          {locationName}
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {monthLabel} summary
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatTile
          label="Total rainfall"
          value={`${summary.totalRainfallMm}`}
          sub="mm · observed"
          icon={CloudRain}
          delay={0.02}
        />
        <StatTile
          label="Rainy days"
          value={`${summary.rainyDays}`}
          sub="≥ 1 mm"
          icon={Droplets}
          delay={0.05}
        />
        <StatTile
          label="Waterlogging days"
          value={`${summary.waterloggingDays}`}
          sub="incl. severe"
          icon={Waves}
          valueColor={summary.waterloggingDays > 0 ? HISTORICAL_STATUS_META.waterlogging.color : undefined}
          delay={0.08}
        />
        <StatTile
          label="Severe days"
          value={`${summary.severeDays}`}
          sub="flood-level"
          icon={AlertTriangle}
          valueColor={summary.severeDays > 0 ? HISTORICAL_STATUS_META.severe.color : undefined}
          delay={0.11}
        />
        <StatTile
          label="Waterlogged for"
          value={`${summary.estimatedDurationHours}`}
          sub="hours total"
          icon={Clock}
          tag={<EstimateTag />}
          delay={0.14}
        />
        <StatTile
          label="Highest rainfall"
          value={
            summary.highestRainfall
              ? `${summary.highestRainfall.mm} mm`
              : "—"
          }
          sub={
            summary.highestRainfall
              ? monthLabel.split(" ")[0].slice(0, 3) +
                " " +
                summary.highestRainfall.day
              : "no rainfall"
          }
          icon={TrendingUp}
          delay={0.17}
        />
        <StatTile
          label="Highest-risk day"
          value={
            summary.highestRiskDay
              ? `${monthLabel.split(" ")[0].slice(0, 3)} ${summary.highestRiskDay.day}`
              : "—"
          }
          sub={riskMeta ? riskMeta.label : "calm month"}
          icon={Flag}
          valueColor={riskMeta ? riskMeta.color : undefined}
          delay={0.2}
        />
      </div>
    </div>
  );
}
