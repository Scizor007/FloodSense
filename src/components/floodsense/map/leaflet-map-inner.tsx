"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Polyline,
  Tooltip,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Layers, Loader2 } from "lucide-react";
import { RISK_META } from "@/lib/flood/types";
import type { HotspotLive } from "@/lib/flood/types";
import type { RouteOverlayData } from "./route-overlay";
import type { GridPointRisk, ReportResponse, RerouteResponse } from "@/lib/flood/api";

export interface MapLayersState {
  predictedRisk: boolean;
  historicalHotspots: boolean;
  citizenReports: boolean;
  affectedCorridors: boolean;
}

export interface LeafletMapInnerProps {
  hotspots: HotspotLive[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  rainIntensity?: number;
  route?: RouteOverlayData | null;
  focus?: { lat: number; lng: number; radiusKm?: number } | null;
  focusLabel?: string;
  className?: string;
  gridPoints?: GridPointRisk[];
  reports?: ReportResponse[];
  layers?: MapLayersState;
  onToggleLayer?: (layer: keyof MapLayersState) => void;
  onBoundsChange?: (bounds: {
    min_lat: number;
    max_lat: number;
    min_lng: number;
    max_lng: number;
  }) => void;
  gridLoading?: boolean;
  onSelectReport?: (report: ReportResponse | null) => void;
  selectedReportId?: string | null;
  // Route Planning
  routeStart?: { lat: number; lng: number } | null;
  routeDest?: { lat: number; lng: number } | null;
  pickingMode?: "start" | "destination" | "auto" | null;
  onMapCoordinateClick?: (coord: { lat: number; lng: number }) => void;
  rerouteResult?: RerouteResponse | null;
}

const HYDERABAD_CENTER: [number, number] = [17.385, 78.4867];

const createPinIcon = (type: "start" | "dest") => {
  const isStart = type === "start";
  const bg = isStart ? "#0891b2" : "#7138cc";
  const icon = isStart ? "📍" : "🏁";
  const label = isStart ? "Start" : "Destination";
  return L.divIcon({
    className: "custom-route-pin",
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%); pointer-events: none;">
        <div style="background: ${bg}; color: #ffffff; font-weight: 700; font-size: 11px; padding: 3px 8px; border-radius: 9999px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); border: 2px solid #ffffff; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
          <span>${icon}</span>
          <span>${label}</span>
        </div>
        <div style="width: 2px; height: 10px; background: ${bg};"></div>
        <div style="width: 9px; height: 9px; border-radius: 50%; background: ${bg}; border: 2px solid #ffffff; box-shadow: 0 0 6px ${bg};"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

function MapClickHandler({
  pickingMode,
  onMapCoordinateClick,
}: {
  pickingMode?: "start" | "destination" | "auto" | null;
  onMapCoordinateClick?: (coord: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      if (pickingMode && onMapCoordinateClick) {
        onMapCoordinateClick({
          lat: Number(e.latlng.lat.toFixed(5)),
          lng: Number(e.latlng.lng.toFixed(5)),
        });
      }
    },
  });
  return null;
}

/**
 * Controller component inside MapContainer to dynamically adjust viewport
 * when focus, selectedId, or route changes.
 */
function MapViewController({
  focus,
  selectedHotspot,
  route,
  rerouteResult,
  routeStart,
  routeDest,
}: {
  focus?: { lat: number; lng: number; radiusKm?: number } | null;
  selectedHotspot?: HotspotLive | null;
  route?: RouteOverlayData | null;
  rerouteResult?: RerouteResponse | null;
  routeStart?: { lat: number; lng: number } | null;
  routeDest?: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (rerouteResult?.geometry?.coordinates && rerouteResult.geometry.coordinates.length > 0) {
      const allPts: [number, number][] = rerouteResult.geometry.coordinates.map(
        ([lng, lat]): [number, number] => [lat, lng]
      );
      if (rerouteResult.original_geometry?.coordinates) {
        rerouteResult.original_geometry.coordinates.forEach(([lng, lat]) => {
          allPts.push([lat, lng]);
        });
      }
      const bounds = L.latLngBounds(allPts);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (routeStart && routeDest) {
      const bounds = L.latLngBounds([
        [routeStart.lat, routeStart.lng],
        [routeDest.lat, routeDest.lng],
      ]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    } else if (routeStart) {
      map.panTo([routeStart.lat, routeStart.lng]);
    } else if (route && route.alternate && route.alternate.length > 0) {
      const allPoints: [number, number][] = [
        ...route.alternate.map((p): [number, number] => [p.lat, p.lng]),
        ...route.usual.map((p): [number, number] => [p.lat, p.lng]),
      ];
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (selectedHotspot) {
      map.flyTo([selectedHotspot.lat, selectedHotspot.lng], 14, {
        duration: 0.8,
      });
    } else if (focus) {
      map.flyTo([focus.lat, focus.lng], 13, {
        duration: 0.8,
      });
    }
  }, [
    map,
    focus?.lat,
    focus?.lng,
    selectedHotspot?.id,
    route,
    rerouteResult,
    routeStart?.lat,
    routeStart?.lng,
    routeDest?.lat,
    routeDest?.lng,
  ]);

  return null;
}

/**
 * Tracks the map bounding box and alerts the parent MapView for grid queries.
 */
function MapBoundsController({
  onBoundsChange,
}: {
  onBoundsChange?: (bounds: {
    min_lat: number;
    max_lat: number;
    min_lng: number;
    max_lng: number;
  }) => void;
}) {
  const map = useMap();
  const cbRef = useState(() => onBoundsChange)[0];
  // Track last bounds to avoid re-triggering parent state when unchanged
  const lastKeyRef = useState<{ key: string }>({ key: "" })[0];

  useEffect(() => {
    if (!onBoundsChange) return;
    const notify = () => {
      const b = map.getBounds();
      const next = {
        min_lat: Number(b.getSouth().toFixed(4)),
        max_lat: Number(b.getNorth().toFixed(4)),
        min_lng: Number(b.getWest().toFixed(4)),
        max_lng: Number(b.getEast().toFixed(4)),
      };
      const key = `${next.min_lat},${next.max_lat},${next.min_lng},${next.max_lng}`;
      if (key !== lastKeyRef.key) {
        lastKeyRef.key = key;
        onBoundsChange(next);
      }
    };

    map.on("moveend", notify);
    return () => {
      map.off("moveend", notify);
    };
  }, [map, onBoundsChange, lastKeyRef]);

  return null;
}

function getHeatColor(score: number): { color: string; fillOpacity: number; label: string } {
  if (score >= 75) return { color: "#dc2626", fillOpacity: 0.52, label: "Severe" };
  if (score >= 50) return { color: "#ea580c", fillOpacity: 0.44, label: "High" };
  if (score >= 25) return { color: "#ca8a04", fillOpacity: 0.36, label: "Moderate" };
  return { color: "#16a34a", fillOpacity: 0.28, label: "Low" };
}

export function LeafletMapInner({
  hotspots,
  selectedId,
  onSelect,
  rainIntensity = 0,
  route,
  focus,
  focusLabel,
  className = "",
  gridPoints,
  reports = [],
  layers: externalLayers,
  onToggleLayer,
  onBoundsChange,
  gridLoading = false,
  onSelectReport,
  selectedReportId,
  routeStart,
  routeDest,
  pickingMode,
  onMapCoordinateClick,
  rerouteResult,
}: LeafletMapInnerProps) {
  // Internal layer toggle state if not controlled externally
  const [internalLayers, setInternalLayers] = useState<MapLayersState>({
    predictedRisk: true,
    historicalHotspots: true,
    citizenReports: true,
    affectedCorridors: false,
  });

  const layers = externalLayers ?? internalLayers;
  const toggleLayer = (key: keyof MapLayersState) => {
    if (onToggleLayer) {
      onToggleLayer(key);
    } else {
      setInternalLayers((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const selectedHotspot = useMemo(
    () => hotspots.find((h) => h.id === selectedId) ?? null,
    [hotspots, selectedId]
  );

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Filter valid reports with numeric coordinates
  const validReports = useMemo(() => {
    return reports.filter(
      (r) =>
        typeof r.lat === "number" &&
        typeof r.lng === "number" &&
        !isNaN(r.lat) &&
        !isNaN(r.lng) &&
        r.lat > 17.0 &&
        r.lat < 17.8 &&
        r.lng > 78.0 &&
        r.lng < 78.9
    );
  }, [reports]);

  // Compute cell radius dynamically based on point step spacing
  const heatCellRadius = useMemo(() => {
    if (!gridPoints || gridPoints.length < 2) return 1800;
    let minDiff = 0.02;
    for (let i = 1; i < Math.min(gridPoints.length, 16); i++) {
      const diff = Math.abs(gridPoints[i].lat - gridPoints[0].lat);
      if (diff > 0.002 && diff < minDiff) minDiff = diff;
    }
    return Math.max(1200, Math.min(2800, Math.round(minDiff * 111000 * 0.75)));
  }, [gridPoints]);

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-xl ${className}`}>
      <MapContainer
        center={focus ? [focus.lat, focus.lng] : HYDERABAD_CENTER}
        zoom={focus ? 13 : 12}
        scrollWheelZoom={true}
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewController
          focus={focus}
          selectedHotspot={selectedHotspot}
          route={route}
          rerouteResult={rerouteResult}
          routeStart={routeStart}
          routeDest={routeDest}
        />

        <MapClickHandler
          pickingMode={pickingMode}
          onMapCoordinateClick={onMapCoordinateClick}
        />

        <MapBoundsController onBoundsChange={onBoundsChange} />

        {/* ================= 1. Citywide Risk Heatmap (POST /risk/predict-grid) ================= */}
        {layers.predictedRisk &&
          gridPoints &&
          gridPoints.map((pt, idx) => {
            const heat = getHeatColor(pt.risk_score);
            return (
              <Circle
                key={`grid-${idx}-${pt.lat}-${pt.lng}`}
                center={[pt.lat, pt.lng]}
                radius={heatCellRadius}
                pathOptions={{
                  color: heat.color,
                  fillColor: heat.color,
                  fillOpacity: heat.fillOpacity,
                  weight: 1,
                  opacity: 0.25,
                }}
              >
                <Tooltip sticky>
                  <div className="p-1 space-y-1 font-sans text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-foreground">
                        {Math.round(pt.risk_score)}% Risk
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                        style={{ backgroundColor: heat.color }}
                      >
                        {pt.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Terrain Elevation: {Math.round(pt.elevation)}m
                    </p>
                    <p className="font-mono text-[9.5px] text-muted-foreground">
                      {pt.lat.toFixed(4)}°N, {pt.lng.toFixed(4)}°E
                    </p>
                    <p className="font-mono text-[9px] text-primary/80">
                      Model: POST /risk/predict-grid
                    </p>
                  </div>
                </Tooltip>
              </Circle>
            );
          })}

        {/* ================= 2. Historical Hotspots (Monitored 25 Locations) ================= */}
        {layers.historicalHotspots &&
          hotspots.map((h) => {
            const meta = RISK_META[h.severity];
            const isSelected = h.id === selectedId;
            const isHovered = h.id === hoveredId;
            const isHighOrSevere = h.severity === "severe" || h.severity === "high";

            return (
              <div key={h.id}>
                {/* Outer halo ring for high/severe risk */}
                {isHighOrSevere && (
                  <CircleMarker
                    center={[h.lat, h.lng]}
                    radius={isSelected ? 22 : 16}
                    pathOptions={{
                      color: meta.color,
                      fillColor: meta.color,
                      fillOpacity: 0.18,
                      weight: 1,
                    }}
                    interactive={false}
                  />
                )}

                {/* Core Hotspot Marker */}
                <CircleMarker
                  center={[h.lat, h.lng]}
                  radius={isSelected ? 11 : isHovered ? 9.5 : 8}
                  pathOptions={{
                    color: isSelected ? "#ffffff" : meta.color,
                    fillColor: meta.color,
                    fillOpacity: isSelected ? 1 : 0.88,
                    weight: isSelected ? 3 : 2,
                  }}
                  eventHandlers={{
                    click: () => onSelect?.(h.id),
                    mouseover: () => setHoveredId(h.id),
                    mouseout: () => setHoveredId(null),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -10]}>
                    <div className="p-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-xs leading-snug">{h.name}</p>
                        <span className="rounded bg-secondary/80 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                          Hotspot
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {h.ward} Ward · Documented historical bottleneck
                      </p>
                      <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
                        <span
                          className="h-2 w-2 rounded-full inline-block"
                          style={{ background: meta.color }}
                        />
                        <span className="font-semibold">{h.riskScore}% model risk</span>
                        <span>({meta.label})</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground/80 font-mono">
                        1 of 25 monitored GHMC locations
                      </p>
                    </div>
                  </Tooltip>
                </CircleMarker>
              </div>
            );
          })}

        {/* ================= 3. Citizen Reports Layer (Real GET /reports) ================= */}
        {layers.citizenReports &&
          validReports.map((rep) => {
            const severityColors: Record<string, string> = {
              ankle: "#0891b2",     // water cyan
              knee: "#ca8a04",      // amber
              waist: "#ea580c",     // orange
              submerged: "#dc2626", // red
            };
            const repColor = severityColors[rep.severity] || "#0891b2";
            const isSelected = rep.id === selectedReportId;

            return (
              <CircleMarker
                key={`report-${rep.id}`}
                center={[rep.lat, rep.lng]}
                radius={isSelected ? 11 : 8}
                pathOptions={{
                  color: isSelected ? "#7138cc" : "#ffffff",
                  fillColor: repColor,
                  fillOpacity: 0.95,
                  weight: isSelected ? 3 : 2,
                }}
                eventHandlers={{
                  click: () => onSelectReport?.(rep),
                }}
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  <div className="p-1 space-y-1.5 font-sans max-w-[230px]">
                    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                      <span className="font-bold text-xs flex items-center gap-1">
                        <span>Citizen Report</span>
                        {rep.ai_verified && (
                          <span className="rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200 px-1 py-0.2 text-[9px] font-mono">
                            AI Verified ✓
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground capitalize">
                        {rep.status}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-foreground leading-snug">
                      {rep.note || `Waterlogging reported at coordinates`}
                    </p>
                    <div className="text-[10.5px] text-muted-foreground space-y-0.5">
                      <p>
                        Severity:{" "}
                        <span className="font-semibold text-foreground capitalize">
                          {rep.severity}
                        </span>
                      </p>
                      {rep.ai_confidence != null && (
                        <p>
                          Vision Confidence:{" "}
                          <span className="font-semibold text-foreground">
                            {(rep.ai_confidence * 100).toFixed(0)}%
                          </span>
                        </p>
                      )}
                      {rep.corroboration_count > 0 && (
                        <p>
                          Confirmations:{" "}
                          <span className="font-semibold text-foreground">
                            {rep.corroboration_count} resident votes
                          </span>
                        </p>
                      )}
                      <p className="font-mono text-[9px] text-muted-foreground/70 pt-0.5">
                        {new Date(rep.timestamp).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}

        {/* ================= Around Me Scoped Radius Circle ================= */}
        {focus && (
          <>
            <Circle
              center={[focus.lat, focus.lng]}
              radius={(focus.radiusKm || 4.5) * 1000}
              pathOptions={{
                color: "#7138cc",
                fillColor: "#7138cc",
                fillOpacity: 0.09,
                weight: 2,
                dashArray: "6, 6",
              }}
            />
            <CircleMarker
              center={[focus.lat, focus.lng]}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                fillColor: "#7138cc",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span className="font-semibold text-xs text-primary">
                  {focusLabel || "Your Location"}
                </span>
              </Tooltip>
            </CircleMarker>
          </>
        )}

        {/* ================= User-Selected Route Markers ================= */}
        {routeStart && (
          <Marker
            position={[routeStart.lat, routeStart.lng]}
            icon={createPinIcon("start")}
          >
            <Tooltip permanent direction="top" offset={[0, -28]}>
              <span className="font-semibold text-xs text-foreground">
                📍 Start ({routeStart.lat.toFixed(4)}, {routeStart.lng.toFixed(4)})
              </span>
            </Tooltip>
          </Marker>
        )}

        {routeDest && (
          <Marker
            position={[routeDest.lat, routeDest.lng]}
            icon={createPinIcon("dest")}
          >
            <Tooltip permanent direction="top" offset={[0, -28]}>
              <span className="font-semibold text-xs text-foreground">
                🏁 Destination ({routeDest.lat.toFixed(4)}, {routeDest.lng.toFixed(4)})
              </span>
            </Tooltip>
          </Marker>
        )}

        {/* ================= Real Backend GeoJSON Route ================= */}
        {rerouteResult && (
          <>
            {/* Direct baseline route if comparison available */}
            {rerouteResult.original_geometry?.coordinates &&
              rerouteResult.original_geometry.coordinates.length > 1 && (
                <Polyline
                  positions={rerouteResult.original_geometry.coordinates.map(
                    ([lng, lat]): [number, number] => [lat, lng]
                  )}
                  pathOptions={{
                    color: "#ef4444",
                    weight: 3.5,
                    dashArray: "6, 6",
                    opacity: 0.85,
                  }}
                >
                  <Tooltip sticky>
                    <div className="p-1 space-y-0.5 font-sans">
                      <span className="text-xs font-bold text-destructive block">
                        Direct Baseline Route
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Passes through flood hazard area ({rerouteResult.original_distance_km} km · {rerouteResult.original_duration_minutes} min)
                      </p>
                    </div>
                  </Tooltip>
                </Polyline>
              )}

            {/* Safe alternate route (Solid cyan/emerald line) */}
            {rerouteResult.geometry?.coordinates &&
              rerouteResult.geometry.coordinates.length > 1 && (
                <>
                  <Polyline
                    positions={rerouteResult.geometry.coordinates.map(
                      ([lng, lat]): [number, number] => [lat, lng]
                    )}
                    pathOptions={{
                      color: "#06b6d4",
                      weight: 9,
                      opacity: 0.35,
                    }}
                  />
                  <Polyline
                    positions={rerouteResult.geometry.coordinates.map(
                      ([lng, lat]): [number, number] => [lat, lng]
                    )}
                    pathOptions={{
                      color: "#0891b2",
                      weight: 5,
                      opacity: 0.95,
                    }}
                  >
                    <Tooltip sticky>
                      <div className="p-1 space-y-1 font-sans max-w-[240px]">
                        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                          <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                            🟢 Safe Route
                          </span>
                          <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 font-semibold">
                            {rerouteResult.provider}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          {rerouteResult.distance_km} km · {rerouteResult.duration_minutes} min
                        </p>
                        {rerouteResult.added_distance_km != null &&
                          rerouteResult.added_distance_km > 0 && (
                            <p className="text-[10.5px] text-muted-foreground">
                              +{rerouteResult.added_distance_km} km detour (+{rerouteResult.added_duration_minutes} min)
                            </p>
                          )}
                        {rerouteResult.avoided_zones.length > 0 && (
                          <p className="text-[10px] text-muted-foreground pt-0.5">
                            Avoids: {rerouteResult.avoided_zones.join(", ")}
                          </p>
                        )}
                      </div>
                    </Tooltip>
                  </Polyline>
                </>
              )}
          </>
        )}

        {/* ================= Legacy Around-Me Route Overlay ================= */}
        {route && (
          <>
            {route.usual && route.usual.length > 1 && (
              <Polyline
                positions={route.usual.map((p) => [p.lat, p.lng])}
                pathOptions={{
                  color: "#ef4444",
                  weight: 4,
                  dashArray: "8, 8",
                  opacity: 0.8,
                }}
              >
                <Tooltip sticky>
                  <span className="text-xs font-semibold text-destructive">
                    Normal Route — Blocked by Waterlogging
                  </span>
                </Tooltip>
              </Polyline>
            )}

            {route.alternate && route.alternate.length > 1 && (
              <Polyline
                positions={route.alternate.map((p) => [p.lat, p.lng])}
                pathOptions={{
                  color: "#0891b2",
                  weight: 5,
                  opacity: 0.9,
                }}
              >
                <Tooltip sticky>
                  <span className="text-xs font-semibold text-water">
                    Alternate Route (+{route.extraMinutes} min, +{route.extraKm} km)
                  </span>
                </Tooltip>
              </Polyline>
            )}

            {/* Inundation Marker at Blocked Hotspot */}
            <CircleMarker
              center={[route.floodAt.lat, route.floodAt.lng]}
              radius={10}
              pathOptions={{
                color: "#ffffff",
                fillColor: "#dc2626",
                fillOpacity: 1,
                weight: 3,
              }}
            >
              <Tooltip permanent direction="bottom" offset={[0, 10]}>
                <span className="text-xs font-bold text-destructive">
                  Flooded Hazard Zone
                </span>
              </Tooltip>
            </CircleMarker>
          </>
        )}
      </MapContainer>

      {/* ================= ROUTE PICKING INSTRUCTION BANNER ================= */}
      {pickingMode && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-[400] -translate-x-1/2 rounded-full border border-primary/40 bg-card/95 px-4 py-2 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-foreground">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </span>
            <span>
              {pickingMode === "start"
                ? "Click anywhere on map to set Start location 📍"
                : pickingMode === "destination"
                ? "Click anywhere on map to set Destination 🏁"
                : "Click map to choose points: 1st = Start 📍, 2nd = Destination 🏁"}
            </span>
          </div>
        </div>
      )}

      {/* ================= HEATMAP LEGEND ================= */}
      {layers.predictedRisk && (
        <div className="pointer-events-auto absolute bottom-3 right-3 z-[400] rounded-xl border border-border/80 bg-card/90 px-3 py-2 shadow-lg backdrop-blur-md">
          <p className="mb-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            Risk Heatmap Scale
          </p>
          <div className="flex items-center gap-3 text-[11px] font-medium">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
              <span className="text-muted-foreground">&lt;25% Low</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#ca8a04]" />
              <span className="text-muted-foreground">25–49% Mod</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#ea580c]" />
              <span className="text-muted-foreground">50–74% High</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#dc2626]" />
              <span className="text-muted-foreground">≥75% Severe</span>
            </div>
          </div>
        </div>
      )}

      {/* ================= OPTIONAL RAIN SIMULATION OVERLAY ================= */}
      {rainIntensity > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          style={{ opacity: Math.min(0.65, 0.25 + rainIntensity / 120) }}
        >
          {Array.from({ length: 32 }, (_, i) => (
            <span
              key={i}
              className="absolute w-[1.5px]"
              style={{
                left: `${(i * 31.3) % 100}%`,
                top: 0,
                height: `${20 + (i % 5) * 8}px`,
                background:
                  "linear-gradient(180deg, transparent, rgba(8,145,178,0.7))",
                animation: `rain-fall-page ${1.2 + (i % 6) * 0.18}s linear ${
                  (i % 8) * 0.25
                }s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
