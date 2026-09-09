"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LocateFixed,
  Route,
  MapPin,
  Clock,
  TriangleAlert,
  ArrowUpRight,
  Loader2,
  Sparkles,
  User,
  X,
  Mail,
  ShieldCheck,
  CheckCircle2,
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
import { LOCALITIES, distanceKm } from "@/lib/flood/geo";
import { timeAgo } from "@/lib/flood/risk";
import { RISK_META, REPORT_SEVERITY_META } from "@/lib/flood/types";
import {
  floodSenseApi,
  type GridPredictionResponse,
  type RerouteResponse,
} from "@/lib/flood/api";
import { HyderabadMap } from "../map/hyderabad-map";
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

  // User Geolocation State
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"detecting" | "granted" | "denied" | "unavailable">("detecting");
  const [locationError, setLocationError] = useState<string | null>(null);

  // User Destination & Routing State
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [pickingDestination, setPickingDestination] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [rerouteResult, setRerouteResult] = useState<RerouteResponse | null>(null);
  const [lastAlertedRouteKey, setLastAlertedRouteKey] = useState<string | null>(null);

  // Profile Modal State
  const [showProfile, setShowProfile] = useState(false);

  // Grid Prediction State
  const [gridLoading, setGridLoading] = useState(false);
  const [areaPeakRisk, setAreaPeakRisk] = useState<number | null>(null);

  const locality =
    LOCALITIES.find((l) => l.id === userLocalityId) ?? LOCALITIES[0];

  // Effective Start Location: Browser Geolocation if granted, otherwise selected locality
  const effectiveStart = useMemo(() => {
    if (userLocation) return userLocation;
    return { lat: locality.lat, lng: locality.lng };
  }, [userLocation, locality]);

  // Request browser geolocation
  const requestLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationStatus("unavailable");
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setLocationStatus("detecting");
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(coords);
        setLocationStatus("granted");
        setLocationError(null);
        toast({
          title: "Location detected",
          description: `Current position: ${coords.lat.toFixed(4)}°N, ${coords.lng.toFixed(4)}°E`,
        });
      },
      (err) => {
        console.warn("Geolocation permission error:", err);
        setLocationStatus("denied");
        setLocationError("Location permission is required to detect your current location.");
        toast({
          title: "Location permission needed",
          description: "Using default locality. You can still select destination on map.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [toast]);

  // Automatically request location on mount
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // Scoped risk grid prediction around current effective location
  useEffect(() => {
    let active = true;
    setGridLoading(true);

    const deltaDeg = 0.04; // ~4.5 km box
    floodSenseApi
      .predictRiskGrid({
        min_lat: effectiveStart.lat - deltaDeg,
        max_lat: effectiveStart.lat + deltaDeg,
        min_lng: effectiveStart.lng - deltaDeg,
        max_lng: effectiveStart.lng + deltaDeg,
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
  }, [effectiveStart.lat, effectiveStart.lng, scenario.intensity]);

  const nearbyZones = useMemo(
    () =>
      hotspots
        .map((h) => ({
          h,
          km: distanceKm(effectiveStart.lat, effectiveStart.lng, h.lat, h.lng),
        }))
        .filter((x) => x.km <= RADIUS_KM + 8)
        .sort((a, b) => b.h.riskScore - a.h.riskScore)
        .slice(0, 3),
    [hotspots, effectiveStart]
  );

  const nearbyReports = useMemo(
    () =>
      reports
        .map((r) => ({
          r,
          km: distanceKm(effectiveStart.lat, effectiveStart.lng, r.lat, r.lng),
        }))
        .filter((x) => x.km <= RADIUS_KM + 8)
        .sort((a, b) => b.r.timestamp - a.r.timestamp)
        .slice(0, 2),
    [reports, effectiveStart]
  );

  // Handle map click when picking destination
  const handleMapCoordinateClick = (coord: { lat: number; lng: number }) => {
    if (pickingDestination || !destination) {
      setDestination(coord);
      setPickingDestination(false);
      // Reset previous route when destination changes
      setRerouteResult(null);
      toast({
        title: "Destination selected 🏁",
        description: `Coordinates: ${coord.lat.toFixed(4)}°N, ${coord.lng.toFixed(4)}°E`,
      });
    }
  };

  // Start Route action: validates inputs, invokes POST /routing/reroute with flood risk check and SMTP email
  const handleStartRoute = async () => {
    if (!effectiveStart || !destination) {
      toast({
        title: "Missing location",
        description: "Please ensure both your location and destination are set.",
        variant: "destructive",
      });
      return;
    }

    const distDelta = Math.hypot(
      effectiveStart.lat - destination.lat,
      effectiveStart.lng - destination.lng
    );
    if (distDelta < 0.001) {
      toast({
        title: "Same location",
        description: "Start and destination must be different locations.",
        variant: "destructive",
      });
      return;
    }

    // Determine whether to send email (only if genuine new route to prevent spam)
    const currentRouteKey = `${effectiveStart.lat.toFixed(3)},${effectiveStart.lng.toFixed(3)}->${destination.lat.toFixed(3)},${destination.lng.toFixed(3)}`;
    const shouldDispatchEmail = currentRouteKey !== lastAlertedRouteKey;

    setRoutingLoading(true);

    try {
      const res = await floodSenseApi.reroute({
        origin: effectiveStart,
        destination: destination,
        check_flood_risk: true,
        send_email_alert: shouldDispatchEmail,
      });

      setRerouteResult(res);

      if (res.is_hazard) {
        if (res.email_sent) {
          setLastAlertedRouteKey(currentRouteKey);
          toast({
            title: "⚠️ Flood Risk Detected — Alert Email Sent",
            description: `Route intersects ${res.affected_zones?.join(", ") || "waterlogged corridor"}. Alert delivered via Gmail SMTP.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "⚠️ Flood Risk Ahead",
            description: res.warning_message || "Route passes through high-risk waterlogging area.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Safe Route Planned ✓",
          description: `${res.distance_km} km · ${res.duration_minutes} min · Clear of high flood risk`,
        });
      }
    } catch (err: any) {
      console.error("Route calculation error:", err);
      toast({
        title: "Routing error",
        description: err.message || "Failed to calculate safe route. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleClearRoute = () => {
    setDestination(null);
    setRerouteResult(null);
    setPickingDestination(false);
    toast({
      title: "Route cleared",
      description: "You can click on the map to choose a new destination.",
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ScreenHeader
          eyebrow="Around me"
          title="Your Neighbourhood Risk & Safe Route"
          desc="Live location-based flood intelligence — detected coordinates, interactive destination routing, flood risk warnings and automated emergency alerts."
        />

        {/* Profile Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowProfile(true)}
          className="gap-2 text-xs font-semibold shadow-sm border-border/80 hover:border-primary/50"
          data-cursor="hover"
        >
          <User className="h-3.5 w-3.5 text-primary" />
          <span>Profile</span>
          {locationStatus === "granted" && (
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          )}
        </Button>
      </div>

      {/* locality & status bar */}
      <div className="glass-card flex flex-wrap items-center gap-3 rounded-xl p-4">
        <Button
          variant={locationStatus === "detecting" ? "secondary" : locationStatus === "granted" ? "outline" : "default"}
          onClick={requestLocation}
          disabled={locationStatus === "detecting"}
          className="gap-2"
          data-cursor="hover"
        >
          <motion.span
            animate={locationStatus === "detecting" ? { rotate: 360 } : { rotate: 0 }}
            transition={
              locationStatus === "detecting" ? { repeat: Infinity, duration: 1, ease: "linear" } : {}
            }
          >
            <LocateFixed className={`h-4 w-4 ${locationStatus === "granted" ? "text-emerald-400" : ""}`} />
          </motion.span>
          {locationStatus === "detecting"
            ? "Detecting location…"
            : locationStatus === "granted"
            ? "Location detected ✓"
            : "Enable location"}
        </Button>

        <div className="h-6 w-px bg-border" />

        {/* Fallback Locality Selector if GPS unavailable */}
        <div className="flex items-center gap-2">
          <Select
            value={locality.id}
            onValueChange={(val) => {
              setUserLocality(val);
              setDestination(null);
              setRerouteResult(null);
            }}
          >
            <SelectTrigger className="w-[200px]" aria-label="Choose locality">
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
        </div>

        {areaPeakRisk !== null && (
          <span className="hidden items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary sm:inline-flex">
            <Sparkles className="h-3 w-3" />
            Corridor Risk: {areaPeakRisk}%
          </span>
        )}

        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {effectiveStart.lat.toFixed(4)}°N, {effectiveStart.lng.toFixed(4)}°E · {RADIUS_KM} km radius
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        {/* Radius Map with Live Geolocation and Route Layers */}
        <div className="glass-card relative overflow-hidden rounded-xl">
          <div className="relative h-[420px] md:h-[540px]">
            <HyderabadMap
              hotspots={hotspots}
              onSelect={(id) => {
                if (id) {
                  selectHotspot(id);
                  setView("map");
                }
              }}
              focus={{
                lat: effectiveStart.lat,
                lng: effectiveStart.lng,
                radiusKm: RADIUS_KM,
              }}
              focusLabel={userLocation ? "YOU ARE HERE" : `${locality.name.toUpperCase()} · 4.5 KM`}
              routeStart={effectiveStart}
              routeDest={destination}
              pickingMode={pickingDestination ? "destination" : null}
              onMapCoordinateClick={handleMapCoordinateClick}
              rerouteResult={rerouteResult}
              rainIntensity={scenario.intensity}
            />

            {routingLoading && (
              <div className="absolute top-3 right-3 z-[500] flex items-center gap-2 rounded-md bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md border border-primary/30">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Calculating safe route & evaluating flood risk…
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
              {userLocation ? "📍 Real GPS position active" : `zoomed to · ${locality.name}`}
            </p>
            {destination && (
              <span className="font-mono text-[10.5px] text-primary">
                🏁 Destination: {destination.lat.toFixed(4)}°N, {destination.lng.toFixed(4)}°E
              </span>
            )}
          </div>
        </div>

        {/* Side panels: Route Planner + Route Result + Risk Zones + Reports */}
        <div className="space-y-4">
          {/* ================= ROUTE PLANNING SECTION ================= */}
          <div className="glass-card rounded-xl p-4 space-y-3.5 border border-border/80">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
                <Route className="h-4 w-4 text-primary" />
                Safety Route Planner
              </p>
              {rerouteResult && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearRoute}
                  className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2"
                >
                  Clear Route
                </Button>
              )}
            </div>

            {/* YOUR LOCATION */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span>YOUR LOCATION</span>
                {locationStatus === "granted" ? (
                  <span className="flex items-center gap-1 text-[10.5px] font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Location detected
                  </span>
                ) : (
                  <span className="text-[10.5px] text-amber-400">
                    {locationStatus === "detecting" ? "Detecting…" : "Permission needed"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-xs">
                <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate font-mono">
                  {effectiveStart.lat.toFixed(4)}°N, {effectiveStart.lng.toFixed(4)}°E
                  {userLocation ? " (GPS)" : ` (${locality.name})`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={requestLocation}
                  disabled={locationStatus === "detecting"}
                  className="ml-auto h-6 px-2 text-[10.5px] text-primary hover:bg-primary/10"
                >
                  {locationStatus === "detecting" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
                </Button>
              </div>
              {locationError && (
                <p className="text-[11px] text-amber-400/90 leading-tight pt-0.5">
                  ⚠️ {locationError}
                </p>
              )}
            </div>

            {/* DESTINATION */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                <span>DESTINATION</span>
                {destination && (
                  <span className="text-[10.5px] text-primary font-medium">Selected</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-xs">
                  <span className="text-sm">🏁</span>
                  <span className="truncate font-mono">
                    {destination
                      ? `${destination.lat.toFixed(4)}°N, ${destination.lng.toFixed(4)}°E`
                      : "Click on map to select destination"}
                  </span>
                </div>
                <Button
                  variant={pickingDestination ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setPickingDestination(!pickingDestination)}
                  className="h-9 px-3 text-xs shrink-0 font-semibold"
                >
                  {pickingDestination ? "Cancel" : destination ? "Change" : "Select on map"}
                </Button>
              </div>
            </div>

            {/* START ROUTE BUTTON */}
            <Button
              onClick={handleStartRoute}
              disabled={routingLoading || !destination}
              className="w-full gap-2 font-semibold shadow-lg shadow-primary/20"
            >
              {routingLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculating Route & Checking Flood Risk…
                </>
              ) : (
                <>
                  <Route className="h-4 w-4" />
                  Start Route
                </>
              )}
            </Button>
          </div>

          {/* ================= ROUTE RESULT & FLOOD RISK WARNING ================= */}
          {rerouteResult && (
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className={`glass-card rounded-xl p-4 space-y-3.5 border ${
                  rerouteResult.is_hazard
                    ? "border-destructive/60 bg-gradient-to-br from-destructive/15 via-background to-transparent"
                    : "border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-background to-transparent"
                }`}
              >
                {/* Status Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {rerouteResult.is_hazard ? (
                      <TriangleAlert className="h-5 w-5 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    )}
                    <div>
                      <h4
                        className={`text-xs font-bold uppercase tracking-wider ${
                          rerouteResult.is_hazard ? "text-destructive" : "text-emerald-400"
                        }`}
                      >
                        {rerouteResult.is_hazard
                          ? "⚠️ FLOOD RISK DETECTED"
                          : "SAFE ROUTE"}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        via {rerouteResult.provider}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      rerouteResult.is_hazard
                        ? "bg-destructive/20 text-destructive border border-destructive/30"
                        : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    Exposure: {rerouteResult.exposure_level || "NONE"}
                  </span>
                </div>

                {/* Flood Warning Banner if Hazard */}
                {rerouteResult.is_hazard && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs space-y-1.5">
                    <p className="font-bold text-destructive">
                      ⚠️ FLOOD RISK AHEAD
                    </p>
                    <p className="text-foreground/90 text-[11.5px] leading-relaxed">
                      Your selected route passes through a predicted high-risk waterlogging region. Consider an alternate route.
                    </p>
                    {rerouteResult.affected_zones && rerouteResult.affected_zones.length > 0 && (
                      <div className="pt-1 text-[11px]">
                        <span className="text-muted-foreground">Affected zone: </span>
                        <span className="font-semibold text-destructive">
                          {rerouteResult.affected_zones.join(", ")}
                        </span>
                        {rerouteResult.max_risk_score ? (
                          <span className="font-mono text-muted-foreground ml-1.5">
                            ({rerouteResult.max_risk_score}% risk)
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* Clear Route Banner if Safe */}
                {!rerouteResult.is_hazard && (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-300 font-medium flex items-center gap-2">
                    <span>✓</span>
                    <span>Route currently clear of high/severe flood-risk zones.</span>
                  </div>
                )}

                {/* Route Metrics */}
                <div className="grid grid-cols-2 gap-2 text-xs border-t border-border/50 pt-2.5">
                  <div className="rounded-lg bg-secondary/30 p-2 border border-border/40">
                    <span className="text-muted-foreground block text-[10px] uppercase">Distance</span>
                    <span className="font-bold font-mono text-sm text-foreground">
                      {rerouteResult.distance_km} km
                    </span>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2 border border-border/40">
                    <span className="text-muted-foreground block text-[10px] uppercase">Est. Travel Time</span>
                    <span className="font-bold font-mono text-sm text-foreground">
                      {rerouteResult.duration_minutes} min
                    </span>
                  </div>
                </div>

                {/* SMTP Email Alert Status */}
                {rerouteResult.is_hazard && (
                  <div className="border-t border-border/50 pt-2.5 text-xs">
                    {rerouteResult.email_sent ? (
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 p-2 text-emerald-300">
                        <Mail className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div>
                          <p className="font-semibold text-[11.5px]">Alert email sent</p>
                          <p className="text-[10px] text-emerald-400/80">
                            Delivered to prajwal.ff1234@gmail.com, kjaathvika@gmail.com
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-950/40 border border-amber-500/30 p-2 text-amber-300">
                        <TriangleAlert className="h-4 w-4 text-amber-400 shrink-0" />
                        <p className="text-[11px]">
                          {rerouteResult.email_status || "Flood warning detected, but email delivery failed."}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
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
                No citizen reports logged near this area yet.
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

      {/* ================= PROFILE MODAL ================= */}
      <AnimatePresence>
        {showProfile && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card w-full max-w-md rounded-2xl border border-border p-6 shadow-2xl relative bg-card/95"
            >
              <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-base text-foreground">User Profile</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowProfile(false)}
                  className="h-7 w-7 p-0 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4 text-xs">
                {/* Name */}
                <div className="rounded-lg bg-secondary/30 p-3 border border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
                    Name
                  </span>
                  <span className="font-semibold text-sm text-foreground">Prajwal</span>
                </div>

                {/* Account Email */}
                <div className="rounded-lg bg-secondary/30 p-3 border border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
                    Sender Email
                  </span>
                  <span className="font-mono text-foreground">prajwalupadhyay23@gmail.com</span>
                </div>

                {/* Emergency Alert Recipients */}
                <div className="rounded-lg bg-secondary/30 p-3 border border-border/50 space-y-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                    Emergency Alert Recipients
                  </span>
                  <div className="flex items-center gap-2 text-foreground font-mono">
                    <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>prajwal.ff1234@gmail.com</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground font-mono">
                    <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>kjaathvika@gmail.com</span>
                  </div>
                </div>

                {/* Location Permission Status */}
                <div className="rounded-lg bg-secondary/30 p-3 border border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
                    Browser Location Status
                  </span>
                  {locationStatus === "granted" ? (
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <ShieldCheck className="h-4 w-4" />
                      <span>✓ Browser location enabled</span>
                      <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                        ({effectiveStart.lat.toFixed(4)}, {effectiveStart.lng.toFixed(4)})
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-400 font-semibold">
                      <TriangleAlert className="h-4 w-4" />
                      <span>⚠ Location permission not granted</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowProfile(false)}
                  className="px-4"
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
