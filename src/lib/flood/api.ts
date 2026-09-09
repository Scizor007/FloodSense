/**
 * FloodSense Hyderabad — Centralized Frontend API Client
 *
 * Connects frontend views to the FastAPI + MongoDB backend.
 * Provides typed methods matching the exact backend OpenAPI schemas.
 * Browser-safe: does NOT store or expose any secret backend credentials.
 */

// ---------------------------------------------------------------------------
// Base Configuration & Error Types
// ---------------------------------------------------------------------------

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  statusText: string;
  data: unknown;

  constructor(
    message: string,
    status: number,
    statusText: string,
    data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  params?: Record<string, string | number | boolean | undefined | null>;
}

// ---------------------------------------------------------------------------
// OpenAPI-Matched TypeScript Interfaces
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  api: string;
  mongodb: string;
  database: string;
}

export interface HotspotResponse {
  id: string;
  name: string;
  lat: number;
  lng: number;
  cause: string;
  severity_tag: string;
  source: string;
  elevation?: number | null;
  current_risk_score?: number | null;
  last_updated?: string | null;
}

export interface ContributingFactors {
  elevation_m: number;
  elevation_vulnerability: number;
  rainfall_intensity_mm_hr: number;
  rainfall_total_mm: number;
  rainfall_factor: number;
  distance_to_hotspot_km: number;
  nearest_hotspot_name: string;
  proximity_factor: number;
}

export interface NearestHotspotInfo {
  id: string;
  name: string;
  distance_km: number;
}

export interface RiskPredictionRequest {
  lat: number;
  lng: number;
  rainfall_intensity: number;
  duration_minutes?: number;
}

export interface RiskPredictionResponse {
  lat: number;
  lng: number;
  rainfall_intensity: number;
  duration_minutes: number;
  risk_score: number;
  severity_label: string;
  physics_base_score: number;
  ml_probability_score: number;
  model_version: string;
  contributing_factors: ContributingFactors;
  nearest_hotspot?: NearestHotspotInfo | null;
  logged_to_history?: boolean;
}

export interface GridPointRisk {
  lat: number;
  lng: number;
  elevation: number;
  risk_score: number;
  severity: string;
}

export interface GridPredictionRequest {
  min_lat?: number;
  max_lat?: number;
  min_lng?: number;
  max_lng?: number;
  grid_resolution?: number;
  rainfall_intensity?: number;
  duration_minutes?: number;
}

export interface GridPredictionResponse {
  status: string;
  bounding_box: {
    min_lat: number;
    max_lat: number;
    min_lng: number;
    max_lng: number;
  };
  resolution: number;
  total_points: number;
  rainfall_intensity: number;
  duration_minutes: number;
  grid: GridPointRisk[];
}

export interface CurrentWeatherResponse {
  status: string;
  lat: number;
  lng: number;
  temperature_celsius: number;
  rainfall_mm_hr: number;
  next_3h_precipitation_mm: number;
  humidity_percent: number;
  wind_speed_kmh: number;
  condition: string;
  fetched_at: string;
  source: string;
}

export interface HistoricalWeatherResponse {
  status: string;
  lat: number;
  lng: number;
  date: string;
  total_rainfall_mm: number;
  peak_intensity_mm_hr: number;
  rain_duration_hours: number;
  source: string;
}

export interface ElevationPoint {
  lat: number;
  lng: number;
  elevation: number;
}

export interface ElevationGridResponse {
  center_lat: number;
  center_lng: number;
  center_elevation: number;
  radius_m: number;
  grid_size: number;
  total_points: number;
  min_elevation: number;
  max_elevation: number;
  elevation_delta: number;
  points: ElevationPoint[];
}

export interface ReportCreateModel {
  user_id?: string | null;
  photo_url?: string | null;
  lat: number;
  lng: number;
  severity: string;
  note?: string | null;
}

export interface ReportResponse {
  id: string;
  user_id?: string | null;
  photo_url?: string | null;
  lat: number;
  lng: number;
  severity: string;
  status: string;
  ai_verified: boolean;
  ai_confidence?: number | null;
  corroboration_count: number;
  timestamp: string;
  note?: string | null;
}

export interface ReportStatusUpdateModel {
  status: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Waypoint {
  lat: number;
  lng: number;
  instruction?: string | null;
}

export interface RouteGeometry {
  type: string;
  coordinates: [number, number][];
}

export interface RerouteRequest {
  origin: Coordinates;
  destination: Coordinates;
  avoid_hotspot_ids?: string[] | null;
  check_flood_risk?: boolean;
  send_email_alert?: boolean;
}

export interface RerouteResponse {
  status: string;
  provider: string;
  summary: string;
  distance_km: number;
  duration_minutes: number;
  avoided_zones: string[];
  waypoints: Waypoint[];
  geometry: RouteGeometry;
  original_geometry?: RouteGeometry | null;
  original_distance_km?: number | null;
  original_duration_minutes?: number | null;
  added_distance_km?: number | null;
  added_duration_minutes?: number | null;
  exposure_level?: "NONE" | "LOW" | "MODERATE" | "HIGH" | "SEVERE" | string;
  max_risk_score?: number;
  affected_zones?: string[];
  is_hazard?: boolean;
  warning_message?: string | null;
  alert_triggered?: boolean;
  email_sent?: boolean;
  email_status?: string | null;
}

export interface DeliveryStatus {
  recipient: string;
  status: string;
  channel?: string | null;
  sid?: string | null;
  error?: string | null;
  message?: string | null;
}

export interface TriggerAlertRequest {
  hotspot_id: string;
  risk_score: number;
  message: string;
  route_suggestion?: string | null;
  channel?: string;
  recipients_radius_km?: number;
  recipients?: string[] | null;
}

export interface TriggerAlertResponse {
  id: string;
  hotspot_id: string;
  risk_score: number;
  message: string;
  route_suggestion?: string | null;
  channel: string;
  sent_at: string;
  recipients_radius_km: number;
  delivery_status: DeliveryStatus[];
}

export interface AlertListItem {
  id: string;
  hotspot_id: string;
  risk_score: number;
  message: string;
  route_suggestion?: string | null;
  channel: string;
  sent_at: string;
  recipients_radius_km: number;
  delivery_status?: DeliveryStatus[] | Record<string, unknown>[] | null;
}

// ---------------------------------------------------------------------------
// Centralized Fetch Wrapper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeoutMs = 15000, params, ...fetchInit } = options;

