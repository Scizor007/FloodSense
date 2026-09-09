"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar, Play, RotateCcw, MapPin, Route, X, Activity, Droplets, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useFloodStore } from "@/lib/flood/store";
import { MODEL_LOG_LINES, timeAgo } from "@/lib/flood/risk";
import { detourPolyline, LOCALITIES } from "@/lib/flood/geo";
import { RISK_META, RISK_ORDER } from "@/lib/flood/types";
import type { HotspotLive } from "@/lib/flood/types";
import { HyderabadMap } from "./hyderabad-map";
import type { RouteOverlayData } from "./route-overlay";
import { RouteStats } from "./route-overlay";
import { RiskGauge, RiskBadge, SeverityBar, ScreenHeader } from "../shared/risk-widgets";

const DURATIONS = [
  { value: 0.5, label: "30 minutes" },
  { value: 1, label: "1 hour" },
  { value: 2, label: "2 hours" },
  { value: 3, label: "3 hours" },
  { value: 6, label: "6 hours" },
];

function buildRoute(h: HotspotLive): RouteOverlayData {
  const origin = { lat: h.lat - 0.028, lng: h.lng - 0.045 };
  const dest = { lat: h.lat + 0.03, lng: h.lng + 0.04 };
  const floodAt = { lat: h.lat, lng: h.lng };
  return {
    usual: [origin, floodAt, dest],
    alternate: detourPolyline(origin, dest, floodAt),
    floodAt,
    labelA: "Your start",
    labelB: "Destination",
    extraMinutes: 8 + (h.name.length % 9),
    extraKm: 3 + (h.riskScore % 5),
  };
}

