"use client";

import { useLayoutEffect, useState } from "react";
import { getHistoricalData } from "@/lib/flood/historical-service";
import type { HistoricalMonthRecord } from "@/lib/flood/historical-data";

interface HistoricalMonthState {
  data: HistoricalMonthRecord | null;
  /** true while a request for the current location+month is unresolved —
   *  becomes visible once the real API is wired; the mock resolves before
   *  paint, so no skeleton ever flashes in the prototype. */
  loading: boolean;
  error: string | null;
}

/**
 * Loads one location-month of historical data through the service layer.
 * Mirrors what `GET /historical/{locationId}?month=YYYY-MM` will provide.
 * State only updates from async callbacks; readiness is derived by matching
 * the loaded record's context (location:month) against the requested one.
 */
export function useHistoricalMonth(
  locationId: string,
  month: string
): HistoricalMonthState {
  const [loaded, setLoaded] = useState<{
    ctx: string;
    data: HistoricalMonthRecord | null;
    error: string | null;
  }>({ ctx: "", data: null, error: null });

  // useLayoutEffect: the mock resolves before paint, so switching location or
  // month never flashes a loading skeleton.
  useLayoutEffect(() => {
    const ctx = `${locationId}:${month}`;
    let alive = true;
    getHistoricalData(locationId, month).then(
      (record) => {
        if (alive) setLoaded({ ctx, data: record, error: null });
      },
      (err: unknown) => {
        if (alive) {
          setLoaded({
            ctx,
            data: null,
            error: err instanceof Error ? err.message : "Failed to load",
          });
        }
      }
    );
    return () => {
      alive = false;
    };
  }, [locationId, month]);

  const ctx = `${locationId}:${month}`;
  const ready = loaded.ctx === ctx;
  return {
    data: ready ? loaded.data : null,
    loading: !ready,
    error: ready ? loaded.error : null,
  };
}