  let urlStr = `${API_BASE_URL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      urlStr += (urlStr.includes("?") ? "&" : "?") + queryString;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(fetchInit.headers || {});
  if (fetchInit.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch(urlStr, {
      ...fetchInit,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const isJson = response.headers
      .get("content-type")
      ?.includes("application/json");
    const responseData = isJson
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      if (typeof responseData === "object" && responseData !== null) {
        const detail = (responseData as { detail?: unknown }).detail;
        if (typeof detail === "string") {
          errorMessage = detail;
        } else if (Array.isArray(detail)) {
          // Format validation errors from FastAPI
          errorMessage = detail
            .map(
              (err: { loc?: string[]; msg?: string }) =>
                `${err.loc?.join(".") || "field"}: ${err.msg || "invalid"}`
            )
            .join("; ");
        }
      } else if (typeof responseData === "string" && responseData.trim()) {
        errorMessage = responseData;
      }

      throw new ApiError(
        errorMessage,
        response.status,
        response.statusText,
        responseData
      );
    }

    return responseData as T;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        `Request to ${endpoint} timed out after ${timeoutMs}ms`,
        408,
        "Request Timeout"
      );
    }
    const message =
      error instanceof Error ? error.message : "Network request failed";
    throw new ApiError(message, 0, "Network Error");
  }
}

// ---------------------------------------------------------------------------
// Exported API Client Methods
// ---------------------------------------------------------------------------

export const floodSenseApi = {
  // General
  getHealth(): Promise<HealthResponse> {
    return apiFetch<HealthResponse>("/health");
  },

  // Hotspots
  getHotspots(params?: {
    skip?: number;
    limit?: number;
  }): Promise<HotspotResponse[]> {
    return apiFetch<HotspotResponse[]>("/hotspots", { params });
  },

  getHotspot(id: string): Promise<HotspotResponse> {
    return apiFetch<HotspotResponse>(`/hotspots/${encodeURIComponent(id)}`);
  },

  // Risk Prediction
  predictRisk(req: RiskPredictionRequest): Promise<RiskPredictionResponse> {
    return apiFetch<RiskPredictionResponse>("/risk/predict", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  predictRiskGrid(
    req: GridPredictionRequest = {}
  ): Promise<GridPredictionResponse> {
    return apiFetch<GridPredictionResponse>("/risk/predict-grid", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  // Weather
  getCurrentWeather(
    lat: number,
    lng: number
  ): Promise<CurrentWeatherResponse> {
    return apiFetch<CurrentWeatherResponse>("/weather/current", {
      params: { lat, lng },
    });
  },

  getHistoricalWeather(
    lat: number,
    lng: number,
    date: string
  ): Promise<HistoricalWeatherResponse> {
    return apiFetch<HistoricalWeatherResponse>("/weather/historical", {
      params: { lat, lng, date },
    });
  },

  // Elevation
  getElevationGrid(
    lat: number,
    lng: number,
    radiusM: number = 500,
    gridSize: number = 5
  ): Promise<ElevationGridResponse> {
    return apiFetch<ElevationGridResponse>("/elevation/grid", {
      params: { lat, lng, radius_m: radiusM, grid_size: gridSize },
    });
  },

  // Citizen Reports
  createReport(req: ReportCreateModel): Promise<ReportResponse> {
    return apiFetch<ReportResponse>("/reports", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  getReports(params?: {
    skip?: number;
    limit?: number;
    status?: string;
  }): Promise<ReportResponse[]> {
    return apiFetch<ReportResponse[]>("/reports", { params });
  },

  updateReportStatus(
    id: string,
    status: string
  ): Promise<ReportResponse> {
    return apiFetch<ReportResponse>(`/reports/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  // Routing
  reroute(req: RerouteRequest): Promise<RerouteResponse> {
    return apiFetch<RerouteResponse>("/routing/reroute", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  // Alerts
  triggerAlert(req: TriggerAlertRequest): Promise<TriggerAlertResponse> {
    return apiFetch<TriggerAlertResponse>("/alerts/trigger", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  getAlerts(params?: {
    skip?: number;
    limit?: number;
    channel?: string;
  }): Promise<AlertListItem[]> {
    return apiFetch<AlertListItem[]>("/alerts", { params });
  },
};
