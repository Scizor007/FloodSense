"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  TriangleAlert, BellRing, MessageSquare, Phone, Route, CheckCheck,
  Smartphone, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFloodStore } from "@/lib/flood/store";
import { formatClock } from "@/lib/flood/risk";
import { ALERT_META } from "@/lib/flood/types";
import type { FloodAlert } from "@/lib/flood/types";
import { ScreenHeader } from "../shared/risk-widgets";

const CHANNEL_ICON: Record<FloodAlert["channel"], React.ElementType> = {
  SMS: Smartphone,
  WhatsApp: Phone,
  Push: Bell,
};

const CHANNEL_COLOR: Record<FloodAlert["channel"], string> = {
  SMS: "#22d3ee",
  WhatsApp: "#25d366",
  Push: "#9d6bff",
};

function AlertBubble({ alert, index }: { alert: FloodAlert; index: number }) {
  const Icon = alert.level === "severe" || alert.level === "high" ? TriangleAlert : BellRing;
  const meta = ALERT_META[alert.level];
  const ChIcon = CHANNEL_ICON[alert.channel];
  const chColor = CHANNEL_COLOR[alert.channel];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="flex max-w-xl"
    >
      <div
        className="w-1 shrink-0 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 12px ${meta.color}80` }}
      />
      <div
        className="ml-3 flex-1 rounded-2xl rounded-tl-md border border-border bg-[#241f42] p-4"
        style={{ boxShadow: `inset 3px 0 0 -1px ${meta.color}55` }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full border"
            style={{ borderColor: `${chColor}55`, background: `${chColor}14` }}
          >
            <ChIcon className="h-3.5 w-3.5" style={{ color: chColor }} />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-semibold text-muted-foreground">FloodSense Alerts</p>
            <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider"
              style={{ color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}44` }}>
              <Icon className="h-2.5 w-2.5" /> {meta.label}
            </span>
          </div>
          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            {formatClock(alert.timestamp)}
            {!alert.read && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-water" />}
          </span>
        </div>

        <p className="text-sm font-semibold leading-snug">{alert.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{alert.message}</p>

        {alert.routeHint && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-water/25 bg-water/5 px-3 py-2">
            <Route className="h-3.5 w-3.5 shrink-0 text-water" />
            <p className="text-xs text-water/90">{alert.routeHint}</p>
          </div>
        )}

        <div className="mt-2.5 flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground/70">
            delivered via {alert.channel}
          </span>
          <span className="flex items-center gap-1 font-mono text-[9.5px] text-muted-foreground/70">
            <CheckCheck className="h-3 w-3" /> read
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export function AlertsScreen() {
  const { alerts, markAlertsRead, setView } = useFloodStore();
  const unread = alerts.filter((a) => !a.read).length;

  useEffect(() => {
    const t = setTimeout(markAlertsRead, 3500);
    return () => clearTimeout(t);
  }, [markAlertsRead]);

  return (
    <div className="space-y-5">
      <ScreenHeader
        eyebrow="Citizen alerts · multi-channel"
        title="Alerts"
        desc="Every escalation pushed to residents as SMS, WhatsApp and in-app notifications — with a way around it."
        right={
          <div className="flex items-center gap-3">
            {unread > 0 ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-water/40 bg-water/10 px-3 py-1.5 text-xs text-water">
                <span className="relative flex h-2 w-2">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-water opacity-70" />
                  <span className="relative h-2 w-2 rounded-full bg-water" />
                </span>
                {unread} new
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
                <CheckCheck className="h-3.5 w-3.5 text-risk-low" /> All caught up
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => setView("map")}>
              Open risk map
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-3xl space-y-4">
        {alerts.map((a, i) => (
          <AlertBubble key={a.id} alert={a} index={i} />
        ))}

        <div className="pt-2 text-center">
          <MessageSquare className="mx-auto h-4 w-4 text-muted-foreground/50" />
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
            end of alert history
          </p>
        </div>
      </div>
    </div>
  );
}
