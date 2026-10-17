import { haversine } from "./hazards";

export interface RouteProgress {
  fraction: number;
  leftM: number;
}

/** How far a person is along a route line. Coordinates are [lng, lat]. */
export function routeProgress(coordinates: [number, number][] | undefined, lat: number, lng: number): RouteProgress {
  if (!coordinates || coordinates.length < 2) return { fraction: 0, leftM: 0 };
  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const d = haversine(coordinates[i - 1][1], coordinates[i - 1][0], coordinates[i][1], coordinates[i][0]);
    lengths.push(d);
    total += d;
  }
  if (total === 0) return { fraction: 0, leftM: 0 };
  let best = Infinity;
  let along = 0;
  let walked = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const lat1 = coordinates[i - 1][1];
    const lng1 = coordinates[i - 1][0];
    const lat2 = coordinates[i][1];
    const lng2 = coordinates[i][0];
    const t = project(lat, lng, lat1, lng1, lat2, lng2);
    const dist = haversine(lat, lng, lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t);
    if (dist < best) {
      best = dist;
      along = walked + lengths[i - 1] * t;
    }
    walked += lengths[i - 1];
  }
  const fraction = Math.min(1, Math.max(0, along / total));
  return { fraction, leftM: Math.max(0, Math.round(total - along)) };
}

function project(lat: number, lng: number, lat1: number, lng1: number, lat2: number, lng2: number) {
  const cos = Math.cos((lat1 * Math.PI) / 180);
  const x2 = (lng2 - lng1) * cos;
  const y2 = lat2 - lat1;
  const len2 = x2 * x2 + y2 * y2;
  if (len2 === 0) return 0;
  const t = (((lng - lng1) * cos) * x2 + (lat - lat1) * y2) / len2;
  return Math.min(1, Math.max(0, t));
}
