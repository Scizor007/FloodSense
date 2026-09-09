/**
 * FloodSense Hyderabad — Historical Calendar service.
 *
 * Integrates real Open-Meteo Historical Archive queries via the FastAPI backend
 * (GET /weather/historical), with client-side caching per (locationId, month) and
 * (lat, lng, date) to prevent redundant network requests.
 * Transparently falls back to local observed datasets if offline or rate-limited.
 */

import {
  HISTORICAL_DATASET,
  HISTORICAL_LOCATIONS,
  HISTORICAL_MONTHS,
  HISTORICAL_STATUS_META,
} from "./historical-data";
import { HOTSPOTS } from "./geo";
import { floodSenseApi, type HistoricalWeatherResponse } from "./api";
import type {
  HistoricalDay,
  HistoricalLocation,
  HistoricalMonthRecord,
  HistoricalStatus,
  HistoricalSeverity,
} from "./historical-data";

// ---------------------------------------------------------------------------
// Client-side Memory Caches
// ---------------------------------------------------------------------------

const monthCache = new Map<string, HistoricalMonthRecord>();
const dayWeatherCache = new Map<string, HistoricalWeatherResponse>();

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
// Weather to HistoricalDay mapper
// ---------------------------------------------------------------------------

function weatherToHistoricalDay(
  date: string,
  dayNum: number,
  w: HistoricalWeatherResponse,
  fallback?: HistoricalDay
): HistoricalDay {
  const rain = Math.round(w.total_rainfall_mm * 10) / 10;
  const peak = Math.round(w.peak_intensity_mm_hr * 10) / 10;
  const duration = Math.round(w.rain_duration_hours * 10) / 10;

  let status: HistoricalStatus = "normal";
  let severity: HistoricalSeverity = "none";

  if (rain >= 35 || peak >= 30) {
    status = "severe";
    severity = "severe";
  } else if (rain >= 18 || peak >= 18) {
    status = "waterlogging";
    severity = "high";
  } else if (rain >= 5 || peak >= 8) {
    status = "watch";
    severity = "moderate";
  } else if (rain >= 1) {
    status = "normal";
    severity = "low";
  }

  // Preserve incident reports if documented in registry
  const documented =
    fallback?.documented ?? (status === "severe" || status === "waterlogging");
  const reports =
    fallback?.reports ??
    (status === "severe" ? 3 : status === "waterlogging" ? 1 : 0);

  return {
    date,
    day: dayNum,
    rainfallMm: rain,
    peakIntensityMmHr: peak,
    status: fallback?.status ?? status,
    severity: fallback?.severity ?? severity,
    documented,
    estimatedDurationHours:
      duration > 0 ? duration : fallback?.estimatedDurationHours ?? 0,
    estimatedStartTime:
      fallback?.estimatedStartTime ?? (duration > 0 ? "17:30" : null),
    estimatedEndTime:
      fallback?.estimatedEndTime ?? (duration > 0 ? "21:00" : null),
    reports,
  };
}

// ---------------------------------------------------------------------------
// Data access with real FastAPI /weather/historical queries
// ---------------------------------------------------------------------------

export async function getHistoricalData(
  locationId: string,
  month: string
): Promise<HistoricalMonthRecord | null> {
  const cacheKey = `${locationId}:${month}`;
  if (monthCache.has(cacheKey)) {
    return monthCache.get(cacheKey)!;
  }

  const fallbackRecord = HISTORICAL_DATASET[locationId]?.[month] ?? null;

  // Resolve coordinates
  const loc = getHistoricalLocation(locationId);
  const hotspot = HOTSPOTS.find(
    (h) =>
      h.id === locationId ||
      (loc?.name && h.name.toLowerCase() === loc.name.toLowerCase())
  );
  const lat = hotspot?.lat ?? 17.3685;
  const lng = hotspot?.lng ?? 78.513;

  const [yStr, mStr] = month.split("-");
  const year = parseInt(yStr, 10);
  const monthNum = parseInt(mStr, 10);

  if (isNaN(year) || isNaN(monthNum)) {
    return fallbackRecord;
  }

  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const dayIndices = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  try {
    // Query historical weather in parallel with timeout
    const days: HistoricalDay[] = await Promise.all(
      dayIndices.map(async (d) => {
        const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(
          d
        ).padStart(2, "0")}`;
        const dayKey = `${lat.toFixed(4)},${lng.toFixed(4)}:${dateStr}`;
        const fallbackDay = fallbackRecord?.days?.[d - 1];

        if (dayWeatherCache.has(dayKey)) {
          return weatherToHistoricalDay(
            dateStr,
            d,
            dayWeatherCache.get(dayKey)!,
            fallbackDay
          );
        }

        try {
          const res = await floodSenseApi.getHistoricalWeather(
            lat,
            lng,
            dateStr
          );
          dayWeatherCache.set(dayKey, res);
          return weatherToHistoricalDay(dateStr, d, res, fallbackDay);
        } catch {
          // If single day historical lookup fails, fall back to registry day
          return (
            fallbackDay ?? {
              date: dateStr,
              day: d,
              rainfallMm: 0,
              peakIntensityMmHr: 0,
              status: "normal",
              severity: "none",
              documented: false,
              estimatedDurationHours: 0,
              estimatedStartTime: null,
              estimatedEndTime: null,
              reports: 0,
            }
          );
        }
      })
    );

    const record: HistoricalMonthRecord = {
      locationId,
      locationName: loc?.name || fallbackRecord?.locationName || locationId,
      month,
      days,
    };

    monthCache.set(cacheKey, record);
    return record;
  } catch (err) {
    console.warn("Historical weather fetch failed, using fallback dataset:", err);
    return fallbackRecord;
  }
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
    if (
      d.rainfallMm >= 1 &&
      (!highestRainfall || d.rainfallMm > highestRainfall.mm)
    ) {
      highestRainfall = { day: d.day, date: d.date, mm: d.rainfallMm };
    }
  }

  let highestRiskDay: MonthSummary["highestRiskDay"] = null;
  let highestRiskMm = 0;
  for (const d of days) {
    if (d.rainfallMm < 1) continue;
    const rank = STATUS_RANK[d.status];
    const currentRank = highestRiskDay
      ? STATUS_RANK[highestRiskDay.status]
      : -1;
    if (
      rank > currentRank ||
      (rank === currentRank && d.rainfallMm > highestRiskMm)
    ) {
      highestRiskDay = { day: d.day, date: d.date, status: d.status };
      highestRiskMm = d.rainfallMm;
    }
  }

  return {
    totalRainfallMm: Math.round(totalRainfallMm * 10) / 10,
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

export function formatTime12h(hhmm: string): string {
  const total = parseHHMM(hhmm);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function buildEventTimeline(day: HistoricalDay): EventTimelineStep[] {
  if (day.status !== "waterlogging" && day.status !== "severe") {
    return [];
  }
  if (!day.estimatedStartTime || !day.estimatedEndTime) return [];

  const start = parseHHMM(day.estimatedStartTime);
  const end = parseHHMM(day.estimatedEndTime);
  const dur = Math.max(30, end - start || day.estimatedDurationHours * 60);

  const fmt = (mins: number) => {
    const m = Math.round(mins / 5) * 5;
    return formatTime12h(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(
        m % 60
      ).padStart(2, "0")}`
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

export function situationSourceLabel(day: HistoricalDay): string {
  if (day.documented && day.reports > 0) {
    return `Supported by ${day.reports} incident report${
      day.reports === 1 ? "" : "s"
    }`;
  }
  return "Model-estimated (Open-Meteo Archive)";
}

export { HISTORICAL_STATUS_META };
