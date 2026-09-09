"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { project } from "@/lib/flood/geo";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteOverlayData {
  /** usual route that crosses the flooded segment */
  usual: LatLng[];
  /** suggested alternate route around it */
  alternate: LatLng[];
  floodAt: LatLng;
  labelA: string;
  labelB: string;
  extraMinutes: number;
  extraKm: number;
}

function toSmoothPath(points: LatLng[]): string {
  const pts = points.map((p) => {
    const { x, y } = project(p.lat, p.lng);
    return [x, y] as [number, number];
  });
  if (pts.length < 2) return "";
  const d: string[] = [`M ${pts[0][0]} ${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    d.push(`Q ${x0} ${y0} ${mx} ${my}`);
    d.push(`Q ${x1} ${y1} ${x1} ${y1}`);
  }
  return d.join(" ");
}

function Pin({ lat, lng, label, kind }: { lat: number; lng: number; label: string; kind: "a" | "b" }) {
  const { x, y } = project(lat, lng);
  const color = kind === "a" ? "#0891b2" : "#7138cc";
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={11} fill="#ffffff" stroke={color} strokeWidth={2.5} />
      <text
        y={4.5}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill={color}
        fontFamily="var(--font-jetbrains), monospace"
      >
        {kind.toUpperCase()}
      </text>
      <rect
        x={-(label.length * 3.4 + 8)}
        y={-32}
        width={label.length * 6.8 + 16}
        height={17}
        rx={8.5}
        fill="#ffffff"
        stroke="#d9cdf0"
      />
      <text
        y={-20.5}
        textAnchor="middle"
        fontSize={10.5}
        fill="#251f45"
        fontFamily="var(--font-inter), sans-serif"
        letterSpacing={0.4}
      >
        {label}
      </text>
    </g>
  );
}

/** SVG fragment — must be rendered inside the map's <svg>. */
export function RouteLayer({ route }: { route: RouteOverlayData }) {
  const altId = useId();
  const usualPath = toSmoothPath(route.usual);
  const altPath = toSmoothPath(route.alternate);
  const flood = project(route.floodAt.lat, route.floodAt.lng);

  return (
    <g>
      {/* usual route — blocked */}
      <path
        d={usualPath}
        fill="none"
        stroke="#ef4444"
        strokeWidth={3}
        strokeDasharray="8 7"
        opacity={0.75}
      />

      {/* alternate route — recommended */}
      <path d={altPath} fill="none" stroke="#ffffff" strokeWidth={9} strokeLinecap="round" />
      <path
        id={altId}
        d={altPath}
        fill="none"
        stroke="url(#routeGrad)"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeDasharray="12 5"
        style={{ animation: "dash-flow 1.2s linear infinite" }}
      />

      {/* vehicle travelling the alternate */}
      <circle r={5.5} fill="#7138cc">
        <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
          <mpath href={`#${altId}`} />
        </animateMotion>
      </circle>
      <circle r={9} fill="#0891b2" opacity={0.25}>
        <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
          <mpath href={`#${altId}`} />
        </animateMotion>
      </circle>

      {/* flooded segment marker */}
      <g transform={`translate(${flood.x}, ${flood.y})`}>
        <circle r={16} fill="#ef4444" opacity={0.18} style={{ animation: "ping-ring 2.2s ease-out infinite", transformBox: "fill-box", transformOrigin: "center" }} />
        <circle r={12} fill="#ef4444" opacity={0.3} />
        <path d="M -5 -5 L 5 5 M 5 -5 L -5 5" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
      </g>

      <Pin lat={route.usual[0].lat} lng={route.usual[0].lng} label={route.labelA} kind="a" />
      <Pin
        lat={route.usual[route.usual.length - 1].lat}
        lng={route.usual[route.usual.length - 1].lng}
        label={route.labelB}
        kind="b"
      />
    </g>
  );
}

/** Small stat card content used under routes on map & around-me. */
export function RouteStats({ route }: { route: RouteOverlayData }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Added time</p>
        <p className="font-mono text-sm font-semibold text-water">+{route.extraMinutes} min</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Added dist.</p>
        <p className="font-mono text-sm font-semibold text-water">+{route.extraKm} km</p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avoids</p>
        <p className="font-mono text-sm font-semibold text-risk-severe">flood zone</p>
      </div>
    </div>
  );
}
