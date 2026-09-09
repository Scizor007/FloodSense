"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { project, MAP_W, MAP_H } from "@/lib/flood/geo";
import {
  ORR_PATH, NH44_PATH, NH65_PATH, INNER_RING_PATH, PVNR_PATH,
  ARTERIALS, MUSI_PATH, HUSSAIN_SAGAR, OSMAN_SAGAR, HIMAYAT_SAGAR,
  DURGAM_CHERUVU, SAROORNAGAR, MIR_ALAM, LOCALITY_LABELS, seeded,
} from "@/lib/flood/basemap-geometry";
import { RISK_META } from "@/lib/flood/types";
import type { HotspotLive } from "@/lib/flood/types";
import type { RouteOverlayData } from "./route-overlay";
import { RouteLayer } from "./route-overlay";

export interface HyderabadMapProps {
  hotspots: HotspotLive[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  rainIntensity?: number;
  route?: RouteOverlayData | null;
  /** zoom into a locality (Around Me) */
  focus?: { lat: number; lng: number; radiusKm?: number } | null;
  focusLabel?: string;
  className?: string;
}

const RAIN_LINES = Array.from({ length: 42 }, (_, i) => ({
  x: 20 + seeded(i + 1) * 960,
  y: -30 + seeded(i + 60) * 700,
  delay: seeded(i + 120) * 1.6,
  dur: 0.9 + seeded(i + 180) * 0.8,
}));

function RainLayer({ intensity }: { intensity: number }) {
  if (intensity <= 0) return null;
  const opacity = Math.min(0.55, 0.18 + intensity / 130);
  return (
    <g opacity={opacity} style={{ pointerEvents: "none" }}>
      {RAIN_LINES.map((l, i) => (
        <line
          key={i}
          x1={l.x} y1={l.y} x2={l.x - 8} y2={l.y + 26}
          stroke="#9dd6ff" strokeWidth={1.1} strokeLinecap="round"
          style={{
            animation: `rain-fall ${l.dur}s linear ${l.delay}s infinite`,
          }}
        />
      ))}
    </g>
  );
}

function HotspotMarker({
  h,
  zoom,
  selected,
  hovered,
  onHover,
  onSelect,
}: {
  h: HotspotLive;
  zoom: number;
  selected: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const { x, y } = project(h.lat, h.lng);
  const meta = RISK_META[h.severity];
  const r = 8 + (h.riskScore / 100) * 5;
  const pulse = h.severity === "severe" || h.severity === "high";
  const s = 1 / zoom;
  const labelW = h.name.length * 6.6 + 26;

  return (
    <g
      transform={`translate(${x}, ${y}) scale(${s})`}
      style={{ cursor: "pointer" }}
      data-cursor="hotspot"
      role="button"
      aria-label={`${h.name}, risk ${h.riskScore}%`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(h.id);
      }}
      onMouseEnter={() => onHover(h.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* risk heat halo */}
      <circle r={r * 2.4} fill={meta.color} opacity={0.09} style={{ pointerEvents: "none" }} />
      <circle r={r * 1.55} fill={meta.color} opacity={0.14} style={{ pointerEvents: "none" }} />

      {/* pulse rings for high/severe */}
      {pulse && (
        <>
          <circle
            r={r}
            fill="none"
            stroke={meta.color}
            strokeWidth={2}
            style={{
              animation: "ping-ring 2.4s ease-out infinite",
              transformBox: "fill-box",
              transformOrigin: "center",
              pointerEvents: "none",
            }}
          />
          <circle
            r={r}
            fill="none"
            stroke={meta.color}
            strokeWidth={1.5}
            style={{
              animation: "ping-ring 2.4s ease-out 1.2s infinite",
              transformBox: "fill-box",
              transformOrigin: "center",
              pointerEvents: "none",
            }}
          />
        </>
      )}

      {/* core marker */}
      <motion.circle
        r={r}
        animate={{
          fill: meta.color,
          scale: selected ? 1.3 : hovered ? 1.18 : 1,
        }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        stroke={selected ? "#ffffff" : "#221d3a"}
        strokeWidth={selected ? 2.4 : 2}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      <text
        y={3.6}
        textAnchor="middle"
        fontSize={8.5}
        fontWeight={800}
        fill="#221d3a"
        fontFamily="var(--font-jetbrains), monospace"
        style={{ pointerEvents: "none" }}
      >
        {h.riskScore}
      </text>

      {/* tooltip */}
      {(hovered || selected) && (
        <g style={{ pointerEvents: "none" }}>
          <rect
            x={-labelW / 2}
            y={-r - 30}
            width={labelW}
            height={19}
            rx={9}
            fill="#2a2447"
            stroke={meta.color}
            strokeWidth={1}
            opacity={0.97}
          />
          <text
            y={-r - 17}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill="#ece7f8"
            fontFamily="var(--font-inter), sans-serif"
          >
            {h.name}
          </text>
        </g>
      )}
    </g>
  );
}

export function HyderabadMap({
  hotspots,
  selectedId,
  onSelect,
  rainIntensity = 0,
  route,
  focus,
  focusLabel,
  className,
}: HyderabadMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // viewbox computation (zoom for Around Me)
  let viewBox = `0 0 ${MAP_W} ${MAP_H}`;
  let zoom = 1;
  if (focus) {
    const radiusKm = focus.radiusKm ?? 4;
    const latDeg = radiusKm / 111;
    const lngDeg = radiusKm / 106;
    const mapW = MAP_W - 70;
    const mapH = MAP_H - 56;
    const vw = (lngDeg / 0.4) * mapW;
    const vh = (latDeg / 0.34) * mapH;
    const c = project(focus.lat, focus.lng);
    viewBox = `${c.x - vw / 2} ${c.y - vh / 2} ${vw} ${vh}`;
    zoom = MAP_W / vw;
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <svg
        viewBox={viewBox}
        className="h-full w-full"
        style={{ background: "#1e1936" }}
        onClick={() => onSelect?.(null)}
      >
        <defs>
          <radialGradient id="lakeGrad" cx="38%" cy="35%" r="80%">
            <stop offset="0%" stopColor="#155e75" />
            <stop offset="100%" stopColor="#0b2d3d" />
          </radialGradient>
          <linearGradient id="riverGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0e7490" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#0e7490" />
          </linearGradient>
          <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7138cc" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <radialGradient id="cityGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#7138cc" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#7138cc" stopOpacity="0" />
          </radialGradient>
          <pattern id="mapGrid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#2e2750" strokeWidth="1" />
          </pattern>
          <pattern id="floodHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#ef4444" opacity="0.06" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#ef4444" strokeWidth="2.4" opacity="0.22" />
          </pattern>
        </defs>

        {/* base grid + urban glow */}
        <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#mapGrid)" />
        <ellipse cx="534" cy="424" rx="330" ry="270" fill="url(#cityGlow)" />

        {/* water bodies */}
        <g>
          <path d={HUSSAIN_SAGAR} fill="url(#lakeGrad)" stroke="#164e63" strokeWidth="1.6" opacity="0.92" />
          <path d={OSMAN_SAGAR} fill="url(#lakeGrad)" stroke="#164e63" strokeWidth="1.2" opacity="0.85" />
          <path d={HIMAYAT_SAGAR} fill="url(#lakeGrad)" stroke="#164e63" strokeWidth="1.2" opacity="0.85" />
          <path d={DURGAM_CHERUVU} fill="url(#lakeGrad)" stroke="#164e63" strokeWidth="1.2" opacity="0.85" />
          <path d={SAROORNAGAR} fill="url(#lakeGrad)" stroke="#164e63" strokeWidth="1.1" opacity="0.8" />
          <path d={MIR_ALAM} fill="url(#lakeGrad)" stroke="#164e63" strokeWidth="1.1" opacity="0.8" />
          {/* Buddha statue */}
          <circle cx="534" cy="424" r="2.6" fill="#22d3ee" opacity="0.9" />
        </g>

        {/* Musi river */}
        <g>
          <path d={MUSI_PATH} fill="none" stroke="url(#riverGrad)" strokeWidth="4" opacity="0.75" />
          <path d={MUSI_PATH} fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.6" />
          <text x="390" y="655" fontSize="9" fill="#3d8ea5" letterSpacing="2.5" fontFamily="var(--font-jetbrains), monospace">MUSI R.</text>
        </g>

        {/* ORR */}
        <g>
          <path d={ORR_PATH} fill="none" stroke="#4c3e82" strokeWidth="3.5" strokeDasharray="14 9" opacity="0.9" />
          <text x="500" y="82" fontSize="9.5" fill="#6a58a6" letterSpacing="2" fontFamily="var(--font-jetbrains), monospace" textAnchor="middle">OUTER RING ROAD</text>
        </g>

        {/* highways + ring roads */}
        <g strokeLinecap="round">
          <path d={NH44_PATH} fill="none" stroke="#534690" strokeWidth="4.2" />
          <path d={NH65_PATH} fill="none" stroke="#534690" strokeWidth="4.2" />
          <path d={INNER_RING_PATH} fill="none" stroke="#403674" strokeWidth="3" />
          <path d={PVNR_PATH} fill="none" stroke="#6a58a6" strokeWidth="2.4" strokeDasharray="1 6" />
          {ARTERIALS.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#393066" strokeWidth="2.2" />
          ))}
        </g>

        {/* locality reference dots */}
        <g fontFamily="var(--font-jetbrains), monospace" style={{ pointerEvents: "none" }}>
          {LOCALITY_LABELS.map((l) => {
            const { x, y } = project(l.lat, l.lng);
            return (
              <g key={l.name} opacity={0.85}>
                <circle cx={x} cy={y} r={2.4} fill="#7d6fae" />
                <text x={x + 6} y={y + 3.5} fontSize={9} fill="#7d6fae" letterSpacing="1.4">
                  {l.name}
                </text>
              </g>
            );
          })}
        </g>

        {/* locality focus ring (Around Me) */}
        {focus && (() => {
          const c = project(focus.lat, focus.lng);
          const radiusKm = focus.radiusKm ?? 4;
          const latDeg = radiusKm / 111;
          const lngDeg = radiusKm / 106;
          const rx = (lngDeg / 0.4) * (MAP_W - 70) / 2;
          const ry = (latDeg / 0.34) * (MAP_H - 56) / 2;
          return (
            <g style={{ pointerEvents: "none" }}>
              <ellipse cx={c.x} cy={c.y} rx={rx} ry={ry} fill="none" stroke="#7138cc" strokeWidth={2} opacity={0.9} />
              <ellipse cx={c.x} cy={c.y} rx={rx} ry={ry} fill="none" stroke="#9d6bff" strokeWidth={1} opacity={0.4} style={{ animation: "ping-ring 3s ease-out infinite", transformBox: "fill-box", transformOrigin: "center" }} />
              {focusLabel && (
                <text x={c.x} y={c.y - ry - 10} textAnchor="middle" fontSize={13} fill="#cbb4ff" letterSpacing={1.5} fontFamily="var(--font-jetbrains), monospace">
                  {focusLabel}
                </text>
              )}
            </g>
          );
        })()}

        {/* alternate route */}
        {route && <RouteLayer route={route} />}

        {/* hotspot markers */}
        <g>
          {hotspots.map((h) => (
            <HotspotMarker
              key={h.id}
              h={h}
              zoom={zoom}
              selected={selectedId === h.id}
              hovered={hoveredId === h.id}
              onHover={setHoveredId}
              onSelect={(id) => onSelect?.(id)}
            />
          ))}
        </g>

        {/* rain */}
        <RainLayer intensity={rainIntensity} />

        {/* map furniture */}
        <g style={{ pointerEvents: "none" }} fontFamily="var(--font-jetbrains), monospace">
          {/* north arrow */}
          <g transform={`translate(${focus ? parseFloat(viewBox.split(" ")[0]) + 40 : 944}, ${focus ? parseFloat(viewBox.split(" ")[1]) + 48 : 42})`}>
            <path d="M 0 -14 L 5 6 L 0 2 L -5 6 Z" fill="#9d6bff" />
            <text y={18} textAnchor="middle" fontSize={10} fill="#9c8fc2">N</text>
          </g>
          {/* scale bar */}
          {!focus && (
            <g transform="translate(48, 742)">
              <line x1={0} y1={0} x2={116} y2={0} stroke="#7d6fae" strokeWidth={2} />
              <line x1={0} y1={-4} x2={0} y2={4} stroke="#7d6fae" strokeWidth={2} />
              <line x1={58} y1={-3} x2={58} y2={3} stroke="#7d6fae" strokeWidth={1.4} />
              <line x1={116} y1={-4} x2={116} y2={4} stroke="#7d6fae" strokeWidth={2} />
              <text x={0} y={-8} fontSize={9} fill="#7d6fae">0</text>
              <text x={104} y={-8} fontSize={9} fill="#7d6fae">5 km</text>
            </g>
          )}
          {!focus && (
            <text x={MAP_W - 16} y={MAP_H - 14} textAnchor="end" fontSize={8.5} fill="#584c8c" letterSpacing={0.8}>
              HYDERABAD · illustrative basemap
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}
