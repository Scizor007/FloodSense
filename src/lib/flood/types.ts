/** FloodSense Hyderabad — core domain types.
 *  Structured for a clean swap to live API payloads later. */

export type View =
  | "landing"
  | "map"
  | "around"
  | "historical"
  | "report"
  | "feed"
  | "alerts";

export type RiskLevel = "low" | "moderate" | "high" | "severe";

export interface Hotspot {
  id: string;
  name: string;
  ward: string;
  lat: number;
  lng: number;
  /** long-term baseline waterlogging propensity (0-100) */
  baseRisk: number;
  /** drainage/nala vulnerability multiplier (0-1) */
  vulnerability: number;
  cause: string;
  affectedRoads: string[];
  /** community reports in the last 24h */
  reports24h: number;
  lastVerified: string;
}

export interface HotspotLive extends Hotspot {
  /** current predicted risk score (0-100) after simulation */
  riskScore: number;
  severity: RiskLevel;
}

export type ReportSeverity = "ankle" | "knee" | "impassable";
export type ReportStatus = "pending" | "verified" | "resolved";

export interface FloodReport {
  id: string;
  hotspotId?: string;
  location: string;
  lat: number;
  lng: number;
  severity: ReportSeverity;
  note?: string;
  photo?: string;
  timestamp: number;
  status: ReportStatus;
  upvotes: number;
  source: "community" | "you";
  aiConfidence?: number;
  waterDepthLabel?: string;
  verifiedBy?: string;
}

export type AlertLevel = "severe" | "high" | "moderate" | "info";

export interface FloodAlert {
  id: string;
  hotspotId?: string;
  title: string;
  message: string;
  level: AlertLevel;
  channel: "SMS" | "WhatsApp" | "Push";
  timestamp: number;
  read: boolean;
  routeHint?: string;
}

export interface Locality {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface RainfallScenario {
  intensity: number; // mm/hr
  durationHours: number;
  ranAt?: number;
}

export const RISK_ORDER: RiskLevel[] = ["low", "moderate", "high", "severe"];

export const RISK_META: Record<
  RiskLevel,
  { label: string; color: string; textClass: string }
> = {
  low: { label: "Low", color: "#16a34a", textClass: "text-risk-low" },
  moderate: { label: "Moderate", color: "#ca8a04", textClass: "text-risk-moderate" },
  high: { label: "High", color: "#ea580c", textClass: "text-risk-high" },
  severe: { label: "Severe", color: "#dc2626", textClass: "text-risk-severe" },
};

export const REPORT_SEVERITY_META: Record<
  ReportSeverity,
  { label: string; color: string }
> = {
  ankle: { label: "Ankle-deep", color: "#ca8a04" },
  knee: { label: "Knee-deep", color: "#ea580c" },
  impassable: { label: "Impassable", color: "#dc2626" },
};

export const ALERT_META: Record<AlertLevel, { color: string; label: string }> = {
  severe: { color: "#dc2626", label: "Severe" },
  high: { color: "#ea580c", label: "High" },
  moderate: { color: "#ca8a04", label: "Moderate" },
  info: { color: "#0891b2", label: "Info" },
};
