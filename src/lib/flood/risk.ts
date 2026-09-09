import { HOTSPOTS } from "./geo";
import type { HotspotLive, RiskLevel, RainfallScenario } from "./types";

export function severityFromScore(score: number): RiskLevel {
  if (score >= 75) return "severe";
  if (score >= 55) return "high";
  if (score >= 35) return "moderate";
  return "low";
}

/**
 * Mock hydrology-inspired prediction model.
 * In production this is replaced by the backend model call
 * (IMD radar + drain network graph + terrain).
 */
export function predictRisk(
  baseRisk: number,
  vulnerability: number,
  rainfall: number, // mm/hr
  durationHours: number
): number {
  if (rainfall <= 0) return Math.round(baseRisk);
  const rainFactor = Math.min(rainfall / 60, 1.35); // saturates around 80 mm/hr
  const durationBoost = Math.min(durationHours * 3.2, 16);
  const soilMoisture = Math.min(durationHours * 1.4, 9);
  const raw =
    baseRisk +
    vulnerability * (rainFactor * 46) +
    durationBoost +
    soilMoisture -
    (baseRisk > 70 ? 2 : 6); // saturation correction
  return Math.round(Math.max(4, Math.min(97, raw)));
}

export function applyScenario(scenario: RainfallScenario): HotspotLive[] {
  return HOTSPOTS.map((h) => {
    const score = predictRisk(
      h.baseRisk,
      h.vulnerability,
      scenario.intensity,
      scenario.durationHours
    );
    return { ...h, riskScore: score, severity: severityFromScore(score) };
  });
}

/** Current-live hotspot list (baseline scenario). */
export function baselineLive(): HotspotLive[] {
  return applyScenario({ intensity: 0, durationHours: 0 });
}

/** Simulated model latency / log lines for the "Run Prediction" theatre. */
export const MODEL_LOG_LINES = [
  "Reading rainfall radar…",
  "Loading drain network…",
  "Terrain + nala flow accumulation…",
  "Scoring 25 monitored hotspots…",
  "Cross-checking live community reports…",
];

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return "1 hr ago";
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
