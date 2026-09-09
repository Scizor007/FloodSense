"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { baselineLive, applyScenario, severityFromScore, timeAgo } from "./risk";
import { HOTSPOTS } from "./geo";
import { MOCK_REPORTS, MOCK_ALERTS } from "./mock-data";
import { DEFAULT_HISTORICAL_LOCATION_ID } from "./historical-data";
import {
  floodSenseApi,
  type HotspotResponse,
  type ReportResponse,
  type AlertListItem,
} from "./api";
import type {
  View,
  HotspotLive,
  FloodReport,
  FloodAlert,
  RainfallScenario,
  ReportStatus,
  ReportSeverity,
  AlertLevel,
} from "./types";

interface FloodState {
  view: View;
  hotspots: HotspotLive[];
  scenario: RainfallScenario;
  predictionRanAt: number | null;
  selectedHotspotId: string | null;
  reports: FloodReport[];
  alerts: FloodAlert[];
  userLocalityId: string;
  lastSync: number;
  /** Historical Flood Calendar — selected location (months stay local) */
  historicalLocationId: string;

  // Backend sync status
  isBackendLive: boolean;
  isSyncing: boolean;
  apiError: string | null;

  setView: (v: View) => void;
  selectHotspot: (id: string | null) => void;
  openHistoricalLocation: (locationId: string) => void;
  runPrediction: (scenario: RainfallScenario) => HotspotLive[];
  runPredictionLive: (scenario: RainfallScenario) => Promise<HotspotLive[]>;
  resetScenario: () => void;
  addReport: (r: FloodReport) => void;
  setReportStatus: (id: string, status: ReportStatus) => void;
  upvoteReport: (id: string) => void;
  markAlertsRead: () => void;
  setUserLocality: (id: string) => void;
  resetDemo: () => void;

  // Async API actions
  fetchInitialData: () => Promise<void>;
  refreshHotspots: () => Promise<void>;
  refreshReports: () => Promise<void>;
  refreshAlerts: () => Promise<void>;
}

const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// Backend Mappers
// ---------------------------------------------------------------------------

export function mapBackendHotspot(b: HotspotResponse): HotspotLive {
  const staticH = HOTSPOTS.find(
    (h) =>
      h.id === b.id ||
      h.name.toLowerCase() === b.name.toLowerCase() ||
      (Math.abs(h.lat - b.lat) < 0.005 && Math.abs(h.lng - b.lng) < 0.005)
  );

  const score = Math.round(b.current_risk_score ?? staticH?.baseRisk ?? 50);
  return {
    id: b.id,
    name: b.name,
    ward: staticH?.ward || "Hyderabad Central",
    lat: b.lat,
    lng: b.lng,
    baseRisk: staticH?.baseRisk ?? score,
    vulnerability: staticH?.vulnerability ?? score / 100,
    cause: b.cause || staticH?.cause || "Urban runoff / low-lying drainage catch basin",
    affectedRoads: staticH?.affectedRoads || [b.name, "Adjacent arterial corridors"],
    reports24h: staticH?.reports24h || 0,
    lastVerified: b.last_updated
      ? timeAgo(new Date(b.last_updated).getTime())
      : "Recently updated",
    riskScore: score,
    severity: severityFromScore(score),
  };
}

export function mapBackendReport(r: ReportResponse): FloodReport {
  const severity = (r.severity as ReportSeverity) || "knee";
  const status =
    r.status === "verified" || r.status === "resolved"
      ? (r.status as ReportStatus)
      : "pending";

  const depth =
    severity === "impassable"
      ? "≈ 70+ cm"
      : severity === "knee"
      ? "≈ 45–55 cm"
      : "≈ 15–25 cm";

  return {
    id: r.id,
    location: r.note
      ? r.note.slice(0, 48)
      : `Report at ${r.lat.toFixed(3)}, ${r.lng.toFixed(3)}`,
    lat: r.lat,
    lng: r.lng,
    severity,
    note: r.note || undefined,
    photo: r.photo_url || undefined,
    timestamp: r.timestamp ? new Date(r.timestamp).getTime() : Date.now(),
    status,
    upvotes: r.corroboration_count > 0 ? r.corroboration_count * 2 : 1,
    source: "community",
    aiConfidence: r.ai_confidence ?? undefined,
    waterDepthLabel: depth,
    verifiedBy: r.ai_verified ? "FloodSense Vision · auto" : undefined,
  };
}

