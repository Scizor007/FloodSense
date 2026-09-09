/** FloodSense Hyderabad — Historical Flood Calendar dataset (frontend prototype).
 *
 *  Structure mirrors what a future `GET /historical/{locationId}?month=YYYY-MM`
 *  endpoint will return, so the mock can be swapped without touching the UI.
 *
 *  Locations reuse the centralised hotspot registry in ./geo (no duplicated
 *  geo data). The three extra requested locations (Moosapet, Amberpet,
 *  Bahadurpura) are historical-analysis locations only — the live map is
 *  untouched.
 *
 *  Data honesty contract (see historical-service.ts + UI labels):
 *    - rainfallMm / peakIntensityMmHr  -> observed (weather dataset)
 *    - documented + reports            -> observed incident records
 *    - estimatedDurationHours / start / end -> model-estimated unless the
 *      day is marked documented, in which case they are anchored to reports.
 */

import { HOTSPOTS } from "./geo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HistoricalStatus = "normal" | "watch" | "waterlogging" | "severe";
export type HistoricalSeverity = "none" | "low" | "moderate" | "high" | "severe";

export interface HistoricalLocation {
  id: string;
  name: string;
  ward: string;
  /** long-term baseline waterlogging propensity (0-100), shared with map */
  baseRisk: number;
  /** drainage/nala vulnerability multiplier (0-1), shared with map */
  vulnerability: number;
  cause: string;
  affectedRoads: string[];
}

export interface HistoricalDay {
  /** ISO date, e.g. "2025-08-12" */
  date: string;
  day: number;
  /** observed daily rainfall (mm) */
  rainfallMm: number;
  /** observed peak rain intensity (mm/hr) */
  peakIntensityMmHr: number;
  status: HistoricalStatus;
  severity: HistoricalSeverity;
  /** true when a documented flood/waterlogging incident record exists */
  documented: boolean;
  /** model-estimated waterlogging duration in hours (0 when none) */
  estimatedDurationHours: number;
  /** model-estimated waterlogging window start, "HH:MM" 24h (null when none) */
  estimatedStartTime: string | null;
  estimatedEndTime: string | null;
  /** documented citizen/authority incident reports for this day */
  reports: number;
}

export interface HistoricalMonthRecord {
  locationId: string;
  locationName: string;
  month: string; // "2025-08"
  days: HistoricalDay[];
}

export const HISTORICAL_STATUS_META: Record<
  HistoricalStatus,
  { label: string; short: string; color: string }
> = {
  normal: { label: "Normal", short: "Normal", color: "#16a34a" },
  watch: { label: "Rainfall / Watch", short: "Rainfall", color: "#ca8a04" },
  waterlogging: {
    label: "Waterlogging",
    short: "Waterlogging",
    color: "#ea580c",
  },
  severe: {
    label: "Severe Waterlogging / Flooding",
    short: "Severe",
    color: "#dc2626",
  },
};

// ---------------------------------------------------------------------------
// Location directory — 15 map hotspots (reused) + 3 requested extras
// ---------------------------------------------------------------------------

/** Short display names for hotspot-derived locations. */
const SHORT_NAMES: Record<string, string> = {
  "hs-moosarambagh": "Moosarambagh",
  "hs-malakpet": "Malakpet",
  "hs-chaderghat": "Chaderghat",
  "hs-tolichowki": "Tolichowki",
  "hs-alwal": "Alwal",
  "hs-lbnagar": "LB Nagar",
  "hs-uppal": "Uppal",
  "hs-attapur": "Attapur",
  "hs-musheerabad": "Musheerabad",
  "hs-kothi": "Kothi",
  "hs-begumpet": "Begumpet",
  "hs-nizampet": "Nizampet",
  "hs-madhapur": "Durgam Cheruvu",
  "hs-gachibowli": "Gachibowli",
  "hs-yapral": "Yapral",
};

/** Requested historical locations that are not live-map hotspots. */
const EXTRA_LOCATIONS: HistoricalLocation[] = [
  {
    id: "hst-moosapet",
    name: "Moosapet",
    ward: "Kukatpally",
    baseRisk: 63,
    vulnerability: 0.74,
    cause: "Balanagar nala crossing — low-lying industrial belt with undersized stormwater drains",
    affectedRoads: ["Moosapet–Balanagar Rd", "NH-44 service rd", "Furniture Market Rd"],
  },
  {
    id: "hst-amberpet",
    name: "Amberpet",
    ward: "Amberpet",
    baseRisk: 60,
    vulnerability: 0.78,
    cause: "Musi-adjacent low ground — drain backflow from the Vengal Rao nala",
    affectedRoads: ["Amberpet Main Rd", "Old Malakpet–Amberpet Rd", "Musi bund rd"],
  },
  {
    id: "hst-bahadurpura",
    name: "Bahadurpura",
    ward: "Bahadurpura",
    baseRisk: 57,
    vulnerability: 0.72,
    cause: "Old City nala congestion — Talab Katta spill onto the arterial road",
    affectedRoads: ["Bahadurpura Rd", "NH-44 Old City stretch", "Kishan Bagh Rd"],
  },
];

