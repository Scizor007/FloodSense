"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LocateFixed,
  Route,
  MapPin,
  Clock,
  MessageSquare,
  TriangleAlert,
  ArrowUpRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFloodStore } from "@/lib/flood/store";
import { LOCALITIES, distanceKm, detourPolyline } from "@/lib/flood/geo";
import { timeAgo } from "@/lib/flood/risk";
import { RISK_META, REPORT_SEVERITY_META } from "@/lib/flood/types";
import {
  floodSenseApi,
  type GridPredictionResponse,
  type RerouteResponse,
} from "@/lib/flood/api";
import { HyderabadMap } from "../map/hyderabad-map";
import type { RouteOverlayData } from "../map/route-overlay";
import { RouteStats } from "../map/route-overlay";
import { RiskBadge, ScreenHeader } from "../shared/risk-widgets";

const RADIUS_KM = 4.5;

export function AroundMeScreen() {
  const {
    userLocalityId,
    setUserLocality,
    hotspots,
    reports,
    selectHotspot,
    setView,
    scenario,
  } = useFloodStore();
  const { toast } = useToast();

  const [locating, setLocating] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const [route, setRoute] = useState<RouteOverlayData | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [areaPeakRisk, setAreaPeakRisk] = useState<number | null>(null);

  const locality =
    LOCALITIES.find((l) => l.id === userLocalityId) ?? LOCALITIES[0];

  // Scoped risk grid prediction around selected locality
  useEffect(() => {
    let active = true;
    setGridLoading(true);

    const deltaDeg = 0.04; // ~4.5 km box
    floodSenseApi
      .predictRiskGrid({
        min_lat: locality.lat - deltaDeg,
        max_lat: locality.lat + deltaDeg,
        min_lng: locality.lng - deltaDeg,
        max_lng: locality.lng + deltaDeg,
        grid_resolution: 5,
        rainfall_intensity: scenario.intensity > 0 ? scenario.intensity : 20,
        duration_minutes: 60,
      })
      .then((res: GridPredictionResponse) => {
        if (!active) return;
        if (res.grid && res.grid.length > 0) {
          const maxRisk = Math.max(...res.grid.map((g) => g.risk_score));
          setAreaPeakRisk(Math.round(maxRisk));
        }
        setGridLoading(false);
      })
      .catch((err) => {
        console.warn("Could not fetch scoped risk grid:", err);
        if (active) setGridLoading(false);
      });

    return () => {
      active = false;
    };
  }, [locality.id, locality.lat, locality.lng, scenario.intensity]);

  const nearbyZones = useMemo(
    () =>
      hotspots
        .map((h) => ({
          h,
          km: distanceKm(locality.lat, locality.lng, h.lat, h.lng),
        }))
        .filter((x) => x.km <= RADIUS_KM + 8)
        .sort((a, b) => b.h.riskScore - a.h.riskScore)
        .slice(0, 3),
    [hotspots, locality]
  );

  const nearbyReports = useMemo(
    () =>
      reports
        .map((r) => ({
          r,
          km: distanceKm(locality.lat, locality.lng, r.lat, r.lng),
        }))
        .filter((x) => x.km <= RADIUS_KM + 8)
        .sort((a, b) => b.r.timestamp - a.r.timestamp)
        .slice(0, 2),
    [reports, locality]
  );

  const worst = nearbyZones[0];

  // Wire suggested route to real POST /routing/reroute
  useEffect(() => {
    if (!worst || !showRoute) {
      setRoute(null);
      return;
    }

    let active = true;
    setRoutingLoading(true);

    const origin = { lat: locality.lat, lng: locality.lng };
    const dest = { lat: locality.lat + 0.052, lng: locality.lng + 0.062 };
    const floodAt = { lat: worst.h.lat, lng: worst.h.lng };

    floodSenseApi
      .reroute({
        origin,
        destination: dest,
        avoid_hotspot_ids: [worst.h.id],
      })
      .then((res: RerouteResponse) => {
        if (!active) return;
        const alternate =
          res.geometry?.coordinates && res.geometry.coordinates.length > 0
            ? res.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
            : detourPolyline(origin, dest, floodAt);

        setRoute({
          usual: [origin, floodAt, dest],
          alternate,
          floodAt,
          labelA: locality.name.split(" ")[0],
          labelB: "Destination",
          extraMinutes: Math.round(res.duration_minutes) || 9,
          extraKm: Math.round(res.distance_km * 10) / 10 || 3.4,
        });
        setRoutingLoading(false);
      })
      .catch((err) => {
        console.warn("Fallback to local detour route in AroundMe:", err);
        if (!active) return;
        setRoute({
          usual: [origin, floodAt, dest],
          alternate: detourPolyline(origin, dest, floodAt),
          floodAt,
          labelA: locality.name.split(" ")[0],
          labelB: "Destination",
          extraMinutes: 9,
          extraKm: 3.4,
        });
        setRoutingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [worst?.h.id, locality.id, showRoute]);

  const handleLocate = () => {
    setLocating(true);
    setTimeout(() => {
      setLocating(false);
      setUserLocality("moosarambagh");
      toast({
        title: "Location detected",
        description: "Approx. Moosarambagh, Amberpet",
      });
    }, 1100);
  };

  return (
    <div className="space-y-5">
      <ScreenHeader
        eyebrow="Around me"
        title="Your Neighbourhood Risk"
        desc="Everything within ~5 km of your locality — predicted zones, live community reports and a safe way through."
      />

      {/* locality controls */}
      <div className="glass-card flex flex-wrap items-center gap-3 rounded-xl p-4">
        <Button
          variant={locating ? "secondary" : "default"}
          onClick={handleLocate}
          disabled={locating}
          className="gap-2"
          data-cursor="hover"
        >
          <motion.span
            animate={locating ? { rotate: 360 } : { rotate: 0 }}
            transition={
              locating ? { repeat: Infinity, duration: 1, ease: "linear" } : {}
            }
          >
            <LocateFixed className="h-4 w-4" />
          </motion.span>
          {locating ? "Detecting…" : "Use my location"}
        </Button>

        <div className="h-6 w-px bg-border" />

        <Select value={locality.id} onValueChange={setUserLocality}>
          <SelectTrigger className="w-[220px]" aria-label="Choose locality">
            <MapPin className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALITIES.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {areaPeakRisk !== null && (
          <span className="hidden items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary sm:inline-flex">
            <Sparkles className="h-3 w-3" />
            Neighbourhood Peak Risk: {areaPeakRisk}%
          </span>
        )}

        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {nearbyZones.length} risk zones · {nearbyReports.length} live reports ·{" "}
          {RADIUS_KM} km radius
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* radius map */}
        <div className="glass-card relative overflow-hidden rounded-xl">
          <div className="relative h-[380px] md:h-[480px]">
            <HyderabadMap
              hotspots={hotspots}
              onSelect={(id) => {
                if (id) {
                  selectHotspot(id);
                  setView("map");
                }
              }}
              focus={{
                lat: locality.lat,
                lng: locality.lng,
                radiusKm: RADIUS_KM,
              }}
              focusLabel={`${locality.name.toUpperCase()} · 4.5 KM`}
              route={route}
              rainIntensity={scenario.intensity}
            />

            {routingLoading && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs font-medium text-muted-foreground backdrop-blur-md">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Calculating safe route…
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              zoomed to · {locality.name}
            </p>
            {worst && (
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showRoute}
                  onChange={(e) => setShowRoute(e.target.checked)}
                  className="rounded border-border"
                />
                Show alternate route on map
              </label>
            )}
          </div>
        </div>

        {/* side panels: route hint + nearby lists */}
        <div className="space-y-4">
          {/* detour card */}
          {worst && route && showRoute && (
            <div className="glass-card rounded-xl border border-water/30 bg-gradient-to-br from-water/10 to-transparent p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-semibold text-water">
                  <Route className="h-4 w-4" />
                  Recommended detour
                </p>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  avoiding {worst.h.name.split(" ")[0]}
                </span>
              </div>
              <p className="text-sm font-semibold">
                Avoid {worst.h.name} ({worst.h.riskScore}% risk)
              </p>
              <p className="mt-1 text-[15.5px] leading-[1.65] text-muted-foreground">
                Usual corridor is likely waterlogged. Alternate route calculated via OpenRouteService avoids the flooded polygon.
              </p>
              <div className="mt-3">
                <RouteStats route={route} />
              </div>
            </div>
          )}

          {/* nearby risk zones */}
          <div className="glass-card rounded-xl p-4">
            <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Risk zones near you</span>
              <span className="font-mono text-[10px] lowercase text-muted-foreground/70">
                within 12 km
              </span>
            </p>
            {nearbyZones.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No active waterlogging zones near this location.
              </p>
            ) : (
              <div className="space-y-2">
                {nearbyZones.map(({ h, km }) => (
                  <div
                    key={h.id}
                    onClick={() => {
                      selectHotspot(h.id);
                      setView("map");
                    }}
                    data-cursor="hover"
                    className="group flex cursor-pointer items-start justify-between rounded-lg border border-border/60 bg-secondary/30 p-2.5 transition-colors hover:border-primary/40 hover:bg-secondary/60"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-semibold">{h.name}</p>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          {km.toFixed(1)} km
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                        {h.affectedRoads[0]}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RiskBadge level={h.severity} size="sm" />
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* nearby community reports */}
          <div className="glass-card rounded-xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Live reports in neighbourhood
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] text-primary"
                onClick={() => setView("report")}
              >
                + Submit
              </Button>
            </div>
            {nearbyReports.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No citizen reports logged near {locality.name} yet.
              </p>
            ) : (
              <div className="space-y-2">
                {nearbyReports.map(({ r, km }) => {
                  const meta = REPORT_SEVERITY_META[r.severity];
                  return (
                    <div
                      key={r.id}
                      className="rounded-lg border border-border/60 bg-secondary/30 p-2.5"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-foreground">{r.location}</span>
                        <span className="font-mono text-muted-foreground">
                          {km.toFixed(1)} km away
                        </span>
                      </div>
                      {r.note && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          “{r.note}”
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                        <span
                          className="font-medium"
                          style={{ color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        <span>{timeAgo(r.timestamp)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