export function mapBackendAlert(a: AlertListItem): FloodAlert {
  const score = a.risk_score || 50;
  const level: AlertLevel =
    score >= 75
      ? "severe"
      : score >= 55
      ? "high"
      : score >= 35
      ? "moderate"
      : "info";

  const channelMap: Record<string, "SMS" | "WhatsApp" | "Push"> = {
    sms: "SMS",
    whatsapp: "WhatsApp",
    app: "Push",
  };

  const cleanMessage = a.message || "Waterlogging alert dispatched";
  const title = cleanMessage.includes(":")
    ? cleanMessage.split(":")[0].trim()
    : `Alert · ${a.hotspot_id}`;

  return {
    id: a.id,
    hotspotId: a.hotspot_id,
    title,
    message: cleanMessage,
    level,
    channel: channelMap[a.channel.toLowerCase()] || "Push",
    timestamp: a.sent_at ? new Date(a.sent_at).getTime() : Date.now(),
    read: false,
    routeHint: a.route_suggestion || undefined,
  };
}

// ---------------------------------------------------------------------------
// Store Creation
// ---------------------------------------------------------------------------

export const useFloodStore = create<FloodState>()(
  persist(
    (set, get) => ({
      view: "landing",
      hotspots: baselineLive(),
      scenario: { intensity: 0, durationHours: 0 },
      predictionRanAt: null,
      selectedHotspotId: null,
      reports: MOCK_REPORTS,
      alerts: MOCK_ALERTS,
      userLocalityId: "hitec",
      lastSync: Date.now(),
      historicalLocationId: DEFAULT_HISTORICAL_LOCATION_ID,

      isBackendLive: false,
      isSyncing: false,
      apiError: null,

      setView: (v) => set({ view: v }),
      selectHotspot: (id) => set({ selectedHotspotId: id }),
      openHistoricalLocation: (locationId) =>
        set({ view: "historical", historicalLocationId: locationId }),

      // Sync local scenario prediction (fast fallback)
      runPrediction: (scenario) => {
        const next = applyScenario(scenario);
        const prev = get().hotspots;
        const newAlerts: FloodAlert[] = [];
        next.forEach((h) => {
          const before = prev.find((p) => p.id === h.id);
          const escalated =
            h.severity === "severe" && before && before.severity !== "severe";
          if (escalated) {
            newAlerts.push({
              id: uid("alr"),
              hotspotId: h.id,
              title: `Severe risk · ${h.name}`,
              message: `Predicted waterlogging ${h.riskScore}% under ${scenario.intensity} mm/hr for ${scenario.durationHours} hr. Affected: ${h.affectedRoads[0]}. ${
                h.vulnerability > 0.8
                  ? "Avoid corridor; alternate routes active."
                  : "Expect lane closures."
              }`,
              level: "severe",
              channel: "SMS",
              timestamp: Date.now(),
              read: false,
            });
          }
        });
        set({
          hotspots: next,
          scenario,
          predictionRanAt: Date.now(),
          lastSync: Date.now(),
          alerts: [...newAlerts, ...get().alerts].slice(0, 24),
        });
        return next;
      },

      // Async live prediction using real FastAPI risk endpoints
      runPredictionLive: async (scenario) => {
        const prev = get().hotspots;
        set({ isSyncing: true, apiError: null });

        try {
          // If 0 intensity, reset to baseline
          if (scenario.intensity <= 0) {
            const next = baselineLive();
            set({
              hotspots: next,
              scenario,
              predictionRanAt: Date.now(),
              lastSync: Date.now(),
              isSyncing: false,
            });
            return next;
          }

          // Query real backend predictRisk for the top hotspots in parallel
          const durationMins = Math.round(scenario.durationHours * 60) || 60;
          const updated = await Promise.all(
            prev.map(async (h) => {
              try {
                const res = await floodSenseApi.predictRisk({
                  lat: h.lat,
                  lng: h.lng,
                  rainfall_intensity: scenario.intensity,
                  duration_minutes: durationMins,
                });
                const riskScore = Math.round(res.risk_score);
                return {
                  ...h,
                  riskScore,
                  severity: severityFromScore(riskScore),
                };
              } catch {
                // Fallback to local math if single point prediction has an issue
                const raw = applyScenario(scenario).find((x) => x.id === h.id);
                return raw ?? h;
              }
            })
          );

          // Auto-generate alerts for newly escalated severe hotspots
          const newAlerts: FloodAlert[] = [];
          updated.forEach((h) => {
            const before = prev.find((p) => p.id === h.id);
            const escalated =
              h.severity === "severe" && before && before.severity !== "severe";
            if (escalated) {
              newAlerts.push({
                id: uid("alr"),
                hotspotId: h.id,
                title: `Severe risk · ${h.name}`,
                message: `Predicted waterlogging ${h.riskScore}% under ${scenario.intensity} mm/hr. Affected: ${h.affectedRoads[0]}. Safe rerouting recommended.`,
                level: "severe",
                channel: "SMS",
                timestamp: Date.now(),
                read: false,
              });
            }
          });

          set({
            hotspots: updated,
            scenario,
            predictionRanAt: Date.now(),
            lastSync: Date.now(),
            isSyncing: false,
            isBackendLive: true,
            alerts: [...newAlerts, ...get().alerts].slice(0, 24),
          });
          return updated;
        } catch (err: unknown) {
          // Fallback to local prediction if network fails
          const next = get().runPrediction(scenario);
          set({
            isSyncing: false,
            apiError: err instanceof Error ? err.message : "Offline mode active",
          });
          return next;
        }
      },

      resetScenario: () =>
        set({
          hotspots: baselineLive(),
          scenario: { intensity: 0, durationHours: 0 },
          predictionRanAt: null,
          lastSync: Date.now(),
        }),

      addReport: (r) =>
        set((s) => ({
          reports: [r, ...s.reports],
          lastSync: Date.now(),
        })),

      setReportStatus: (id, status) =>
        set((s) => ({
          reports: s.reports.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status,
                  verifiedBy:
                    status === "resolved"
                      ? "GHMC Flood Cell · operator"
                      : "FloodSense Vision · auto",
                }
              : r
          ),
        })),

      upvoteReport: (id) =>
        set((s) => ({
          reports: s.reports.map((r) =>
            r.id === id ? { ...r, upvotes: r.upvotes + 1 } : r
          ),
        })),

      markAlertsRead: () =>
        set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) })),

      setUserLocality: (id) => set({ userLocalityId: id }),

      resetDemo: () =>
        set({
          view: "landing",
          hotspots: baselineLive(),
          scenario: { intensity: 0, durationHours: 0 },
          predictionRanAt: null,
          selectedHotspotId: null,
          reports: MOCK_REPORTS,
          alerts: MOCK_ALERTS,
          userLocalityId: "hitec",
          lastSync: Date.now(),
          historicalLocationId: DEFAULT_HISTORICAL_LOCATION_ID,
          apiError: null,
        }),

      // ---------------------------------------------------------------------
      // Async Backend Initializer & Refetch Actions
      // ---------------------------------------------------------------------

      fetchInitialData: async () => {
        set({ isSyncing: true, apiError: null });
        try {
          const [hotspotData, reportData, alertData] = await Promise.all([
            floodSenseApi.getHotspots({ limit: 50 }).catch(() => null),
            floodSenseApi.getReports({ limit: 20 }).catch(() => null),
            floodSenseApi.getAlerts({ limit: 20 }).catch(() => null),
          ]);

          const updates: Partial<FloodState> = {
            isSyncing: false,
            lastSync: Date.now(),
          };

          if (hotspotData && hotspotData.length > 0) {
            updates.hotspots = hotspotData.map(mapBackendHotspot);
            updates.isBackendLive = true;
          }

          if (reportData && reportData.length > 0) {
            // Keep local custom reports if added recently, prepend backend reports
            updates.reports = reportData.map(mapBackendReport);
          }

          if (alertData && alertData.length > 0) {
            updates.alerts = alertData.map(mapBackendAlert);
          }

          set(updates);
        } catch (err: unknown) {
          set({
            isSyncing: false,
            apiError: err instanceof Error ? err.message : "Failed to sync with backend",
          });
        }
      },

      refreshHotspots: async () => {
        try {
          const data = await floodSenseApi.getHotspots({ limit: 50 });
          if (data.length > 0) {
            set({
              hotspots: data.map(mapBackendHotspot),
              lastSync: Date.now(),
              isBackendLive: true,
            });
          }
        } catch (err: unknown) {
          set({
            apiError: err instanceof Error ? err.message : "Hotspots sync failed",
          });
        }
      },

      refreshReports: async () => {
        try {
          const data = await floodSenseApi.getReports({ limit: 30 });
          if (data.length > 0) {
            set({
              reports: data.map(mapBackendReport),
              lastSync: Date.now(),
            });
          }
        } catch (err: unknown) {
          set({
            apiError: err instanceof Error ? err.message : "Reports sync failed",
          });
        }
      },

      refreshAlerts: async () => {
        try {
          const data = await floodSenseApi.getAlerts({ limit: 30 });
          if (data.length > 0) {
            set({
              alerts: data.map(mapBackendAlert),
              lastSync: Date.now(),
            });
          }
        } catch (err: unknown) {
          set({
            apiError: err instanceof Error ? err.message : "Alerts sync failed",
          });
        }
      },
    }),
    {
      name: "floodsense-demo-v1",
      partialize: (s) => ({
        hotspots: s.hotspots,
        scenario: s.scenario,
        predictionRanAt: s.predictionRanAt,
        reports: s.reports,
        alerts: s.alerts,
        userLocalityId: s.userLocalityId,
        lastSync: s.lastSync,
      }),
    }
  )
);

export { uid };
