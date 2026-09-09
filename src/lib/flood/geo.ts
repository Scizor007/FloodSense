import type { Hotspot, Locality } from "./types";

/** Map viewport (approx. twin-city extent) used by the SVG basemap. */
export const MAP_BBOX = {
  minLng: 78.26,
  maxLng: 78.66,
  minLat: 17.27,
  maxLat: 17.61,
};

export const MAP_W = 1000;
export const MAP_H = 780;

/** Equirectangular projection tuned for this bbox. */
export function project(lat: number, lng: number): { x: number; y: number } {
  const x =
    ((lng - MAP_BBOX.minLng) / (MAP_BBOX.maxLng - MAP_BBOX.minLng)) *
      (MAP_W - 70) +
    35;
  const y =
    ((MAP_BBOX.maxLat - lat) / (MAP_BBOX.maxLat - MAP_BBOX.minLat)) *
      (MAP_H - 56) +
    28;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

/** Haversine distance in km. */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Mock model of the OpenRouteService avoid-polygon response.
 * Draws a detour polyline around a blocked segment (used in map + around-me).
 */
export function detourPolyline(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  blocked: { lat: number; lng: number }
): { lat: number; lng: number }[] {
  const mid = {
    lat: (origin.lat + destination.lat) / 2,
    lng: (origin.lng + destination.lng) / 2,
  };
  // push the midpoint away from the blocked point (perpendicular-ish offset)
  const dLat = mid.lat - blocked.lat;
  const dLng = mid.lng - blocked.lng;
  const norm = Math.hypot(dLat, dLng) || 1;
  const offset = 0.014; // ~1.5 km
  const detour = {
    lat: mid.lat + (dLat / norm) * offset,
    lng: mid.lng + (dLng / norm) * offset,
  };
  const detour2 = {
    lat: mid.lat + (dLat / norm) * offset * 0.45,
    lng: mid.lng + (dLng / norm) * offset * 0.45,
  };
  return [origin, detour, detour2, destination];
}

/** Reference localities for the Around-Me selector. */
export const LOCALITIES: Locality[] = [
  { id: "hitec", name: "HITEC City", lat: 17.4435, lng: 78.3772 },
  { id: "gachibowli", name: "Gachibowli", lat: 17.4401, lng: 78.3489 },
  { id: "madhapur", name: "Madhapur", lat: 17.4483, lng: 78.3928 },
  { id: "banjara", name: "Banjara Hills", lat: 17.4126, lng: 78.4382 },
  { id: "kukatpally", name: "Kukatpally / KPHB", lat: 17.4531, lng: 78.4043 },
  { id: "secunderabad", name: "Secunderabad", lat: 17.4399, lng: 78.4983 },
  { id: "begumpet", name: "Begumpet", lat: 17.4429, lng: 78.4676 },
  { id: "alwal", name: "Alwal", lat: 17.5023, lng: 78.5107 },
  { id: "malakpet", name: "Malakpet", lat: 17.3722, lng: 78.5023 },
  { id: "moosarambagh", name: "Moosarambagh", lat: 17.3685, lng: 78.513 },
  { id: "charminar", name: "Charminar (Old City)", lat: 17.3714, lng: 78.4783 },
  { id: "tolichowki", name: "Tolichowki", lat: 17.397, lng: 78.4075 },
  { id: "attapur", name: "Attapur", lat: 17.3575, lng: 78.423 },
  { id: "lbnagar", name: "LB Nagar", lat: 17.345, lng: 78.55 },
  { id: "uppal", name: "Uppal", lat: 17.4, lng: 78.559 },
];

/** 25 monitored hotspots — top 15 plotted on the city map (mock dataset,
 *  locations approximate real GHMC waterlogging points). */
export const HOTSPOTS: Hotspot[] = [
  {
    id: "hs-moosarambagh",
    name: "Moosarambagh Bridge",
    ward: "Amberpet",
    lat: 17.3685,
    lng: 78.513,
    baseRisk: 78,
    vulnerability: 0.92,
    cause: "Low-lying Musi bridge — river backflow + stormwater drain capacity exceeded",
    affectedRoads: ["NH-65 (Moosarambagh stretch)", "Chaderghat–Malakpet Rd", "Inner Ring Rd slip road"],
    reports24h: 14,
    lastVerified: "8 min ago",
  },
  {
    id: "hs-malakpet",
    name: "Malakpet Subway",
    ward: "Malakpet",
    lat: 17.3725,
    lng: 78.502,
    baseRisk: 71,
    vulnerability: 0.88,
    cause: "Railway underpass (2.1 m dip) — pump failure history, 3 closures since 2019",
    affectedRoads: ["Malakpet Subway", "NH-9 Chaderghat stretch", "Vertical Rd"],
    reports24h: 11,
    lastVerified: "14 min ago",
  },
  {
    id: "hs-tolichowki",
    name: "Tolichowki Flyover Underpass",
    ward: "Shaikpet",
    lat: 17.397,
    lng: 78.4075,
    baseRisk: 66,
    vulnerability: 0.81,
    cause: "Below-flyover culvert blockage; 2021 floods stranded vehicles here",
    affectedRoads: ["Old Mumbai Hwy", "Tolichowki Rd", "NH-65 ramp"],
    reports24h: 9,
    lastVerified: "6 min ago",
  },
  {
    id: "hs-chaderghat",
    name: "Chaderghat – Mir Alam",
    ward: "Chaderghat",
    lat: 17.3735,
    lng: 78.4935,
    baseRisk: 69,
    vulnerability: 0.86,
    cause: "Musi confluence zone — historic flood basin, flat gradient",
    affectedRoads: ["Chaderghat Bridge", "Mir Alam Tank Rd", "NH-9"],
    reports24h: 7,
    lastVerified: "22 min ago",
  },
  {
    id: "hs-alwal",
    name: "Alwal Nala Crossing",
    ward: "Alwal",
    lat: 17.5025,
    lng: 78.5125,
    baseRisk: 62,
    vulnerability: 0.77,
    cause: "Open nala overflows across carriageway after 20 mm/hr bursts",
    affectedRoads: ["Alwal–Bollarum Rd", "NH-44 service rd"],
    reports24h: 5,
    lastVerified: "38 min ago",
  },
  {
    id: "hs-lbnagar",
    name: "LB Nagar Circle",
    ward: "LB Nagar",
    lat: 17.345,
    lng: 78.55,
    baseRisk: 58,
    vulnerability: 0.72,
    cause: "Low-lying junction — ORR interchange runoff concentrates here",
    affectedRoads: ["NH-65", "Inner Ring Rd", "Kothapet Rd"],
    reports24h: 6,
    lastVerified: "31 min ago",
  },
  {
    id: "hs-uppal",
    name: "Uppal IDL Junction",
    ward: "Uppal",
    lat: 17.407,
    lng: 78.5635,
    baseRisk: 54,
    vulnerability: 0.68,
    cause: "National-highway dip adjacent to metro works — runoff pooling",
    affectedRoads: ["NH-163", "Uppal Ring Rd", "IDL Rd"],
    reports24h: 4,
    lastVerified: "45 min ago",
  },
  {
    id: "hs-attapur",
    name: "Attapur Main Road",
    ward: "Rajendra Nagar",
    lat: 17.3575,
    lng: 78.423,
    baseRisk: 52,
    vulnerability: 0.7,
    cause: "Musi bank zone with near-zero longitudinal gradient",
    affectedRoads: ["Attapur–Rajendranagar Rd", "PVNR Expressway ramp"],
    reports24h: 4,
    lastVerified: "52 min ago",
  },
  {
    id: "hs-musheerabad",
    name: "Musheerabad Arterial",
    ward: "Musheerabad",
    lat: 17.3985,
    lng: 78.4965,
    baseRisk: 49,
    vulnerability: 0.6,
    cause: "Nala-adjacent arterial with clogged inlets",
    affectedRoads: ["Musheerabad Rd", "Chikkadpally Main Rd", "NH-44"],
    reports24h: 3,
    lastVerified: "1 hr ago",
  },
  {
    id: "hs-kothi",
    name: "Kothi Bank Street",
    ward: "Himayat Nagar",
    lat: 17.383,
    lng: 78.481,
    baseRisk: 47,
    vulnerability: 0.62,
    cause: "Century-old low-lying commercial core, undersized drains",
    affectedRoads: ["Bank Street", "Sarojini Devi Rd", "Gunnerkunta Rd"],
    reports24h: 3,
    lastVerified: "1 hr ago",
  },
  {
    id: "hs-begumpet",
    name: "Begumpet RUB",
    ward: "Begumpet",
    lat: 17.4425,
    lng: 78.4655,
    baseRisk: 44,
    vulnerability: 0.58,
    cause: "Railway underpass — closed during 2019 & 2020 cloudbursts",
    affectedRoads: ["Begumpet Rd", "SP Rd", "NH-65"],
    reports24h: 2,
    lastVerified: "2 hr ago",
  },
  {
    id: "hs-nizampet",
    name: "Nizampet / JNTU",
    ward: "Kukatpally",
    lat: 17.4745,
    lng: 78.454,
    baseRisk: 43,
    vulnerability: 0.61,
    cause: "Bachupally nala backflow into newly built layouts",
    affectedRoads: ["NH-44 service rd", "Nizampet Rd", "KPHB Main Rd"],
    reports24h: 2,
    lastVerified: "2 hr ago",
  },
  {
    id: "hs-madhapur",
    name: "Durgam Cheruvu Rd",
    ward: "Serilingampally",
    lat: 17.446,
    lng: 78.39,
    baseRisk: 41,
    vulnerability: 0.56,
    cause: "Lake overflow onto IT corridor road (2020 event)",
    affectedRoads: ["Durgam Cheruvu Rd", "Madhapur Main Rd", "Rd No. 36"],
    reports24h: 2,
    lastVerified: "3 hr ago",
  },
  {
    id: "hs-gachibowli",
    name: "Gachibowli ORR Interchange",
    ward: "Serilingampally",
    lat: 17.44,
    lng: 78.348,
    baseRisk: 38,
    vulnerability: 0.5,
    cause: "ORR cutting runoff + flyover underpass dip",
    affectedRoads: ["ORR Exit 2", "Gachibowli–Miyapur Rd", "Old Mumbai Hwy"],
    reports24h: 1,
    lastVerified: "3 hr ago",
  },
  {
    id: "hs-yapral",
    name: "Yapral Layout",
    ward: "Bolarum",
    lat: 17.5355,
    lng: 78.538,
    baseRisk: 36,
    vulnerability: 0.55,
    cause: "Newly developed layout — drainage network incomplete",
    affectedRoads: ["Yapral Main Rd", "Alwal–Yapral Rd"],
    reports24h: 1,
    lastVerified: "4 hr ago",
  },
];