/** All locations with historical profiles, most flood-prone first. */
export const HISTORICAL_LOCATIONS: HistoricalLocation[] = [
  ...HOTSPOTS.map((h) => ({
    id: h.id,
    name: SHORT_NAMES[h.id] ?? h.name,
    ward: h.ward,
    baseRisk: h.baseRisk,
    vulnerability: h.vulnerability,
    cause: h.cause,
    affectedRoads: h.affectedRoads,
  })),
  ...EXTRA_LOCATIONS,
].sort((a, b) => b.baseRisk - a.baseRisk);

// ---------------------------------------------------------------------------
// Monsoon 2025 month scenarios
// ---------------------------------------------------------------------------

export const HISTORICAL_MONTHS: { id: string; label: string }[] = [
  { id: "2025-05", label: "May 2025" },
  { id: "2025-06", label: "June 2025" },
  { id: "2025-07", label: "July 2025" },
  { id: "2025-08", label: "August 2025" },
  { id: "2025-09", label: "September 2025" },
];

/** Per-month monsoon character: how many rainy days and how heavy. */
const MONTH_SCENARIOS: Record<
  string,
  { minRainy: number; maxRainy: number; minMm: number; maxMm: number }
> = {
  "2025-05": { minRainy: 1, maxRainy: 3, minMm: 2, maxMm: 14 }, // pre-monsoon, dry
  "2025-06": { minRainy: 4, maxRainy: 8, minMm: 3, maxMm: 28 }, // onset
  "2025-07": { minRainy: 7, maxRainy: 11, minMm: 4, maxMm: 44 }, // moderate
  "2025-08": { minRainy: 10, maxRainy: 14, minMm: 5, maxMm: 64 }, // peak monsoon
  "2025-09": { minRainy: 5, maxRainy: 9, minMm: 3, maxMm: 40 }, // tapering
};

// ---------------------------------------------------------------------------
// Deterministic seeded RNG (SSR-safe — same values on server & client)
// ---------------------------------------------------------------------------

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Hand-crafted months (demo heroes — exact curated numbers)
// ---------------------------------------------------------------------------

interface HandEvent {
  level: "waterlogging" | "severe";
  documented: boolean;
  duration: number; // hours
  start: string; // "20:30"
  end: string; // "23:00"
  reports: number;
}

interface HandMonth {
  /** day -> [rainfallMm, peakIntensityMmHr] */
  rain: Record<number, [number, number]>;
  events: Record<number, HandEvent>;
}

