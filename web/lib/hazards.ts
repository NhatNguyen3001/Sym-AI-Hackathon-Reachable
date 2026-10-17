import type { UpdateItem } from "./types";

export type HazardKind = "slope" | "roadworks" | "lift" | "amenity";

export interface Hazard {
  id: string;
  kind: HazardKind;
  title: string;
  place: string;
  time: string;
  source: string;
  status: string;
  lat: number;
  lng: number;
}

export const HAZARD_LABEL: Record<HazardKind, string> = {
  slope: "Slope",
  roadworks: "Roadworks",
  lift: "Lift out",
  amenity: "Broken amenity",
};

/** Measured slope on the station-to-library path. Shown when the feed has no slope pin of its own. */
const CAMPUS_SLOPE: Hazard = {
  id: "campus-slope-library-path",
  kind: "slope",
  title: "Slope up to 3%",
  place: "Path from Macquarie University station",
  time: "Measured",
  source: "Campus path data",
  status: "Confirmed",
  lat: -33.77607,
  lng: 151.11638,
};

export function hazardsFromUpdates(items: UpdateItem[]): Hazard[] {
  const out: Hazard[] = [];
  for (const item of items) {
    if (item.lat == null || item.lng == null) continue;
    if (item.status === "Resolved") continue;
    const kind = kindOf(item);
    if (!kind) continue;
    out.push({
      id: item.id,
      kind,
      title: item.title,
      place: item.place,
      time: item.time,
      source: item.source,
      status: item.status,
      lat: item.lat,
      lng: item.lng,
    });
  }
  if (!out.some((h) => h.kind === "slope")) out.push(CAMPUS_SLOPE);
  return out;
}

function kindOf(item: UpdateItem): HazardKind | null {
  const text = `${item.type} ${item.title} ${item.place}`.toLowerCase();
  if (text.includes("lift")) return "lift";
  if (item.type === "roadworks" || /works|fencing|closure|roadwork|detour/.test(text)) return "roadworks";
  if (/slope|steep|stair|incline/.test(text)) return "slope";
  if (item.type === "venue" || item.type === "weather") return null;
  if (/ramp|kerb|curb|toilet|entrance|amenit|blocked|narrow|slippery/.test(text)) return "amenity";
  if (item.type === "report") return "amenity";
  return null;
}

export function distanceLabel(from: { lat: number; lng: number } | null, lat: number, lng: number): string | null {
  if (!from) return null;
  const metres = haversine(from.lat, from.lng, lat, lng);
  if (metres < 1000) return `${Math.max(1, Math.round(metres))} m away`;
  return `${(metres / 1000).toFixed(1)} km away`;
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}
