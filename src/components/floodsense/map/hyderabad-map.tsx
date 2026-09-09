"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { HotspotLive } from "@/lib/flood/types";
import type { RouteOverlayData } from "./route-overlay";
import type { GridPointRisk, ReportResponse, RerouteResponse } from "@/lib/flood/api";
import type { MapLayersState } from "./leaflet-map-inner";

export type { MapLayersState };

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
  // Flood intelligence extensions
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
  // Interactive Route Planner
  routeStart?: { lat: number; lng: number } | null;
  routeDest?: { lat: number; lng: number } | null;
  pickingMode?: "start" | "destination" | "auto" | null;
  onMapCoordinateClick?: (coord: { lat: number; lng: number }) => void;
  rerouteResult?: RerouteResponse | null;
}

const LeafletMapInner = dynamic(
  () =>
    import("./leaflet-map-inner").then((mod) => mod.LeafletMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[380px] w-full items-center justify-center rounded-xl border border-border bg-secondary/20">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="font-mono text-xs">Loading OpenStreetMap Hyderabad…</span>
        </div>
      </div>
    ),
  }
);

export function HyderabadMap(props: HyderabadMapProps) {
  return <LeafletMapInner {...props} />;
}
