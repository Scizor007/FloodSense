"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { RISK_META } from "@/lib/flood/types";
import type { RiskLevel } from "@/lib/flood/types";

export function RiskBadge({
  level,
  size = "md",
  withDot = true,
}: {
  level: RiskLevel;
  size?: "sm" | "md";
  withDot?: boolean;
}) {
  const meta = RISK_META[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      )}
      style={{
        color: meta.color,
        borderColor: `${meta.color}55`,
        background: `${meta.color}14`,
      }}
    >
      {withDot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }}
        />
      )}
      {meta.label}
    </span>
  );
}

export function RiskGauge({
  score,
  level,
  size = 92,
}: {
  score: number;
  level: RiskLevel;
  size?: number;
}) {
  const meta = RISK_META[level];
  const r = 38;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e7dff5" strokeWidth="9" />
        <motion.circle
          cx="50" cy="50" r={r}
          fill="none"
          stroke={meta.color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
          style={{ filter: `drop-shadow(0 0 6px ${meta.color}90)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-bold tabular-nums">{score}</span>
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground">risk</span>
      </div>
    </div>
  );
}

export function SeverityBar({ level }: { level: RiskLevel }) {
  const idx = ["low", "moderate", "high", "severe"].indexOf(level);
  return (
    <div className="flex gap-1" aria-label={`severity ${level}`}>
      {["low", "moderate", "high", "severe"].map((l, i) => (
        <span
          key={l}
          className="h-1.5 flex-1 rounded-full"
          style={{
            background: i <= idx ? RISK_META[l as RiskLevel].color : "#e7dff5",
          }}
        />
      ))}
    </div>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  desc,
  right,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary/90">
          {eyebrow}
        </p>
        <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight text-foreground md:text-[28px]">
          {title}
        </h1>
        {desc && <p className="mt-1.5 max-w-2xl text-[16px] leading-[1.65] text-muted-foreground">{desc}</p>}
      </div>
      {right}
    </div>
  );
}
