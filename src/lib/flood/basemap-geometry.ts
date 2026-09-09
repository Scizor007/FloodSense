import { project } from "./geo";

/** ---------- helpers ---------- */
const P = (lat: number, lng: number) => project(lat, lng);

function smoothPath(points: [number, number][], closed = false): string {
  const pts = points.map(([lat, lng]) => {
    const { x, y } = P(lat, lng);
    return [x, y] as [number, number];
  });
  if (pts.length < 2) return "";
  const d: string[] = [`M ${pts[0][0]} ${pts[0][1]}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    d.push(`Q ${x0} ${(y0 + my) / 2} ${mx} ${my}`);
    d.push(`Q ${x1} ${(y1 + my) / 2} ${x1} ${y1}`);
  }
  if (closed) d.push("Z");
  return d.join(" ");
}

/** deterministic pseudo-random (SSR-safe, no hydration drift) */
export const seeded = (i: number) => {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** ---------- road network (stylised from real Hyderabad geography) ---------- */

export const ORR_PATH = smoothPath(
  [
    [17.385, 78.335], [17.44, 78.315], [17.5, 78.345], [17.545, 78.4],
    [17.558, 78.47], [17.5, 78.525], [17.45, 78.56], [17.415, 78.6],
    [17.36, 78.615], [17.3, 78.585], [17.278, 78.52], [17.283, 78.45],
    [17.315, 78.38], [17.345, 78.335],
  ],
  true
);

export const NH44_PATH = smoothPath([
  [17.6, 78.487], [17.47, 78.48], [17.44, 78.487], [17.4, 78.497],
  [17.36, 78.505], [17.33, 78.512], [17.3, 78.52],
]);

export const NH65_PATH = smoothPath([
  [17.47, 78.26], [17.455, 78.32], [17.43, 78.38], [17.41, 78.4075],
  [17.425, 78.438], [17.443, 78.4675], [17.435, 78.5], [17.42, 78.535],
  [17.415, 78.565], [17.43, 78.66],
]);

export const INNER_RING_PATH = smoothPath(
  [
    [17.442, 78.466], [17.425, 78.448], [17.4126, 78.438], [17.404, 78.452],
    [17.383, 78.472], [17.3735, 78.4935], [17.3725, 78.502], [17.368, 78.528],
    [17.345, 78.55], [17.38, 78.563], [17.407, 78.5635], [17.427, 78.539],
    [17.4399, 78.4983], [17.442, 78.466],
  ],
  true
);

export const PVNR_PATH = smoothPath([
  [17.3575, 78.423], [17.38, 78.438], [17.396, 78.4465], [17.418, 78.4555],
]);

export const ARTERIALS: string[] = [
  smoothPath([[17.448, 78.392], [17.4435, 78.377], [17.442, 78.36], [17.44, 78.348]]),
  smoothPath([[17.4531, 78.4043], [17.455, 78.43], [17.4425, 78.4675], [17.4399, 78.4983]]),
  smoothPath([[17.4126, 78.4382], [17.425, 78.448]]),
  smoothPath([[17.3714, 78.4783], [17.3735, 78.4935], [17.3725, 78.502]]),
  smoothPath([[17.3575, 78.423], [17.362, 78.45], [17.3714, 78.4783]]),
  smoothPath([[17.5025, 78.5125], [17.47, 78.5], [17.4399, 78.4983]]),
  smoothPath([[17.345, 78.55], [17.36, 78.53], [17.3725, 78.502]]),
  smoothPath([[17.3685, 78.513], [17.3985, 78.4965]]),
  smoothPath([[17.4399, 78.4983], [17.4399, 78.4983], [17.5023, 78.5107]]),
  smoothPath([[17.4435, 78.3772], [17.4126, 78.4382], [17.383, 78.481]]),
];

/** ---------- water bodies ---------- */

export const MUSI_PATH = smoothPath([
  [17.372, 78.26], [17.368, 78.3], [17.364, 78.34], [17.36, 78.38],
  [17.3575, 78.423], [17.362, 78.45], [17.369, 78.478], [17.372, 78.502],
  [17.3685, 78.513], [17.373, 78.54], [17.383, 78.58], [17.388, 78.62],
  [17.392, 78.66],
]);

const blob = (
  lat: number,
  lng: number,
  rx: number,
  ry: number,
  wobble = 4
): string => {
  const { x: cx, y: cy } = P(lat, lng);
  const pts: string[] = [];
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const w = 1 + (seeded(i + cx) - 0.5) * (wobble / 20);
    const px = cx + Math.cos(a) * rx * w;
    const py = cy + Math.sin(a) * ry * w;
    pts.push(`${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  return `M ${pts.join(" L ")} Z`;
};

export const HUSSAIN_SAGAR = blob(17.4239, 78.4748, 34, 27, 6);
export const OSMAN_SAGAR = blob(17.398, 78.302, 20, 16, 5);
export const HIMAYAT_SAGAR = blob(17.385, 78.315, 14, 12, 5);
export const DURGAM_CHERUVU = blob(17.4215, 78.3905, 12, 9, 4);
export const SAROORNAGAR = blob(17.359, 78.538, 11, 9, 4);
export const MIR_ALAM = blob(17.354, 78.485, 10, 8, 4);

/** ---------- locality labels (reference dots, not hotspots) ---------- */
export const LOCALITY_LABELS: { name: string; lat: number; lng: number }[] = [
  { name: "SECUNDERABAD", lat: 17.452, lng: 78.5015 },
  { name: "BANJARA HILLS", lat: 17.416, lng: 78.4395 },
  { name: "KUKATPALLY", lat: 17.465, lng: 78.4095 },
  { name: "OLD CITY", lat: 17.360, lng: 78.4745 },
  { name: "HITEC CITY", lat: 17.449, lng: 78.3805 },
  { name: "GACHIBOWLI", lat: 17.443, lng: 78.345 },
  { name: "LB NAGAR", lat: 17.349, lng: 78.5525 },
  { name: "UPPAL", lat: 17.4075, lng: 78.5685 },
  { name: "ALWAL", lat: 17.512, lng: 78.515 },
  { name: "BEGUMPET", lat: 17.447, lng: 78.4655 },
  { name: "DILSUKHNAGAR", lat: 17.369, lng: 78.5275 },
  { name: "ATTAPUR", lat: 17.352, lng: 78.4245 },
];
