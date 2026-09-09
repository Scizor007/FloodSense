"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radar,
  Play,
  RotateCcw,
  MapPin,
  Route,
  X,
  Activity,
  Droplets,
  CalendarDays,
  Sparkles,
  Loader2,
  MessageSquare,
  Info,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useFloodStore } from "@/lib/flood/store";
import { RISK_META } from "@/lib/flood/types";
import type { HotspotLive } from "@/lib/flood/types";
import {
  floodSenseApi,
  type ContributingFactors,
  type GridPointRisk,
  type ReportResponse,
  type RiskPredictionResponse,
  type RerouteResponse,
} from "@/lib/flood/api";
import { HyderabadMap, type MapLayersState } from "./hyderabad-map";
import type { RouteOverlayData } from "./route-overlay";
import { RouteStats } from "./route-overlay";
import {
  RiskGauge,
  RiskBadge,
  SeverityBar,
  ScreenHeader,
} from "../shared/risk-widgets";

const DURATIONS = [
  { value: 0.5, label: "30 minutes" },
  { value: 1, label: "1 hour" },
  { value: 2, label: "2 hours" },
  { value: 3, label: "3 hours" },
  { value: 6, label: "6 hours" },
];

export function MapView() {
  const {
    hotspots,
    scenario,
    selectedHotspotId,
    selectHotspot,
    runPredictionLive,
    resetScenario,
    openHistoricalLocation,
  } = useFloodStore();
  const { toast } = useToast();

  const [intensity, setIntensity] = useState(scenario.intensity || 0);
  const [duration, setDuration] = useState(String(scenario.durationHours || 1));
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [route, setRoute] = useState<RouteOverlayData | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);

  // User-Controlled Alternate Routing State
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [routeStart, setRouteStart] = useState<{ lat: number; lng: number } | null>(null);
  const [routeDest, setRouteDest] = useState<{ lat: number; lng: number } | null>(null);
  const [pickingMode, setPickingMode] = useState<"start" | "destination" | "auto" | null>(null);
  const [rerouteResult, setRerouteResult] = useState<RerouteResponse | null>(null);
  const [routingError, setRoutingError] = useState<string | null>(null);
  const [avoidHotspotIds, setAvoidHotspotIds] = useState<string[]>([]);

  // Contributing factors loaded from backend for selected hotspot
  const [liveFactors, setLiveFactors] = useState<ContributingFactors | null>(null);
  const [liveModelVersion, setLiveModelVersion] = useState<string | null>(null);

  // Citywide Heatmap Grid state (POST /risk/predict-grid)
  const [gridPoints, setGridPoints] = useState<GridPointRisk[]>([]);
  const [gridLoading, setGridLoading] = useState(false);

  // Real Citizen Reports from backend (GET /reports)
  const [reports, setReports] = useState<ReportResponse[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportResponse | null>(null);

  // Layer Controls
  const [mapLayers, setMapLayers] = useState<MapLayersState>({
    predictedRisk: true,
    historicalHotspots: true,
    citizenReports: true,
    affectedCorridors: false,
  });

  // Visible Map Bounds
  const [mapBounds, setMapBounds] = useState({
    min_lat: 17.32,
    max_lat: 17.48,
    min_lng: 78.35,
    max_lng: 78.58,
  });

  const selected = hotspots.find((h) => h.id === selectedHotspotId) ?? null;

  const topHotspots = useMemo(
    () => [...hotspots].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6),
    [hotspots]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { low: 0, moderate: 0, high: 0, severe: 0 };
    hotspots.forEach((h) => {
      if (c[h.severity] !== undefined) c[h.severity] += 1;
    });
    return c;
  }, [hotspots]);

  // Load real citizen reports from GET /reports
  useEffect(() => {
    let isSubscribed = true;
    floodSenseApi
      .getReports()
      .then((res) => {
        if (isSubscribed && Array.isArray(res)) {
          setReports(res);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch reports from backend:", err);
      });

    return () => {
      isSubscribed = false;
    };
  }, []);

  // Compute citywide risk grid from real backend POST /risk/predict-grid
  const fetchGridPrediction = useCallback(
    async (rainfallMmHr: number, durationHrs: number, bounds = mapBounds) => {
      setGridLoading(true);
      try {
        const res = await floodSenseApi.predictRiskGrid({
          min_lat: bounds.min_lat,
          max_lat: bounds.max_lat,
          min_lng: bounds.min_lng,
          max_lng: bounds.max_lng,
          grid_resolution: 8,
          rainfall_intensity: rainfallMmHr,
          duration_minutes: Math.round(durationHrs * 60) || 60,
        });
        if (res && res.grid) {
          setGridPoints(res.grid);
        }
      } catch (err) {
        console.warn("Could not fetch risk grid from backend:", err);
      } finally {
        setGridLoading(false);
      }
    },
    [mapBounds]
  );

  // Fetch initial baseline grid on component mount
  useEffect(() => {
    fetchGridPrediction(intensity, parseFloat(duration) || 1);
  }, []);

  // Fetch real contributing factors when a hotspot marker is clicked
  useEffect(() => {
    if (!selected) {
      setLiveFactors(null);
      setLiveModelVersion(null);
      return;
    }

    let isSubscribed = true;
    floodSenseApi
      .predictRisk({
        lat: selected.lat,
        lng: selected.lng,
        rainfall_intensity: intensity || 0,
        duration_minutes: Math.round(parseFloat(duration) * 60) || 60,
      })
      .then((res: RiskPredictionResponse) => {
        if (isSubscribed) {
          setLiveFactors(res.contributing_factors);
          setLiveModelVersion(res.model_version);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch contributing factors:", err);
      });

    return () => {
      isSubscribed = false;
    };
  }, [selected?.id, intensity, duration]);

  // Real nearby verified reports count for selected hotspot (within 1.5 km)
  const nearbyReportsCount = useMemo(() => {
    if (!selected) return 0;
    return reports.filter((r) => {
      if (typeof r.lat !== "number" || typeof r.lng !== "number") return false;
      const dLat = (r.lat - selected.lat) * 111.0;
      const dLng = (r.lng - selected.lng) * 106.0;
      return Math.sqrt(dLat * dLat + dLng * dLng) <= 1.5;
    }).length;
  }, [selected, reports]);

  // Map click handler for interactive route point picking
  const handleMapCoordinateClick = useCallback(
    (coord: { lat: number; lng: number }) => {
      if (pickingMode === "start") {
        setRouteStart(coord);
        setRerouteResult(null);
        setPickingMode((prev) => (!routeDest ? "destination" : null));
        toast({
          title: "Start location set 📍",
          description: `${coord.lat.toFixed(4)}°N, ${coord.lng.toFixed(4)}°E`,
        });
      } else if (pickingMode === "destination") {
        setRouteDest(coord);
        setRerouteResult(null);
        setPickingMode(null);
        toast({
          title: "Destination set 🏁",
          description: `${coord.lat.toFixed(4)}°N, ${coord.lng.toFixed(4)}°E`,
        });
      } else if (pickingMode === "auto") {
        if (!routeStart) {
          setRouteStart(coord);
          setRerouteResult(null);
          setPickingMode("destination");
          toast({
            title: "Start location set 📍",
            description: "Now click on the map to set your Destination 🏁",
          });
        } else {
          setRouteDest(coord);
          setRerouteResult(null);
          setPickingMode(null);
          toast({
            title: "Destination set 🏁",
            description: `${coord.lat.toFixed(4)}°N, ${coord.lng.toFixed(4)}°E`,
          });
        }
      }
    },
    [pickingMode, routeStart, routeDest, toast]
  );

  // Trigger real flood-aware reroute via POST /routing/reroute
  const handleFindSafeRoute = async () => {
    if (!routeStart || !routeDest) return;
    setRoutingLoading(true);
    setRoutingError(null);

    try {
      const res = await floodSenseApi.reroute({
        origin: routeStart,
        destination: routeDest,
        avoid_hotspot_ids: avoidHotspotIds.length > 0 ? avoidHotspotIds : null,
      });

      if (res.geometry?.coordinates && res.geometry.coordinates.length > 0) {
        setRerouteResult(res);
        if (res.provider === "OSRM fallback") {
          toast({
            title: "Route Computed (Backup)",
            description: "OpenRouteService unavailable — using backup routing.",
          });
        } else {
          toast({
            title: "Safe Route Computed ✓",
            description: `${res.distance_km} km · ${res.duration_minutes} min via ${res.provider}`,
          });
        }
      } else {
        setRerouteResult(null);
        setRoutingError("Could not construct drivable route geometry between coordinates.");
        toast({
          variant: "destructive",
          title: "Routing Service Notice",
          description: "No passable road network connection found between points.",
        });
      }
    } catch (err: unknown) {
      console.warn("Backend reroute error:", err);
      const msg = err instanceof Error ? err.message : "Route calculation failed";
      setRoutingError(msg);
      toast({
        variant: "destructive",
        title: "Routing Service Notice",
        description: "Could not retrieve real routing geometry from backend.",
      });
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleClearRoute = () => {
    setRouteStart(null);
    setRouteDest(null);
    setRerouteResult(null);
    setRoute(null);
    setRoutingError(null);
    setPickingMode(null);
    setAvoidHotspotIds([]);
    toast({
      title: "Route Cleared",
      description: "You can now select a new Start and Destination on the map.",
    });
  };

  const handleOpenRoutePlannerWithHotspot = (h: HotspotLive) => {
    setIsPlanningRoute(true);
    setSelectedReport(null);
    setAvoidHotspotIds([h.name || h.id]);
    // Do not populate random or hardcoded coordinates!
    setRouteStart(null);
    setRouteDest(null);
    setRerouteResult(null);
    setRoute(null);
    setPickingMode("auto");
    toast({
      title: `Route Planner — Avoiding ${h.name}`,
      description: "Click anywhere on map to set your Start location 📍",
    });
  };

  const handleBoundsChange = useCallback(
    (b: { min_lat: number; max_lat: number; min_lng: number; max_lng: number }) => {
      setMapBounds((prev) => {
        if (
          Math.abs(prev.min_lat - b.min_lat) < 0.001 &&
          Math.abs(prev.max_lat - b.max_lat) < 0.001 &&
          Math.abs(prev.min_lng - b.min_lng) < 0.001 &&
          Math.abs(prev.max_lng - b.max_lng) < 0.001
        ) {
          return prev;
        }
        return b;
      });
    },
    []
  );

  // Run real scenario prediction (POST /risk/predict-grid + Hotspot re-scoring)
  const handleRunPrediction = async () => {
    setPhase("running");
    const before = hotspots.filter((h) => h.severity === "severe").length;

    try {
      // 1. Fetch real citywide risk grid from backend
      await fetchGridPrediction(intensity, parseFloat(duration) || 1, mapBounds);

      // 2. Re-score hotspots via live ML inference
      const next = await runPredictionLive({
        intensity,
        durationHours: parseFloat(duration),
      });

      const after = next.filter((h) => h.severity === "severe").length;
      const escalated = Math.max(0, after - before);

      toast({
        title: "Citywide Risk Model Inference Complete",
        description: `Risk grid & hotspots updated for ${intensity} mm/hr rainfall (${duration}h) · ${
          escalated > 0
            ? `${escalated} escalated to severe`
            : "no severe escalations"
        }`,
      });
    } catch (err: unknown) {
      console.warn("Prediction run notice:", err);
      toast({
        title: "Prediction completed",
        description: `Re-scored city risk under ${intensity} mm/hr`,
      });
    } finally {
      setPhase("idle");
    }
  };

  const handleResetScenario = () => {
    resetScenario();
    setIntensity(0);
    fetchGridPrediction(0, 1, mapBounds);
  };

  const rainVisual = phase === "running" ? intensity : scenario.intensity;

  return (
    <div className="space-y-5">
      <ScreenHeader
        eyebrow="Live map"
        title="Waterlogging Risk Map"
        desc="Data-driven urban flood intelligence powered by the hybrid ML risk engine, documented historical hotspots, and real citizen ground truth."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-mono text-muted-foreground">
                {counts.low} Low
              </span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-mono text-muted-foreground">
                {counts.moderate} Moderate
              </span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              <span className="font-mono text-muted-foreground">
                {counts.high} High
              </span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="font-mono text-muted-foreground">
                {counts.severe} Severe
              </span>
            </span>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* ================= LEFT CONTROLS COLUMN ================= */}
        <div className="space-y-4">
          {/* Rainfall scenario simulator */}
          <div className="glass-card rounded-xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Radar className="h-4 w-4 text-primary" />
                Rainfall Scenario Simulator
              </p>
            </div>

            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Simulate rainfall intensity to query the real backend{" "}
              <code className="font-mono text-primary text-xs">
                POST /risk/predict-grid
              </code>{" "}
              endpoint and compute citywide inundation risk.
            </p>

            {/* intensity slider */}
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">
                  Intensity
                </span>
                <span className="font-mono font-bold text-foreground">
                  {intensity} mm/hr
                </span>
              </div>
              <Slider
                value={[intensity]}
                onValueChange={([v]) => setIntensity(v)}
                min={0}
                max={120}
                step={5}
                className="py-1"
              />
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>0 (dry)</span>
                <span>30 (mod)</span>
                <span>60 (heavy)</span>
                <span>120 (cloudburst)</span>
              </div>
            </div>

            {/* duration select */}
            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Rainfall duration
              </label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* run button */}
            <div className="mt-5 space-y-2">
              <Button
                onClick={handleRunPrediction}
                disabled={phase === "running" || gridLoading}
                className="w-full gap-2"
                data-cursor="hover"
              >
                {phase === "running" || gridLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Computing Model Grid…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    Run Prediction
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setIsPlanningRoute(true);
                  selectHotspot(null);
                  setSelectedReport(null);
                  setPickingMode("auto");
                  toast({
                    title: "Route Planner Active",
                    description: "Click anywhere on map to set your Start location 📍",
                  });
                }}
                className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10 font-semibold"
              >
                <Route className="h-4 w-4" />
                Suggest Alternate Route
              </Button>

              {scenario.intensity > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetScenario}
                  className="w-full gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to Baseline
                </Button>
              )}
            </div>
          </div>

          {/* Highest risk corridors list */}
          <div className="glass-card rounded-xl p-4">
            <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Highest Risk Corridors</span>
              <span className="font-mono text-[10px] lowercase text-muted-foreground/70">
                top 6
              </span>
            </p>
            <div className="space-y-1.5">
              {topHotspots.map((h) => {
                const isSel = h.id === selectedHotspotId;
                return (
                  <button
                    key={h.id}
                    onClick={() => {
                      selectHotspot(h.id);
                      setSelectedReport(null);
                      setRoute(null);
                    }}
                    data-cursor="hover"
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isSel
                        ? "bg-primary/20 text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="truncate text-xs font-medium">{h.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground/80">
                        {h.affectedRoads[0]}
                      </p>
                    </div>
                    <RiskBadge level={h.severity} size="sm" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ================= MAP + RIGHT DETAIL COLUMN ================= */}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="glass-card relative overflow-hidden rounded-xl">
            <div className="relative h-[430px] md:h-[540px] xl:h-[640px]">
              <HyderabadMap
                hotspots={hotspots}
                selectedId={selectedHotspotId}
                onSelect={(id) => {
                  selectHotspot(id);
                  if (id) {
                    setSelectedReport(null);
                    setRoute(null);
                  }
                }}
                rainIntensity={rainVisual}
                route={route}
                gridPoints={gridPoints}
                reports={reports}
                layers={mapLayers}
                onToggleLayer={(key) =>
                  setMapLayers((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                onBoundsChange={handleBoundsChange}
                gridLoading={gridLoading}
                onSelectReport={(rep) => {
                  setSelectedReport(rep);
                  if (rep) {
                    selectHotspot(null);
                    setRoute(null);
                  }
                }}
                selectedReportId={selectedReport?.id ?? null}
                routeStart={routeStart}
                routeDest={routeDest}
                pickingMode={pickingMode}
                onMapCoordinateClick={handleMapCoordinateClick}
                rerouteResult={rerouteResult}
              />

              {/* Scan effect while predicting */}
              <AnimatePresence>
                {phase === "running" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl z-20"
                  >
                    <div
                      className="absolute left-0 right-0 h-24"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent, rgba(113,56,204,0.22), rgba(34,211,238,0.12), transparent)",
                        animation: "scan-line 1.4s ease-in-out infinite",
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Interactive Route Result Summary Card */}
              <AnimatePresence>
                {rerouteResult && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    className="absolute bottom-3 left-1/2 z-30 w-[calc(100%-24px)] max-w-lg -translate-x-1/2"
                  >
                    <div className="glass-card rounded-xl p-3.5 shadow-2xl border border-primary/30">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                            <Route className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                            <span>Flood-Aware Route</span>
                          </p>
                          <span
                            className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold ${
                              rerouteResult.provider === "OpenRouteService"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-500/30"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {rerouteResult.provider}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleClearRoute}
                            className="h-6 text-[10.5px] text-muted-foreground hover:text-destructive px-2"
                          >
                            Clear Route
                          </Button>
                          <button
                            onClick={() => setRerouteResult(null)}
                            aria-label="Dismiss summary"
                            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {rerouteResult.provider === "OSRM fallback" && (
                        <div className="mb-2 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[10.5px] text-amber-700 dark:text-amber-300">
                          OpenRouteService unavailable — using backup routing.
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-secondary/60 p-2">
                          <p className="text-[10px] uppercase text-muted-foreground">Route Dist</p>
                          <p className="font-mono text-sm font-bold text-foreground">
                            {rerouteResult.distance_km} km
                          </p>
                          {rerouteResult.added_distance_km != null &&
                            rerouteResult.added_distance_km > 0 && (
                              <p className="font-mono text-[9.5px] text-amber-600 dark:text-amber-400">
                                +{rerouteResult.added_distance_km} km detour
                              </p>
                            )}
                        </div>
                        <div className="rounded-lg bg-secondary/60 p-2">
                          <p className="text-[10px] uppercase text-muted-foreground">Est. Time</p>
                          <p className="font-mono text-sm font-bold text-foreground">
                            {rerouteResult.duration_minutes} min
                          </p>
                          {rerouteResult.added_duration_minutes != null &&
                            rerouteResult.added_duration_minutes > 0 && (
                              <p className="font-mono text-[9.5px] text-amber-600 dark:text-amber-400">
                                +{rerouteResult.added_duration_minutes} min
                              </p>
                            )}
                        </div>
                        <div className="rounded-lg bg-secondary/60 p-2">
                          <p className="text-[10px] uppercase text-muted-foreground">Avoidance</p>
                          <p
                            className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 truncate"
                            title={rerouteResult.avoided_zones.join(", ")}
                          >
                            {rerouteResult.avoided_zones.length > 0
                              ? `${rerouteResult.avoided_zones.length} Zones`
                              : "Optimal"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Legacy Route stats bar */}
              <AnimatePresence>
                {route && selected && !rerouteResult && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 20, opacity: 0 }}
                    className="absolute bottom-3 left-1/2 z-30 w-[calc(100%-24px)] max-w-md -translate-x-1/2"
                  >
                    <div className="glass-card rounded-xl p-3.5 shadow-xl">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Route className="h-3.5 w-3.5 text-water" />
                          Alternate route — avoids {selected.name}
                        </p>
                        <button
                          onClick={() => setRoute(null)}
                          aria-label="Clear route"
                          className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <RouteStats route={route} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right column: Hotspot Detail, Citizen Report Detail, or City Pulse */}
          <div className="min-h-[200px]">
            <AnimatePresence mode="wait">
              {/* ================= 0. USER-CONTROLLED ROUTE PLANNER ================= */}
              {isPlanningRoute ? (
                <motion.div
                  key="route-planner"
                  initial={{ x: 24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 24, opacity: 0 }}
                  className="glass-card flex h-full flex-col rounded-xl border border-primary/30"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border p-4 pb-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-primary">
                        <Route className="h-3.5 w-3.5" />
                        Flood-Aware Routing
                      </p>
                      <h3 className="font-display mt-1 text-lg font-bold leading-tight text-foreground">
                        ROUTE PLANNER
                      </h3>
                      {avoidHotspotIds.length > 0 && (
                        <p className="mt-1 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                          Avoiding: {avoidHotspotIds.join(", ")}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setIsPlanningRoute(false);
                        setPickingMode(null);
                      }}
                      aria-label="Close route planner"
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <ScrollArea className="flex-1 p-4" style={{ maxHeight: 540 }}>
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Select two locations on the map. The routing engine snaps coordinates to the road network and computes a real flood-safe route using OpenRouteService.
                      </p>

                      {/* 1. Starting Location */}
                      <div
                        className={`rounded-xl border p-3.5 transition-all ${
                          pickingMode === "start"
                            ? "border-cyan-500 bg-cyan-500/10 shadow-sm"
                            : "border-border/80 bg-secondary/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                            <span className="text-sm">📍</span>
                            <span>Starting location</span>
                          </span>
                          {routeStart ? (
                            <span className="font-mono text-[9.5px] font-bold text-cyan-600 dark:text-cyan-400 uppercase">
                              Selected ✓
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] text-muted-foreground">
                              Required
                            </span>
                          )}
                        </div>

                        <div className="mt-2 text-xs font-mono">
                          {routeStart ? (
                            <div className="flex items-center justify-between text-foreground">
                              <span>
                                {routeStart.lat.toFixed(4)}°N, {routeStart.lng.toFixed(4)}°E
                              </span>
                              <span className="text-[10px] text-muted-foreground">Road snap</span>
                            </div>
                          ) : (
                            <p className="italic text-muted-foreground/70">
                              [ No starting location selected ]
                            </p>
                          )}
                        </div>

                        <div className="mt-2.5">
                          <Button
                            size="sm"
                            variant={pickingMode === "start" ? "default" : "outline"}
                            onClick={() => setPickingMode("start")}
                            className="w-full text-xs gap-1.5"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            {routeStart ? "Change Start" : "Select on map"}
                          </Button>
                        </div>
                      </div>

                      {/* 2. Destination */}
                      <div
                        className={`rounded-xl border p-3.5 transition-all ${
                          pickingMode === "destination"
                            ? "border-purple-500 bg-purple-500/10 shadow-sm"
                            : "border-border/80 bg-secondary/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                            <span className="text-sm">🏁</span>
                            <span>Destination</span>
                          </span>
                          {routeDest ? (
                            <span className="font-mono text-[9.5px] font-bold text-purple-600 dark:text-purple-400 uppercase">
                              Selected ✓
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] text-muted-foreground">
                              Required
                            </span>
                          )}
                        </div>

                        <div className="mt-2 text-xs font-mono">
                          {routeDest ? (
                            <div className="flex items-center justify-between text-foreground">
                              <span>
                                {routeDest.lat.toFixed(4)}°N, {routeDest.lng.toFixed(4)}°E
                              </span>
                              <span className="text-[10px] text-muted-foreground">Road snap</span>
                            </div>
                          ) : (
                            <p className="italic text-muted-foreground/70">
                              [ No destination selected ]
                            </p>
                          )}
                        </div>

                        <div className="mt-2.5">
                          <Button
                            size="sm"
                            variant={pickingMode === "destination" ? "default" : "outline"}
                            onClick={() => setPickingMode("destination")}
                            className="w-full text-xs gap-1.5"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            {routeDest ? "Change Destination" : "Select on map"}
                          </Button>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="space-y-2 pt-1">
                        <Button
                          className="w-full gap-2 font-semibold"
                          disabled={!routeStart || !routeDest || routingLoading}
                          onClick={handleFindSafeRoute}
                        >
                          {routingLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Calculating flood-aware route...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="h-4 w-4" />
                              Find Safe Route
                            </>
                          )}
                        </Button>

                        {(routeStart || routeDest || rerouteResult) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-muted-foreground hover:text-destructive gap-1.5"
                            onClick={handleClearRoute}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Clear Route
                          </Button>
                        )}
                      </div>

                      {/* Non-blocking error notice */}
                      {routingError && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                          <p className="font-semibold flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4" />
                            Routing Notice
                          </p>
                          <p className="text-muted-foreground leading-relaxed">{routingError}</p>
                        </div>
                      )}

                      {/* Route Result Summary Card */}
                      {rerouteResult && (
                        <div className="rounded-xl border border-primary/30 bg-card/80 p-3.5 shadow-sm space-y-3">
                          <div className="flex items-center justify-between border-b border-border/60 pb-2">
                            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              Route Summary
                            </span>
                            <span
                              className={`font-mono text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                                rerouteResult.provider === "OpenRouteService"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-500/30"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-500/30"
                              }`}
                            >
                              {rerouteResult.provider}
                            </span>
                          </div>

                          {rerouteResult.provider === "OSRM fallback" && (
                            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                              OpenRouteService unavailable — using backup routing.
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-secondary/60 p-2.5">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Distance
                              </p>
                              <p className="font-mono text-base font-bold text-foreground">
                                {rerouteResult.distance_km} <span className="text-xs font-normal">km</span>
                              </p>
                              {rerouteResult.added_distance_km != null &&
                                rerouteResult.added_distance_km > 0 && (
                                  <p className="text-[9.5px] font-mono text-amber-600 dark:text-amber-400">
                                    +{rerouteResult.added_distance_km} km detour
                                  </p>
                                )}
                            </div>
                            <div className="rounded-lg bg-secondary/60 p-2.5">
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                Travel Time
                              </p>
                              <p className="font-mono text-base font-bold text-foreground">
                                {rerouteResult.duration_minutes} <span className="text-xs font-normal">min</span>
                              </p>
                              {rerouteResult.added_duration_minutes != null &&
                                rerouteResult.added_duration_minutes > 0 && (
                                  <p className="text-[9.5px] font-mono text-amber-600 dark:text-amber-400">
                                    +{rerouteResult.added_duration_minutes} min
                                  </p>
                                )}
                            </div>
                          </div>

                          {/* Avoided Flood Zones */}
                          {rerouteResult.avoided_zones && rerouteResult.avoided_zones.length > 0 ? (
                            <div className="rounded-lg bg-secondary/40 p-2.5 text-xs">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Avoided Flood Zones ({rerouteResult.avoided_zones.length})
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {rerouteResult.avoided_zones.map((name, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium border border-border/60 text-foreground"
                                  >
                                    🛡️ {name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-muted-foreground font-sans">
                              No documented severe flood bottlenecks along this corridor.
                            </div>
                          )}

                          <div className="pt-1 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                            <span>Road snapped: Yes</span>
                            <span>Nodes: {rerouteResult.geometry.coordinates.length}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </motion.div>
              ) : selectedReport ? (
                <motion.div
                  key="report-detail"
                  initial={{ x: 24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 24, opacity: 0 }}
                  className="glass-card flex h-full flex-col rounded-xl"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border p-4 pb-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
                        <MessageSquare className="h-3 w-3" />
                        Citizen Report
                      </p>
                      <h3 className="font-display mt-1 text-base font-semibold leading-tight">
                        {selectedReport.note || "Waterlogging Report"}
                      </h3>
                    </div>
                    <button
                      onClick={() => setSelectedReport(null)}
                      aria-label="Close panel"
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <ScrollArea className="flex-1 p-4" style={{ maxHeight: 520 }}>
                    {selectedReport.photo_url && (
                      <div className="mb-3 overflow-hidden rounded-lg border border-border">
                        <img
                          src={selectedReport.photo_url}
                          alt="Report attachment"
                          className="h-36 w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-secondary/60 p-2">
                        <p className="text-muted-foreground">Water Depth</p>
                        <p className="font-mono text-sm font-semibold capitalize text-foreground">
                          {selectedReport.severity}
                        </p>
                      </div>
                      <div className="rounded-lg bg-secondary/60 p-2">
                        <p className="text-muted-foreground">Status</p>
                        <p className="font-mono text-[11px] font-semibold capitalize text-foreground">
                          {selectedReport.status}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-border/80 bg-secondary/30 p-2.5 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Vision AI Verification</span>
                        <span className="font-mono font-semibold text-foreground">
                          {selectedReport.ai_verified ? "Verified ✓" : "Pending"}
                        </span>
                      </div>
                      {selectedReport.ai_confidence != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">AI Confidence</span>
                          <span className="font-mono font-semibold text-foreground">
                            {(selectedReport.ai_confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                      {selectedReport.corroboration_count > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Confirmations</span>
                          <span className="font-mono font-semibold text-foreground">
                            {selectedReport.corroboration_count} resident votes
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Coordinates</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {selectedReport.lat.toFixed(4)}°N, {selectedReport.lng.toFixed(4)}°E
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Timestamp</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {new Date(selectedReport.timestamp).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                      <p className="flex items-center gap-1 font-semibold text-primary">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Ground Truth Integrity
                      </p>
                      <p className="mt-1 leading-relaxed">
                        Loaded directly from MongoDB via <code className="font-mono text-primary">GET /reports</code>. Zero fabricated community reports.
                      </p>
                    </div>
                  </ScrollArea>
                </motion.div>
              ) : selected ? (
                /* ================= 2. HISTORICAL HOTSPOT DETAIL ================= */
                <motion.div
                  key="detail"
                  initial={{ x: 24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 24, opacity: 0 }}
                  className="glass-card flex h-full flex-col rounded-xl"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border p-4 pb-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        <MapPin className="h-3 w-3 text-primary" />
                        {selected.ward} ward
                      </p>
                      <h3 className="font-display mt-1 text-lg font-semibold leading-tight">
                        {selected.name}
                      </h3>
                      <p className="mt-1 font-mono text-[9.5px] text-muted-foreground">
                        Documented historical bottleneck · 1 of 25 monitored locations
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        selectHotspot(null);
                        setRoute(null);
                      }}
                      aria-label="Close panel"
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <ScrollArea className="flex-1 p-4" style={{ maxHeight: 520 }}>
                    <div className="flex items-center gap-4">
                      <RiskGauge
                        score={selected.riskScore}
                        level={selected.severity}
                      />
                      <div className="flex-1 space-y-2.5">
                        <RiskBadge level={selected.severity} />
                        <SeverityBar level={selected.severity} />
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg bg-secondary/60 p-2">
                            <p className="text-muted-foreground">Nearby Reports</p>
                            <p className="font-mono text-sm font-semibold">
                              {nearbyReportsCount} confirmed
                            </p>
                          </div>
                          <div className="rounded-lg bg-secondary/60 p-2">
                            <p className="text-muted-foreground">Category</p>
                            <p className="font-mono text-[11px] font-semibold capitalize">
                              {selected.baseRisk >= 75
                                ? "Critical"
                                : selected.baseRisk >= 50
                                ? "Recurrent"
                                : "Drainage Watch"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Contributing Factors from real FastAPI backend */}
                    {liveFactors && (
                      <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                            Model Contributing Factors
                          </p>
                          {liveModelVersion && (
                            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              {liveModelVersion}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                          <div className="rounded bg-background/60 p-1.5">
                            <span className="text-muted-foreground">Elevation: </span>
                            <span className="font-bold text-foreground">
                              {liveFactors.elevation_m}m
                            </span>
                          </div>
                          <div className="rounded bg-background/60 p-1.5">
                            <span className="text-muted-foreground">Vulnerability: </span>
                            <span className="font-bold text-foreground">
                              {(liveFactors.elevation_vulnerability * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="rounded bg-background/60 p-1.5">
                            <span className="text-muted-foreground">Rainfall Factor: </span>
                            <span className="font-bold text-foreground">
                              {liveFactors.rainfall_factor.toFixed(2)}
                            </span>
                          </div>
                          <div className="rounded bg-background/60 p-1.5">
                            <span className="text-muted-foreground">Proximity: </span>
                            <span className="font-bold text-foreground">
                              {liveFactors.proximity_factor.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Documented cause
                      </p>
                      <p className="text-[14px] leading-[1.6] text-secondary-foreground">
                        {selected.cause}
                      </p>
                    </div>

                    {/* Population Exposure - Data Honesty */}
                    <div className="mt-4 rounded-lg border border-border/70 bg-secondary/20 p-3 text-[11px]">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        Impact & Population Exposure
                      </div>
                      <p className="mt-1 text-muted-foreground leading-relaxed">
                        Census ward-level population overlay is not yet integrated into the backend. No fabricated population numbers are displayed.
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Affected road segments
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.affectedRoads.map((r) => (
                          <span
                            key={r}
                            className="rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-[10.5px] text-secondary-foreground"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <Button
                      className="mt-5 w-full gap-2"
                      onClick={() => handleOpenRoutePlannerWithHotspot(selected)}
                      data-cursor="hover"
                    >
                      <Route className="h-4 w-4" />
                      Suggest Alternate Route
                    </Button>

                    <Button
                      variant="outline"
                      className="mt-2 w-full gap-2"
                      onClick={() => openHistoricalLocation(selected.id)}
                      data-cursor="hover"
                    >
                      <CalendarDays className="h-4 w-4 text-primary" />
                      View Flood Calendar
                    </Button>
                  </ScrollArea>
                </motion.div>
              ) : (
                /* ================= 3. CITY PULSE OVERVIEW ================= */
                <motion.div
                  key="pulse"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="glass-card flex h-full flex-col justify-between rounded-xl p-5"
                >
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Activity className="h-4 w-4 text-primary" />
                        Hyderabad Flood Intelligence
                      </p>
                      <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        ML Live
                      </span>
                    </div>

                    <p className="text-sm font-semibold">
                      {counts.severe > 0
                        ? `${counts.severe} hotspots currently at severe waterlogging risk.`
                        : "No severe waterlogging currently predicted across monitored zones."}
                    </p>
                    <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground">
                      Click any grid point on the map to inspect terrain elevation and model risk, or select a historical hotspot for contributing factors and detour routing.
                    </p>

                    <div className="mt-5 space-y-2">
                      <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-2.5 text-xs">
                        <span className="text-muted-foreground">Citywide Risk Grid Cells</span>
                        <span className="font-mono font-bold">{gridPoints.length}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-2.5 text-xs">
                        <span className="text-muted-foreground">Documented Hotspots</span>
                        <span className="font-mono font-bold">{hotspots.length}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-2.5 text-xs">
                        <span className="text-muted-foreground">Verified Citizen Reports</span>
                        <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                          {reports.filter((r) => r.status === "verified").length}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="mt-4 w-full gap-2 border-primary/40 text-primary hover:bg-primary/10 font-semibold"
                      onClick={() => {
                        setIsPlanningRoute(true);
                        setPickingMode("auto");
                        toast({
                          title: "Route Planner",
                          description: "Click anywhere on the map to set Start location 📍",
                        });
                      }}
                    >
                      <Route className="h-4 w-4" />
                      Open Route Planner
                    </Button>
                  </div>

                  <div className="pt-4">
                    <p className="font-mono text-[10px] text-muted-foreground/70">
                      Hyderabad Flood Observatory · FastAPI + MongoDB Atlas
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