const HAND_CRAFTED: Record<string, Record<string, HandMonth>> = {
  // Moosapet, August 2025 — the guided-demo month.
  // 286 mm total · 11 rainy days · 4 waterlogging days (2 severe) · ~8.5 h
  "hst-moosapet": {
    "2025-08": {
      rain: {
        2: [12, 7],
        5: [6, 3],
        8: [18, 11],
        11: [24, 16],
        12: [61, 38],
        15: [28, 22],
        19: [9, 5],
        21: [38, 27],
        24: [42, 12],
        27: [33, 18],
        29: [15, 9],
      },
      events: {
        11: {
          level: "waterlogging",
          documented: false,
          duration: 1.5,
          start: "18:15",
          end: "19:45",
          reports: 0,
        },
        12: {
          level: "severe",
          documented: true,
          duration: 2.5,
          start: "20:30",
          end: "23:00",
          reports: 3,
        },
        15: {
          level: "waterlogging",
          documented: false,
          duration: 2.0,
          start: "17:45",
          end: "19:45",
          reports: 0,
        },
        21: {
          level: "severe",
          documented: true,
          duration: 2.5,
          start: "19:00",
          end: "21:30",
          reports: 2,
        },
      },
    },
  },
  // Tolichowki, August 2025 — different rhythm: fewer rainy days, one deep severe event.
  // 198 mm · 8 rainy days · 3 waterlogging days (1 severe) · ~6.8 h
  "hs-tolichowki": {
    "2025-08": {
      rain: {
        3: [8, 4],
        7: [15, 9],
        12: [26, 18],
        14: [19, 12],
        19: [54, 36],
        22: [31, 24],
        26: [11, 6],
        30: [34, 14],
      },
      events: {
        12: {
          level: "waterlogging",
          documented: false,
          duration: 1.8,
          start: "18:30",
          end: "20:15",
          reports: 0,
        },
        19: {
          level: "severe",
          documented: true,
          duration: 3.0,
          start: "16:45",
          end: "19:45",
          reports: 4,
        },
        22: {
          level: "waterlogging",
          documented: true,
          duration: 2.0,
          start: "20:00",
          end: "22:00",
          reports: 2,
        },
      },
    },
  },
  // Moosarambagh, August 2025 — the city's most flood-prone bridge.
  // 295 mm · 11 rainy days · 4 waterlogging days (2 severe) · ~9.2 h
  "hs-moosarambagh": {
    "2025-08": {
      rain: {
        1: [14, 8],
        4: [9, 5],
        6: [37, 26],
        9: [21, 14],
        13: [58, 41],
        16: [26, 17],
        20: [47, 33],
        23: [7, 4],
        25: [29, 20],
        28: [35, 25],
        31: [12, 7],
      },
      events: {
        6: {
          level: "waterlogging",
          documented: true,
          duration: 1.8,
          start: "17:40",
          end: "19:30",
          reports: 2,
        },
        13: {
          level: "severe",
          documented: true,
          duration: 3.2,
          start: "18:45",
          end: "22:00",
          reports: 5,
        },
        20: {
          level: "severe",
          documented: false,
          duration: 2.6,
          start: "19:20",
          end: "22:00",
          reports: 0,
        },
        25: {
          level: "waterlogging",
          documented: false,
          duration: 1.6,
          start: "16:50",
          end: "18:30",
          reports: 0,
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Month builder
// ---------------------------------------------------------------------------

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function isoDate(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** Waterlogging rain threshold shrinks as the location gets more vulnerable. */
function rainThreshold(vulnerability: number): number {
  return Math.round(30 - vulnerability * 12);
}

function severityFor(
  status: HistoricalStatus,
  mm: number,
  durationHours: number
): HistoricalSeverity {
  switch (status) {
    case "severe":
      return "severe";
    case "waterlogging":
      return durationHours >= 2.2 ? "high" : "moderate";
    case "watch":
      return mm >= 25 ? "moderate" : "low";
    default:
      return "none";
  }
}

function minutesToHHMM(total: number): string {
  const m = ((Math.round(total / 5) * 5) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Build one month for one location from the seeded generator. */
function generateMonth(
  loc: HistoricalLocation,
  month: string
): HistoricalMonthRecord {
  const nDays = daysInMonth(month);
  const scenario = MONTH_SCENARIOS[month];
  const rng = mulberry32(hashSeed(`${loc.id}:${month}`));

  // --- rainy days -----------------------------------------------------------
  const rainyCount =
    scenario.minRainy +
    Math.floor(rng() * (scenario.maxRainy - scenario.minRainy + 1));
  const rainyDays = new Set<number>();
  while (rainyDays.size < rainyCount) {
    rainyDays.add(1 + Math.floor(rng() * nDays));
  }
  const sortedDays = [...rainyDays].sort((a, b) => a - b);

  // --- rainfall amounts: monsoon profile (1-2 heavy spells, many light days).
  // profile[0] is the heaviest; it is shuffled before assignment so heavy
  // spells land on random dates, not biased to the start of the month.
  const profile: number[] = [];
  for (let i = 0; i < rainyCount; i++) {
    let mm: number;
    if (i === 0) mm = scenario.maxMm * (0.66 + 0.34 * rng());
    else if (i === 1) mm = scenario.maxMm * (0.42 + 0.22 * rng());
    else if (i === 2) mm = scenario.maxMm * (0.28 + 0.18 * rng());
    else
      mm =
        scenario.minMm +
        Math.max(0, scenario.maxMm * 0.25 - scenario.minMm) *
          Math.pow(rng(), 1.6);
    profile.push(Math.max(scenario.minMm, Math.round(mm)));
  }
  for (let i = profile.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [profile[i], profile[j]] = [profile[j], profile[i]];
  }
  const rainByDay = new Map<number, { mm: number; peak: number }>();
  sortedDays.forEach((d, i) => {
    const mm = profile[i] ?? scenario.minMm;
    const peak = Math.max(2, Math.round(mm * (0.25 + rng() * 0.45)));
    rainByDay.set(d, { mm, peak });
  });

  // --- flood events (rule-based, threshold driven by vulnerability) --------
  const t = rainThreshold(loc.vulnerability);
  const severeCap = t + 14;
  const eventDays: number[] = [];
  rainByDay.forEach((r, d) => {
    if (r.mm >= t && r.peak >= 10) eventDays.push(d);
  });
  const rankedEvents = eventDays
    .map((d) => ({ d, mm: rainByDay.get(d)!.mm, peak: rainByDay.get(d)!.peak }))
    .sort((a, b) => b.mm - a.mm);

  const eventMeta = new Map<
    number,
    { severe: boolean; documented: boolean; duration: number; start: number; reports: number }
  >();
  rankedEvents.forEach((e, rank) => {
    // severe needs a genuinely heavy spell AND a sharp peak AND a vulnerable site
    const severe =
      e.mm >= severeCap && e.peak >= 24 && loc.vulnerability >= 0.6;
    const duration = severe
      ? Math.round((2.2 + rng() * 1.3) * 10) / 10
      : Math.round((0.9 + rng() * 1.3) * 10) / 10;
    // Hyderabad convective peaks skew late afternoon / evening
    const evening = rng() < 0.75;
    const hour = evening
      ? [16, 17, 17, 18, 18, 19, 19, 20, 20, 21][Math.floor(rng() * 10)]
      : [8, 9, 9, 10, 11][Math.floor(rng() * 5)];
    const start = hour * 60 + Math.floor(rng() * 12) * 5;
    // largest 1-2 events per month carry documented incident reports
    const documented =
      rank === 0 || (rank === 1 && rng() < 0.55) || (severe && rng() < 0.4);
    const reports = documented ? 1 + Math.floor(rng() * 4) : 0;
    eventMeta.set(e.d, { severe, documented, duration, start, reports });
  });

  // --- assemble days ---------------------------------------------------------
  const days: HistoricalDay[] = [];
  for (let d = 1; d <= nDays; d++) {
    const r = rainByDay.get(d);
    const mm = r?.mm ?? 0;
    const peak = r?.peak ?? 0;
    const ev = eventMeta.get(d);
    const status: HistoricalStatus = ev
      ? ev.severe
        ? "severe"
        : "waterlogging"
      : mm >= 10
        ? "watch"
        : "normal";
    const duration = ev ? ev.duration : 0;
    days.push({
      date: isoDate(month, d),
      day: d,
      rainfallMm: mm,
      peakIntensityMmHr: peak,
      status,
      severity: severityFor(status, mm, duration),
      documented: ev ? ev.documented : false,
      estimatedDurationHours: duration,
      estimatedStartTime: ev ? minutesToHHMM(ev.start) : null,
      estimatedEndTime: ev ? minutesToHHMM(ev.start + duration * 60) : null,
      reports: ev ? ev.reports : 0,
    });
  }
  return {
    locationId: loc.id,
    locationName: loc.name,
    month,
    days,
  };
}

/** Expand a hand-crafted month spec into full day records. */
function expandHandMonth(
  loc: HistoricalLocation,
  month: string,
  spec: HandMonth
): HistoricalMonthRecord {
  const nDays = daysInMonth(month);
  const days: HistoricalDay[] = [];
  for (let d = 1; d <= nDays; d++) {
    const rain = spec.rain[d] ?? [0, 0];
    const ev = spec.events[d];
    const status: HistoricalStatus = ev
      ? ev.level
      : rain[0] >= 10
        ? "watch"
        : "normal";
    days.push({
      date: isoDate(month, d),
      day: d,
      rainfallMm: rain[0],
      peakIntensityMmHr: rain[1],
      status,
      severity: severityFor(status, rain[0], ev?.duration ?? 0),
      documented: ev ? ev.documented : false,
      estimatedDurationHours: ev ? ev.duration : 0,
      estimatedStartTime: ev ? ev.start : null,
      estimatedEndTime: ev ? ev.end : null,
      reports: ev ? ev.reports : 0,
    });
  }
  return { locationId: loc.id, locationName: loc.name, month, days };
}

// ---------------------------------------------------------------------------
// Dataset (built once at module load — deterministic & SSR-safe)
// ---------------------------------------------------------------------------

function buildDataset(): Record<string, Record<string, HistoricalMonthRecord>> {
  const ds: Record<string, Record<string, HistoricalMonthRecord>> = {};
  for (const loc of HISTORICAL_LOCATIONS) {
    ds[loc.id] = {};
    for (const m of HISTORICAL_MONTHS) {
      const hand = HAND_CRAFTED[loc.id]?.[m.id];
      ds[loc.id][m.id] = hand
        ? expandHandMonth(loc, m.id, hand)
        : generateMonth(loc, m.id);
    }
  }
  return ds;
}

export const HISTORICAL_DATASET = buildDataset();

/** The month the guided demo opens on. */
export const DEFAULT_HISTORICAL_MONTH = "2025-08";
export const DEFAULT_HISTORICAL_LOCATION_ID = "hst-moosapet";
