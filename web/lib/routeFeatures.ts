// Turn route steps and the destination check into things the map can draw.
import { haversine } from "./hazards";
import type { Place, Step, VenueCheck } from "./types";

export interface SlopeSpan {
  id: string;
  positions: [number, number][];
  label: string;
}

export interface PlaceMark {
  id: string;
  lat: number;
  lng: number;
  kind: "slope" | "toilet" | "entrance";
  label: string;
}

type LngLat = [number, number];

function lineLength(coords: LngLat[]): number {
  let metres = 0;
  for (let i = 1; i < coords.length; i++) {
    metres += haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return metres;
}

function pointAt(coords: LngLat[], metres: number): [number, number] | null {
  if (!coords.length) return null;
  let left = Math.max(0, metres);
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const d = haversine(lat1, lng1, lat2, lng2);
    if (d >= left || i === coords.length - 1) {
      const t = d === 0 ? 0 : Math.min(1, left / d);
      return [lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t];
    }
    left -= d;
  }
  const last = coords[coords.length - 1];
  return [last[1], last[0]];
}

const shown = (status?: string) => status === "Confirmed" || status === "Likely";

export function routeFeatures(
  coordinates: LngLat[] | undefined,
  steps: Step[] | undefined,
  venue: VenueCheck | null,
  destination: Place | null,
): { spans: SlopeSpan[]; marks: PlaceMark[] } {
  const spans: SlopeSpan[] = [];
  const marks: PlaceMark[] = [];
  if (coordinates && coordinates.length > 1 && steps) {
    const stepTotal = steps.reduce((sum, step) => sum + step.lengthM, 0);
    const scale = stepTotal > 0 ? lineLength(coordinates) / stepTotal : 1;
    let walked = 0;
    steps.forEach((step, index) => {
      const start = walked;
      const end = walked + step.lengthM;
      walked = end;
      if (step.icon !== "slope") return;
      const a = pointAt(coordinates, start * scale);
      const b = pointAt(coordinates, end * scale);
      if (!a || !b) return;
      const label = step.label.replace(/, \d+ m$/, "");
      spans.push({ id: `slope-${index}`, positions: [a, b], label });
      marks.push({
        id: `slope-pin-${index}`,
        lat: (a[0] + b[0]) / 2,
        lng: (a[1] + b[1]) / 2,
        kind: "slope",
        label,
      });
    });
  }

  const end = coordinates?.[coordinates.length - 1];
  const lat = destination && destination.lat ? destination.lat : end?.[1];
  const lng = destination && destination.lng ? destination.lng : end?.[0];
  if (lat != null && lng != null && venue) {
    const toilet = venue.checks.find((c) => c.field === "Accessible toilet");
    const entrance = venue.checks.find((c) => c.field === "Level entrance");
    const both = shown(toilet?.status) && shown(entrance?.status);
    if (shown(toilet?.status)) {
      marks.push({ id: "toilet", lat, lng: lng + (both ? 0.00022 : 0), kind: "toilet", label: "Accessible toilet" });
    }
    if (shown(entrance?.status)) {
      marks.push({ id: "entrance", lat, lng: lng - (both ? 0.00022 : 0), kind: "entrance", label: "Level entrance" });
    }
  }
  return { spans, marks };
}
