import { HOTSPOTS } from "./geo";
import { floodSenseApi } from "./api";
import type { HotspotLive, RiskLevel, RainfallScenario } from "./types";

export function severityFromScore(score: number): RiskLevel {
  if (score >= 75) return "severe";
  if (score >= 55) return "high";
  if (score >= 35) return "moderate";
  return "low";
}

/**
 * Local fallback prediction model based on hydrology formulas.
 * Used when offline or if the backend request fails.
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

/**
 * Real backend prediction call for a single coordinate using the
 * trained Random Forest ML + physics model via FastAPI.
 */
export async function predictRiskLive(
  lat: number,
  lng: number,
  rainfall: number,
  durationMinutes: number = 60,
  fallbackBaseRisk: number = 50,
  fallbackVulnerability: number = 0.7
): Promise<{ score: number; severity: RiskLevel; factors?: unknown }> {
  try {
    const res = await floodSenseApi.predictRisk({
      lat,
      lng,
      rainfall_intensity: rainfall,
      duration_minutes: durationMinutes,
    });
    const score = Math.round(res.risk_score);
    return {
      score,
      severity: severityFromScore(score),
      factors: res.contributing_factors,
    };
  } catch (err) {
    console.warn("Falling back to local hydrology formula:", err);
    const score = predictRisk(
      fallbackBaseRisk,
      fallbackVulnerability,
      rainfall,
      durationMinutes / 60
    );
    return {
      score,
      severity: severityFromScore(score),
    };
  }
}

/**
 * Sync local scenario application (immediate fallback).
 */
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

/**
 * Real backend scenario application across hotspots using POST /risk/predict
 * or POST /risk/predict-grid from the FastAPI server.
 */
export async function applyScenarioLive(
  scenario: RainfallScenario,
  hotspotsList: HotspotLive[] = HOTSPOTS.map((h) => ({
    ...h,
    riskScore: h.baseRisk,
    severity: severityFromScore(h.baseRisk),
  }))
): Promise<HotspotLive[]> {
  if (scenario.intensity <= 0) {
    return baselineLive();
  }

  const durationMins = Math.round(scenario.durationHours * 60) || 60;

  try {
    const updated = await Promise.all(
      hotspotsList.map(async (h) => {
        try {
          const res = await floodSenseApi.predictRisk({
            lat: h.lat,
            lng: h.lng,
            rainfall_intensity: scenario.intensity,
            duration_minutes: durationMins,
          });
          const score = Math.round(res.risk_score);
          return {
            ...h,
            riskScore: score,
            severity: severityFromScore(score),
          };
        } catch {
          const score = predictRisk(
            h.baseRisk,
            h.vulnerability,
            scenario.intensity,
            scenario.durationHours
          );
          return {
            ...h,
            riskScore: score,
            severity: severityFromScore(score),
          };
        }
      })
    );
    return updated;
  } catch {
    return applyScenario(scenario);
  }
}

/** Current-live hotspot list (baseline scenario). */
export function baselineLive(): HotspotLive[] {
  return applyScenario({ intensity: 0, durationHours: 0 });
}

/**
 * Model execution status messages. Kept minimal now that real backend
 * inference occurs with natural network latency.
 */
export const MODEL_LOG_LINES: string[] = [
  "Querying AI risk inference engine…",
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
