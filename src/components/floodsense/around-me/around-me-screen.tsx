"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LocateFixed, Route, MapPin, Clock, MessageSquare, TriangleAlert, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFloodStore } from "@/lib/flood/store";
import { LOCALITIES, distanceKm, detourPolyline } from "@/lib/flood/geo";
import { timeAgo } from "@/lib/flood/risk";
import { RISK_META, REPORT_SEVERITY_META } from "@/lib/flood/types";
import { HyderabadMap } from "../map/hyderabad-map";
import type { RouteOverlayData } from "../map/route-overlay";
import { RouteStats } from "../map/route-overlay";
import { RiskBadge, ScreenHeader } from "../shared/risk-widgets";

const RADIUS_KM = 4.5;

export function AroundMeScreen() {
  const { userLocalityId, setUserLocality, hotspots, reports, selectHotspot, setView, scenario } =
    useFloodStore();
  const { toast } = useToast();
  const [locating, setLocating] = useState(false);
  const [showRoute, setShowRoute] = useState(true);

  const locality = LOCALITIES.find((l) => l.id === userLocalityId) ?? LOCALITIES[0];

  const nearbyZones = useMemo(
    () =>
      hotspots
        .map((h) => ({ h, km: distanceKm(locality.lat, locality.lng, h.lat, h.lng) }))
        .filter((x) => x.km <= RADIUS_KM + 8)
        .sort((a, b) => b.h.riskScore - a.h.riskScore)
        .slice(0, 3),
    [hotspots, locality]
  );

  const nearbyReports = useMemo(
    () =>
      reports
        .map((r) => ({ r, km: distanceKm(locality.lat, locality.lng, r.lat, r.lng) }))
        .filter((x) => x.km <= RADIUS_KM + 8)
        .sort((a, b) => b.r.timestamp - a.r.timestamp)
        .slice(0, 2),
    [reports, locality]
  );

  const worst = nearbyZones[0];

  const route: RouteOverlayData | null = useMemo(() => {
    if (!worst || !showRoute) return null;
    const origin = { lat: locality.lat, lng: locality.lng };
    const dest = { lat: locality.lat + 0.052, lng: locality.lng + 0.062 };
    return {
      usual: [origin, { lat: worst.h.lat, lng: worst.h.lng }, dest],
      alternate: detourPolyline(origin, dest, { lat: worst.h.lat, lng: worst.h.lng }),
      floodAt: { lat: worst.h.lat, lng: worst.h.lng },
      labelA: locality.name.split(" ")[0],
      labelB: "Destination",
      extraMinutes: 9,
      extraKm: 3.4,
    };
  }, [worst, locality, showRoute]);

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
        eyebrow="Around me · radius scoped"
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
          <motion.span animate={locating ? { rotate: 360 } : { rotate: 0 }} transition={locating ? { repeat: Infinity, duration: 1, ease: "linear" } : {}}>
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
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {nearbyZones.length} risk zones · {nearbyReports.length} live reports · {RADIUS_KM} km radius
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        {/* radius map */}
        <div className="glass-card relative overflow-hidden rounded-xl">
          <div className="relative h-[380px] md:h-[480px]">
            <HyderabadMap
              hotspots={hotspots}
              onSelect={(id) => { if (id) { selectHotspot(id); setView("map"); } }}
              focus={{ lat: locality.lat, lng: locality.lng, radiusKm: RADIUS_KM }}
              focusLabel={`${locality.name.toUpperCase()} · 4.5 KM`}
              route={route}
              rainIntensity={scenario.intensity}
            />
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              zoomed city model · {locality.name}
            </p>
            {worst && (
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showRoute}
                  onChange={(e) => setShowRoute(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#7138cc]"
                />
                show suggested route
              </label>
            )}
          </div>
        </div>

        {/* side feed */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <TriangleAlert className="h-4 w-4 text-risk-high" />
              {nearbyZones.length} predicted risk zones nearby
            </p>
            <div className="space-y-2.5">
              {nearbyZones.map(({ h, km }, i) => (
                <motion.button
                  key={h.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => { selectHotspot(h.id); setView("map"); }}
                  data-cursor="hover"
                  className="w-full rounded-xl border border-border bg-secondary/40 p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/70"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium">{h.name}</p>
                    <RiskBadge level={h.severity} size="sm" />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 font-mono text-[10.5px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {km.toFixed(1)} km
                    </span>
                    <span className="ml-auto font-semibold" style={{ color: RISK_META[h.severity].color }}>
                      {h.riskScore}% risk
                    </span>
                  </div>
                </motion.button>
              ))}
              {nearbyZones.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  No predicted zones within {RADIUS_KM} km right now.
                </p>
              )}
            </div>
          </div>

          <div className="glass-card rounded-xl p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-water" />
              {nearbyReports.length} community report{nearbyReports.length === 1 ? "" : "s"} nearby
            </p>
            <div className="space-y-2.5">
              {nearbyReports.map(({ r, km }) => (
                <div key={r.id} className="rounded-xl border border-border bg-secondary/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-medium">{r.location}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        color: REPORT_SEVERITY_META[r.severity].color,
                        background: `${REPORT_SEVERITY_META[r.severity].color}14`,
                      }}
                    >
                      {REPORT_SEVERITY_META[r.severity].label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 font-mono text-[10.5px] text-muted-foreground">
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{km.toFixed(1)} km</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(r.timestamp)}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3" /> {r.upvotes}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* suggested route */}
          <AnimatePresence>
            {route && worst && (
              <motion.div
                key="route"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-xl p-4"
                style={{ borderColor: "rgba(34, 211, 238, 0.25)" }}
              >
                <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <Route className="h-4 w-4 text-water" />
                  Suggested route — avoids {worst.h.name}
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Via {worst.h.affectedRoads[0]} avoided · re-routed through the Inner Ring corridor.
                </p>
                <RouteStats route={route} />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full gap-1.5"
                  onClick={() => { selectHotspot(worst.h.id); setView("map"); }}
                >
                  Open in city map <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
