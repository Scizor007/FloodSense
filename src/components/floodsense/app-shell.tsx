"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radar, LocateFixed, Camera, ClipboardList, BellRing, Droplets,
  RefreshCcw, ChevronRight,
} from "lucide-react";
import { useFloodStore } from "@/lib/flood/store";
import type { View } from "@/lib/flood/types";
import { LandingScreen } from "./landing/landing-screen";
import { MapView } from "./map/map-view";
import { AroundMeScreen } from "./around-me/around-me-screen";
import { ReportScreen } from "./report/report-screen";
import { ReportsFeedScreen } from "./reports-feed/reports-feed-screen";
import { AlertsScreen } from "./alerts/alerts-screen";
import { CursorGlow } from "./shared/cursor-glow";

const NAV: { view: View; label: string; desc: string; icon: React.ElementType }[] = [
  { view: "map", label: "Map View", desc: "City risk map", icon: Radar },
  { view: "around", label: "Around Me", desc: "Neighbourhood", icon: LocateFixed },
  { view: "report", label: "Report Flooding", desc: "Community flow", icon: Camera },
  { view: "feed", label: "Reports Feed", desc: "Authority view", icon: ClipboardList },
  { view: "alerts", label: "Alerts", desc: "Citizen channel", icon: BellRing },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <button
      onClick={() => useFloodStore.getState().setView("landing")}
      className="flex items-center gap-2.5 text-left"
      data-cursor="hover"
      aria-label="FloodSense home"
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#9d6bff] to-[#7138cc] shadow-[0_0_18px_rgba(113,56,204,0.5)]">
        <Droplets className="h-4.5 w-4.5 text-white" />
      </span>
      {!compact && (
        <span>
          <span className="font-display block text-[15px] font-bold leading-tight tracking-tight">
            FloodSense
          </span>
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Hyderabad
          </span>
        </span>
      )}
    </button>
  );
}

function Sidebar({ view, unread }: { view: View; unread: number }) {
  const resetDemo = useFloodStore((s) => s.resetDemo);
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="px-5 pb-5 pt-6">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Primary">
        {NAV.map((item, i) => {
          const active = view === item.view;
          return (
            <motion.button
              key={item.view}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              onClick={() => useFloodStore.getState().setView(item.view)}
              data-cursor="hover"
              aria-current={active ? "page" : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                active
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_rgba(113,56,204,0.8)]"
                />
              )}
              <item.icon className={`h-4.5 w-4.5 ${active ? "text-primary" : ""}`} />
              <span className="flex-1">
                <span className="block text-[13.5px] font-medium leading-tight">{item.label}</span>
                <span className="block text-[10.5px] text-muted-foreground/70">{item.desc}</span>
              </span>
              {item.view === "alerts" && unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-water px-1.5 font-mono text-[10px] font-bold text-background">
                  {unread}
                </span>
              )}
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${active ? "opacity-60" : "opacity-0 group-hover:translate-x-0.5 group-hover:opacity-40"}`} />
            </motion.button>
          );
        })}
      </nav>

      <div className="px-4 pb-5 pt-3">
        <button
          onClick={resetDemo}
          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground"
          data-cursor="hover"
        >
          <RefreshCcw className="h-3 w-3" /> reset demo data
        </button>
      </div>
    </aside>
  );
}

function TopBar({ view, unread }: { view: View; unread: number }) {
  const [clock, setClock] = useState("--:--");
  const setView = useFloodStore((s) => s.setView);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const label = NAV.find((n) => n.view === view)?.label ?? "Overview";

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="lg:hidden">
        <Logo compact />
      </div>
      <div className="hidden items-center gap-2 lg:flex">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={() => setView("alerts")}
          data-cursor="hover"
          aria-label={`Alerts${unread ? `, ${unread} unread` : ""}`}
          className="relative rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <BellRing className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-water px-1 font-mono text-[9px] font-bold text-background">
              {unread}
            </span>
          )}
        </button>
        <span className="font-mono text-[12px] tabular-nums text-secondary-foreground">{clock}</span>
      </div>
    </header>
  );
}

/** Mobile nav — horizontal chips under the top bar. */
function MobileNav({ view, unread }: { view: View; unread: number }) {
  return (
    <nav className="scrollbar-none flex gap-2 overflow-x-auto border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur-md lg:hidden" aria-label="Primary mobile">
      {NAV.map((item) => {
        const active = view === item.view;
        return (
          <button
            key={item.view}
            onClick={() => useFloodStore.getState().setView(item.view)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
              active
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border bg-card text-muted-foreground"
            }`}
            data-cursor="hover"
          >
            <item.icon className={`h-3.5 w-3.5 ${active ? "text-primary" : ""}`} />
            {item.label}
            {item.view === "alerts" && unread > 0 && (
              <span className="rounded-full bg-water px-1.5 font-mono text-[9px] font-bold text-background">{unread}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

const SCREENS: Record<Exclude<View, "landing">, React.ComponentType> = {
  map: MapView,
  around: AroundMeScreen,
  report: ReportScreen,
  feed: ReportsFeedScreen,
  alerts: AlertsScreen,
};

function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative mb-5"
      >
        <div className="absolute inset-0 rounded-3xl bg-primary/40 blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#9d6bff] to-[#7138cc]">
          <Droplets className="h-7 w-7 text-white" />
        </div>
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="font-display text-lg font-semibold"
      >
        FloodSense Hyderabad
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-4 h-1 w-44 overflow-hidden rounded-full bg-secondary"
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-water"
          initial={{ width: "5%" }}
          animate={{ width: "96%" }}
          transition={{ duration: 1.1, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}

export function FloodSenseApp() {
  const view = useFloodStore((s) => s.view);
  const alerts = useFloodStore((s) => s.alerts);
  const unread = alerts.filter((a) => !a.read).length;

  // hydration-safe "is client" flag — avoids setState-in-effect
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted) return <BootSplash />;

  const Screen = view === "landing" ? LandingScreen : SCREENS[view];

  return (
    <>
      <CursorGlow />
      {view === "landing" ? (
        <Screen />
      ) : (
        <div className="flex min-h-screen bg-background">
          <Sidebar view={view} unread={unread} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar view={view} unread={unread} />
            <MobileNav view={view} unread={unread} />
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 md:px-6 md:py-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Screen />
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      )}
    </>
  );
}
