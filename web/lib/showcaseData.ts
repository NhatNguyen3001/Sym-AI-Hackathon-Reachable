// Recorded showcase data, loaded from the site's own /showcase/ files. Every loader returns null or [] when a file
// is missing or broken, so a bad deploy shows "This example couldn't load." instead of an endless spinner.
import { showcaseFile, type ShowcaseManifest, type ShowcaseTrip } from "./showcase";
import type { MapPlacePin, MapStatus, Place, RouteResult, UpdateItem, VenueCheck } from "./types";

export interface ShowcaseRecording {
  trip: ShowcaseTrip;
  from: Place;
  to: Place;
  route: RouteResult;
  venue: VenueCheck | null;
}

const cache = new Map<string, Promise<unknown>>();

function file<T>(name: string): Promise<T | null> {
  let p = cache.get(name) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(showcaseFile(name))
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .catch(() => null);
    // A failed load is retried next time (a brief network blip shouldn't stick for the whole visit).
    p.then((v) => v === null && cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

export const loadManifest = () => file<ShowcaseManifest>("manifest");

export const loadTrip = (id: string) => file<ShowcaseRecording>(id);

export async function loadMapPlaces(): Promise<MapPlacePin[]> {
  return (await file<MapPlacePin[]>("map-places")) ?? [];
}

export const loadMapStatus = () => file<MapStatus>("map-status");

export async function loadUpdates(): Promise<UpdateItem[]> {
  return (await file<UpdateItem[]>("updates")) ?? [];
}

/** All recorded trips that loaded (for the places they use). */
export async function loadAllTrips(): Promise<ShowcaseRecording[]> {
  const m = await loadManifest();
  if (!m) return [];
  const all = await Promise.all(m.trips.map((t) => loadTrip(t.id)));
  return all.filter((r): r is ShowcaseRecording => r !== null);
}

/** Whether a pin is inside a box (west, south, east, north). */
export const inBox = (pin: { lat: number; lng: number }, [w, s, e, n]: [number, number, number, number]) =>
  pin.lng >= w && pin.lng <= e && pin.lat >= s && pin.lat <= n;
