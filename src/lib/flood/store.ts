"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { baselineLive, applyScenario } from "./risk";
import { MOCK_REPORTS, MOCK_ALERTS } from "./mock-data";
import { DEFAULT_HISTORICAL_LOCATION_ID } from "./historical-data";
import type {
  View,
  HotspotLive,
  FloodReport,
  FloodAlert,
  RainfallScenario,
  ReportStatus,
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

  setView: (v: View) => void;
  selectHotspot: (id: string | null) => void;
  openHistoricalLocation: (locationId: string) => void;
  runPrediction: (scenario: RainfallScenario) => HotspotLive[];
  resetScenario: () => void;
  addReport: (r: FloodReport) => void;
  setReportStatus: (id: string, status: ReportStatus) => void;
  upvoteReport: (id: string) => void;
  markAlertsRead: () => void;
  setUserLocality: (id: string) => void;
  resetDemo: () => void;
}

const uid = (p: string) =>
  `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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

      setView: (v) => set({ view: v }),
      selectHotspot: (id) => set({ selectedHotspotId: id }),
      openHistoricalLocation: (locationId) =>
        set({ view: "historical", historicalLocationId: locationId }),

      runPrediction: (scenario) => {
        const next = applyScenario(scenario);
        const prev = get().hotspots;
        // auto-generate alerts for hotspots newly escalated to severe
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
              message: `Predicted waterlogging ${h.riskScore}% under ${scenario.intensity} mm/hr for ${scenario.durationHours} hr. Affected: ${h.affectedRoads[0]}. ${h.vulnerability > 0.8 ? "Avoid corridor; alternate routes active." : "Expect lane closures."}`,
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
        }),
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