export function MapView() {
  const { hotspots, scenario, predictionRanAt, selectedHotspotId, selectHotspot, runPrediction, resetScenario } =
    useFloodStore();
  const { toast } = useToast();

  const [intensity, setIntensity] = useState(scenario.intensity || 0);
  const [duration, setDuration] = useState(String(scenario.durationHours || 1));
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [logIdx, setLogIdx] = useState(0);
  const [route, setRoute] = useState<RouteOverlayData | null>(null);

  const selected = hotspots.find((h) => h.id === selectedHotspotId) ?? null;
  const topHotspots = useMemo(
    () => [...hotspots].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6),
    [hotspots]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { low: 0, moderate: 0, high: 0, severe: 0 };
    hotspots.forEach((h) => (c[h.severity] += 1));
    return c;
  }, [hotspots]);

  // prediction "computation" theatre
  useEffect(() => {
    if (phase !== "running") return;
    if (logIdx < MODEL_LOG_LINES.length) {
      const t = setTimeout(() => setLogIdx((i) => i + 1), 320);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      const before = hotspots.filter((h) => h.severity === "severe").length;
      const next = runPrediction({
        intensity,
        durationHours: parseFloat(duration),
      });
      const after = next.filter((h) => h.severity === "severe").length;
      setPhase("idle");
      setLogIdx(0);
      const escalated = Math.max(0, after - before);
      toast({
        title: "Prediction updated",
        description: `25 hotspots re-scored under ${intensity} mm/hr · ${
          escalated > 0 ? `${escalated} escalated to severe — alerts dispatched` : "no severe escalations"
        }`,
      });
    }, 420);
    return () => clearTimeout(t);
  }, [phase, logIdx]);

  const rainVisual = phase === "running" ? intensity : scenario.intensity;

  return (
    <div className="space-y-5">
      <ScreenHeader
        eyebrow="Live map"
        title="Waterlogging Risk Map"
        desc="Predicted street-level risk across 25 monitored hotspots. Click a marker for corridor detail and alternate routing."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {RISK_ORDER.map((l) => (
              <span
                key={l}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium"
                style={{ color: RISK_META[l].color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: RISK_META[l].color }} />
                <span className="font-mono tabular-nums">{counts[l]}</span> {RISK_META[l].label}
              </span>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        {/* rainfall scenario simulator */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-4">
            <div className="mb-1 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Radar className="h-4 w-4 text-primary" />
                Rainfall Scenario Simulator
              </p>
              {predictionRanAt && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  ran {timeAgo(predictionRanAt)}
                </span>
              )}
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              See how different rainfall levels change the risk map.
            </p>

            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-xs text-muted-foreground">Intensity</label>
              <span className="font-mono text-sm font-semibold text-water tabular-nums">
                {intensity} mm/hr
              </span>
            </div>
            <Slider
              value={[intensity]}
              min={0}
              max={80}
              step={5}
              onValueChange={([v]) => setIntensity(v)}
              aria-label="Rainfall intensity"
            />
            <div className="mt-1.5 flex justify-between font-mono text-[9px] text-muted-foreground">
              <span>drizzle</span><span>cloudburst</span>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs text-muted-forecast text-muted-foreground">Duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                className="flex-1 gap-1.5"
                disabled={phase === "running"}
                onClick={() => {
                  setRoute(null);
                  setPhase("running");
                  setLogIdx(0);
                }}
                data-cursor="hover"
              >
                <Play className="h-3.5 w-3.5" />
                {phase === "running" ? "Computing…" : "Run Prediction"}
              </Button>
              {(scenario.intensity > 0 || predictionRanAt) && (
                <Button variant="outline" size="icon" onClick={() => { resetScenario(); setIntensity(0); setRoute(null); }} aria-label="Reset scenario">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>

            <AnimatePresence>
              {phase === "running" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3 font-mono text-[10px] leading-relaxed">
                    {MODEL_LOG_LINES.slice(0, logIdx).map((l, i) => (
                      <motion.p key={l} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="text-muted-foreground">
                        <span className="text-primary">›</span> {l} <span className="text-risk-low">✓</span>
                      </motion.p>
                    ))}
                    {logIdx < MODEL_LOG_LINES.length && (
                      <p className="text-water"><span className="animate-pulse">▍</span> running…</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* legend */}
          <div className="glass-card rounded-xl p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              Risk legend
            </p>
            <div className="space-y-2">
              {[
                { l: "low", range: "0 – 34", hint: "passable" },
                { l: "moderate", range: "35 – 54", hint: "slow traffic" },
                { l: "high", range: "55 – 74", hint: "lane closures" },
                { l: "severe", range: "75 – 100", hint: "impassable" },
              ].map(({ l, range, hint }) => (
                <div key={l} className="flex items-center gap-2.5 text-xs">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{
                      background: RISK_META[l as keyof typeof RISK_META].color,
                      boxShadow: `0 0 8px ${RISK_META[l as keyof typeof RISK_META].color}80`,
                    }}
                  />
                  <span className="w-16 font-medium capitalize">{RISK_META[l as keyof typeof RISK_META].label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{range}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{hint}</span>
                </div>
              ))}
            </div>
            {scenario.intensity > 0 && (
              <p className="mt-3 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
                Scenario active: <span className="font-mono text-water">{scenario.intensity} mm/hr</span> ·{" "}
                <span className="font-mono">{scenario.durationHours} hr</span>
              </p>
            )}
          </div>
        </div>

        {/* map + right detail column */}
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="glass-card relative overflow-hidden rounded-xl">
            <div className="relative h-[430px] md:h-[540px] xl:h-[640px]">
              <HyderabadMap
                hotspots={hotspots}
                selectedId={selectedHotspotId}
                onSelect={(id) => { selectHotspot(id); if (id) setRoute(null); }}
                rainIntensity={rainVisual}
                route={route}
              />

              {/* scan effect while predicting */}
              <AnimatePresence>
                {phase === "running" && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
                  >
                    <div
                      className="absolute left-0 right-0 h-24"
                      style={{
                        background: "linear-gradient(180deg, transparent, rgba(113,56,204,0.22), rgba(34,211,238,0.12), transparent)",
                        animation: "scan-line 1.4s ease-in-out infinite",
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* route stats bar */}
              <AnimatePresence>
                {route && selected && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
                    className="absolute bottom-3 left-1/2 z-10 w-[calc(100%-24px)] max-w-md -translate-x-1/2"
                  >
                    <div className="glass-card rounded-xl p-3.5">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                          <Route className="h-3.5 w-3.5 text-water" />
                          Alternate route — avoids {selected.name}
                        </p>
                        <button onClick={() => setRoute(null)} aria-label="Clear route" className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
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

          {/* right column: detail or city pulse */}
          <div className="min-h-[200px]">
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div
                  key="detail"
                  initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }}
                  className="glass-card flex h-full flex-col rounded-xl"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-border p-4 pb-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        <MapPin className="h-3 w-3 text-primary" />
                        {selected.ward} ward
                      </p>
                      <h3 className="font-display mt-1 text-lg font-semibold leading-tight">{selected.name}</h3>
                    </div>
                    <button onClick={() => { selectHotspot(null); setRoute(null); }} aria-label="Close panel" className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <ScrollArea className="flex-1 p-4" style={{ maxHeight: 420 }}>
                    <div className="flex items-center gap-4">
                      <RiskGauge score={selected.riskScore} level={selected.severity} />
                      <div className="flex-1 space-y-2.5">
                        <RiskBadge level={selected.severity} />
                        <SeverityBar level={selected.severity} />
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="rounded-lg bg-secondary/60 p-2">
                            <p className="text-muted-foreground">Reports 24h</p>
                            <p className="font-mono text-sm font-semibold">{selected.reports24h}</p>
                          </div>
                          <div className="rounded-lg bg-secondary/60 p-2">
                            <p className="text-muted-foreground">Verified</p>
                            <p className="font-mono text-[11px] font-semibold">{selected.lastVerified}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Likely cause
                      </p>
                      <p className="text-sm leading-relaxed text-secondary-foreground">{selected.cause}</p>
                    </div>

                    <div className="mt-4">
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Affected road segments
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.affectedRoads.map((r) => (
                          <span key={r} className="rounded-md border border-border bg-secondary/50 px-2 py-1 font-mono text-[10.5px] text-secondary-foreground">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <Button
                      className="mt-5 w-full gap-2"
                      onClick={() => setRoute(buildRoute(selected))}
                      data-cursor="hover"
                    >
                      <Route className="h-4 w-4" />
                      Suggest Alternate Route
                    </Button>
                  </ScrollArea>
                </motion.div>
              ) : (
                <motion.div
                  key="pulse"
                  initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }}
                  className="glass-card rounded-xl"
                >
                  <div className="border-b border-border p-4 pb-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Droplets className="h-4 w-4 text-water" />
                      City pulse — top risk hotspots
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {scenario.intensity > 0
                        ? `Scenario: ${scenario.intensity} mm/hr · ${scenario.durationHours} hr`
                        : "Baseline drainage risk"}
                    </p>
                  </div>
                  <div className="p-2">
                    {topHotspots.map((h, i) => (
                      <button
                        key={h.id}
                        onClick={() => selectHotspot(h.id)}
                        data-cursor="hover"
                        className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-secondary/70"
                      >
                        <span className="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{h.name}</p>
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: RISK_META[h.severity].color }}
                              animate={{ width: `${h.riskScore}%` }}
                              transition={{ type: "spring", stiffness: 60, damping: 20 }}
                            />
                          </div>
                        </div>
                        <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: RISK_META[h.severity].color }}>
                          {h.riskScore}%
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    ))}
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
