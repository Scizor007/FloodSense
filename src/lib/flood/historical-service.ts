/** FloodSense Hyderabad — Historical Calendar service.
 *
 *  Frontend-only prototype: every function resolves against the local mock
 *  dataset. The signatures are async-shaped so the backend swap is a
 *  one-function change:
 *
 *    getHistoricalData(locationId, month)
 *      -> GET /historical/{locationId}?month=2025-08
 *
 *  No network calls are made in this phase.
 */

import {
  HISTORICAL_DATASET,
  HISTORICAL_LOCATIONS,
  HISTORICAL_MONTHS,
  HISTORICAL_STATUS_META,
} from "./historical-data";
import type {
  HistoricalDay,
  HistoricalLocation,
  HistoricalMonthRecord,
  HistoricalStatus,
} from "./historical-data";

// ---------------------------------------------------------------------------
// Summary + timeline types
// ---------------------------------------------------------------------------

export interface MonthSummary {
  totalRainfallMm: number;
  rainyDays: number;
  waterloggingDays: number;
  severeDays: number;
  estimatedDurationHours: number;
  highestRainfall: { day: number; date: string; mm: number } | null;
  highestRiskDay: { day: number; date: string; status: HistoricalStatus } | null;
}

export interface EventTimelineStep {
  /** "8:15 PM" */
  time: string;
  label: string;
  major: boolean;
}

const STATUS_RANK: Record<HistoricalStatus, number> = {
  normal: 0,
  watch: 1,
  waterlogging: 2,
  severe: 3,
};

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

export async function getHistoricalData(
  locationId: string,
  month: string
): Promise<HistoricalMonthRecord | null> {
  // FUTURE (backend integration):
  //   const res = await fetch(`/api/historical/${locationId}?month=${month}`);
  //   if (!res.ok) return null;
  //   return res.json();
  return HISTORICAL_DATASET[locationId]?.[month] ?? null;
}

export function getHistoricalLocation(
  locationId: string
): HistoricalLocation | undefined {
  return HISTORICAL_LOCATIONS.find((l) => l.id === locationId);
}

export function monthLabel(month: string): string {
  return HISTORICAL_MONTHS.find((m) => m.id === month)?.label ?? month;
}

export function monthIndex(month: string): number {
  return HISTORICAL_MONTHS.findIndex((m) => m.id === month);
}

// ---------------------------------------------------------------------------
// Month summary — powers HistoricalSummary
// ---------------------------------------------------------------------------

export function summarizeMonth(record: HistoricalMonthRecord): MonthSummary {
  const days = record.days;
  const totalRainfallMm = days.reduce((s, d) => s + d.rainfallMm, 0);
  const rainyDays = days.filter((d) => d.rainfallMm >= 1).length;
  const waterloggingDays = days.filter(
    (d) => d.status === "waterlogging" || d.status === "severe"
  ).length;
  const severeDays = days.filter((d) => d.status === "severe").length;
  const estimatedDurationHours =
    Math.round(days.reduce((s, d) => s + d.estimatedDurationHours, 0) * 10) /
    10;

  let highestRainfall: MonthSummary["highestRainfall"] = null;
  for (const d of days) {
    if (d.rainfallMm >= 1 && (!highestRainfall || d.rainfallMm > highestRainfall.mm)) {
      highestRainfall = { day: d.day, date: d.date, mm: d.rainfallMm };
    }
  }

  let highestRiskDay: MonthSummary["highestRiskDay"] = null;
  let highestRiskMm = 0;
  for (const d of days) {
    if (d.rainfallMm < 1) continue;
    const rank = STATUS_RANK[d.status];
    const currentRank = highestRiskDay ? STATUS_RANK[highestRiskDay.status] : -1;
    if (rank > currentRank || (rank === currentRank && d.rainfallMm > highestRiskMm)) {
      highestRiskDay = { day: d.day, date: d.date, status: d.status };
      highestRiskMm = d.rainfallMm;
    }
  }

  return {
    totalRainfallMm,
    rainyDays,
    waterloggingDays,
    severeDays,
    estimatedDurationHours,
    highestRainfall,
    highestRiskDay,
  };
}

// ---------------------------------------------------------------------------
// Day detail helpers — powers DayDetailsPanel + EventTimeline
// ---------------------------------------------------------------------------

/** "Why was this day high risk?" — derived from observed + location traits. */
export function getRiskFactors(
  day: HistoricalDay,
  location: HistoricalLocation
): string[] {
  const factors: string[] = [];
  if (day.rainfallMm >= 35) {
    factors.push(`Very heavy rainfall — ${day.rainfallMm} mm within 24 hours`);
  } else if (day.rainfallMm >= 20) {
    factors.push(`Heavy rainfall — ${day.rainfallMm} mm within 24 hours`);
  }
  if (day.peakIntensityMmHr >= 30) {
    factors.push(
      `Peak intensity ${day.peakIntensityMmHr} mm/hr — well above drain capacity`
    );
  } else if (day.peakIntensityMmHr >= 15) {
    factors.push(
      `Sustained high-intensity rain — ${day.peakIntensityMmHr} mm/hr peak`
    );
  }
  if (location.vulnerability >= 0.65) {
    factors.push("Low-lying terrain with limited drainage gradient");
  }
  if (location.baseRisk >= 55) {
    factors.push("Historical flood-prone location");
  }
  if (day.documented && day.reports > 0) {
    factors.push(`${day.reports} documented incident reports`);
  }
  return factors.slice(0, 4);
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "20:30" -> "8:30 PM" */
export function formatTime12h(hhmm: string): string {
  const total = parseHHMM(hhmm);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Model-estimated event progression for a waterlogging day. */
export function buildEventTimeline(day: HistoricalDay): EventTimelineStep[] {
  if (
    day.status !== "waterlogging" &&
    day.status !== "severe"
  ) {
    return [];
  }
  if (!day.estimatedStartTime || !day.estimatedEndTime) return [];

  const start = parseHHMM(day.estimatedStartTime);
  const end = parseHHMM(day.estimatedEndTime);
  const dur = Math.max(30, (end - start) || day.estimatedDurationHours * 60);

  const fmt = (mins: number) => {
    // round to the nearest 5 minutes — "9:35 PM", never "9:37.5 PM"
    const m = Math.round(mins / 5) * 5;
    return formatTime12h(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
    );
  };

  return [
    {
      time: fmt(start - 45),
      label: "Heavy rainfall begins",
      major: false,
    },
    {
      time: fmt(start - 15),
      label: `Rainfall intensity rises — ${day.peakIntensityMmHr} mm/hr peak`,
      major: false,
    },
    {
      time: fmt(start),
      label: "Waterlogging detected",
      major: true,
    },
    {
      time: fmt(start + dur * 0.45),
      label:
        day.status === "severe" ? "Severe waterlogging" : "Peak waterlogging",
      major: true,
    },
    {
      time: fmt(end),
      label: "Water recedes",
      major: false,
    },
  ];
}

/** Label describing how the flood situation on a day is known. */
export function situationSourceLabel(day: HistoricalDay): string {
  if (day.documented && day.reports > 0) {
    return `Supported by ${day.reports} incident report${day.reports === 1 ? "" : "s"}`;
  }
  return "Model-estimated";
}

export { HISTORICAL_STATUS_META };
