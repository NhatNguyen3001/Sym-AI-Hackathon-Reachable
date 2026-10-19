// The showcase build: five real trips recorded with the live app, played back from files on the site itself.
// Turned on at build time (NEXT_PUBLIC_SHOWCASE=1); the live build never reads any of this.
import trips from "./showcase-trips.json";
import type { Profile } from "./types";

export const SHOWCASE = process.env.NEXT_PUBLIC_SHOWCASE === "1";

export const GITHUB_URL = "https://github.com/NhatNguyen3001/Sym-AI-Hackathon-Reachable";

export interface ShowcaseTrip {
  id: string;
  title: string;
  blurb: string;
  /** Who the trip was planned for, in plain words ("Manual wheelchair, gentle slopes only"). */
  needsText: string;
  /** Set when part of the recording was set up for the example (a lift outage). */
  staged?: string;
  fromId: string;
  toId: string;
  profile: Profile;
}

/** What the recorder wrote: when, and which place ids each trip ended up with. */
export interface ShowcaseManifest {
  recordedOn: string;
  trips: ShowcaseTrip[];
}

/** The five trips as listed in showcase-trips.json (place ids come from the manifest after recording). */
export const SHOWCASE_TRIPS = trips as (Omit<ShowcaseTrip, "fromId" | "toId"> & { fromId?: string; toId?: string })[];

export const showcaseFile = (name: string) => `/showcase/${name}.json`;

/** The recorded trip for a from/to pair. Two trips share the campus places, so `tripId` (?trip= in the link) picks. */
export function tripFor(manifest: ShowcaseManifest, fromId: string | null, toId: string | null, tripId?: string | null): ShowcaseTrip | null {
  if (!fromId || !toId) return null;
  const matches = manifest.trips.filter((t) => t.fromId === fromId && t.toId === toId);
  return matches.find((t) => t.id === tripId) ?? matches[0] ?? null;
}

/** The route page link for a trip. */
export const tripHref = (t: ShowcaseTrip) =>
  `/route?from=${encodeURIComponent(t.fromId)}&to=${encodeURIComponent(t.toId)}&trip=${encodeURIComponent(t.id)}`;
