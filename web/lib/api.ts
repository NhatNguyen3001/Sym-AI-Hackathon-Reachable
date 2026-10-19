// The only place the web app talks to the backend. Reads fall back to sample data so pages still
// render when the API is down; writes throw ApiError so pages can say what went wrong.
import * as sample from "./placeholder";
import type {
  AgentCardData, AmenityPin, Fetched, MapPlacePin, MapStatus, Place, Profile, ReportIn, RouteResult, UpdateItem, UpdateType,
  VenueCheck, Weather,
} from "./types";

import { sessionId } from "./session";
import { SHOWCASE, tripFor } from "./showcase";
import { inBox, loadAllTrips, loadManifest, loadMapPlaces, loadMapStatus, loadTrip, loadUpdates } from "./showcaseData";

// 127.0.0.1, not localhost: on Windows "localhost" tries IPv6 first and adds ~0.2 s to every request.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

/** Identical requests made at the same time share one network call. */
const inflight = new Map<string, Promise<unknown>>();
function shared<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0) {
    super(message);
    this.name = "ApiError";
  }
}

const NETWORK_MESSAGE = "We can't reach the Reachable server right now. Check your connection and try again.";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWithHeaders<T>(path, init)).body;
}

async function requestWithHeaders<T>(path: string, init?: RequestInit): Promise<{ body: T; headers: Headers }> {
  let res: Response;
  try {
    // Which phone this is (demo sandbox keeps each phone's reports and rain to itself).
    const headers = new Headers(init?.headers);
    headers.set("X-Session", sessionId());
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("network", NETWORK_MESSAGE);
  }
  if (!res.ok) {
    let code = "server_error";
    let message = "Something went wrong on our side. Please try again.";
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new ApiError(code, message, res.status);
  }
  return { body: (await res.json()) as T, headers: res.headers };
}

const jsonBody = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Network failures and 5xx fall back to sample data; 4xx (e.g. unknown place) are real answers and throw. */
async function read<T>(path: string, fallback: T, init?: RequestInit): Promise<Fetched<T>> {
  try {
    return { data: await request<T>(path, init), sample: false };
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) throw e;
    return { data: fallback, sample: true };
  }
}

/** Place search. `limited` means the server's address search is down and only known places came back. */
export async function getPlaces(q: string, { photon = true }: { photon?: boolean } = {}): Promise<Fetched<Place[]> & { limited: boolean }> {
  if (SHOWCASE) {
    const known = new Map((await loadAllTrips()).flatMap((r) => [r.from, r.to]).map((p) => [p.id, p]));
    return { data: [...known.values()].filter((p) => p.name.toLowerCase().includes(q.toLowerCase())), sample: false, limited: false };
  }
  try {
    const { body, headers } = await requestWithHeaders<Place[]>(`/places?q=${encodeURIComponent(q)}${photon ? "" : "&photon=0"}`);
    return { data: body, sample: false, limited: headers.get("X-Search-Limited") === "1" };
  } catch {
    const data = sample.places.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    return { data, sample: true, limited: true };
  }
}

export interface SearchUpdate {
  data: Place[];
  limited: boolean;
  /** True while the full (address) search is still running. */
  pending: boolean;
}

/** Known places straight away (no address search), then the full results. onUpdate runs for each. */
export async function searchPlaces(q: string, onUpdate: (r: SearchUpdate) => void): Promise<SearchUpdate> {
  const known = await getPlaces(q, { photon: false });
  onUpdate({ data: known.data, limited: false, pending: true });
  const full = await getPlaces(q);
  const done = { data: full.data, limited: full.limited, pending: false };
  onUpdate(done);
  return done;
}

const SAMPLE_TRIP = { from: "mq-station", to: "library" };

/** The sample route only stands in for the sample trip; any other failed trip is reported as an error. */
/** `fresh`: after a live change (lift, barrier, weather), never reuse a request that started before it. */
/** Showcase only: the recorded trip, or ApiError("not_in_showcase" | "showcase_missing"). */
export async function getShowcaseRecording(from: string, to: string, trip?: string | null) {
  const manifest = await loadManifest();
  if (!manifest) throw new ApiError("showcase_missing", SHOWCASE_MISSING);
  const t = tripFor(manifest, from, to, trip);
  if (!t) throw new ApiError("not_in_showcase", "This trip isn't in the showcase. Pick one of these.");
  const r = await loadTrip(t.id);
  if (!r) throw new ApiError("showcase_missing", SHOWCASE_MISSING);
  return r;
}

const SHOWCASE_MISSING = "This example couldn't load.";
const SHOWCASE_WRITE = "Reports work in the live app.";

export function getRoute(from: string, to: string, profile: Profile, { fresh = false, trip }: { fresh?: boolean; trip?: string | null } = {}): Promise<Fetched<RouteResult>> {
  if (SHOWCASE) return getShowcaseRecording(from, to, trip).then((r) => ({ data: r.route, sample: false }));
  const run = async () => {
    if (from === SAMPLE_TRIP.from && to === SAMPLE_TRIP.to) return read<RouteResult>("/route", sample.route, jsonBody({ from, to, profile }));
    return { data: await request<RouteResult>("/route", jsonBody({ from, to, profile })), sample: false };
  };
  return fresh ? run() : shared(`route ${from} ${to} ${JSON.stringify(profile)}`, run);
}

export async function getVenueCheck(id: string): Promise<Fetched<VenueCheck>> {
  if (SHOWCASE) {
    const r = (await loadAllTrips()).find((t) => t.to.id === id && t.venue);
    if (!r?.venue) throw new ApiError("showcase_missing", SHOWCASE_MISSING);
    return { data: r.venue, sample: false };
  }
  return read<VenueCheck>(`/venue/${encodeURIComponent(id)}/check`, sample.venue);
}

export const getAmenities = (): Promise<Fetched<AmenityPin[]>> =>
  SHOWCASE ? Promise.resolve({ data: sample.amenities, sample: false }) : read<AmenityPin[]>("/amenities", sample.amenities);

/** OpenStreetMap places in a box (west, south, east, north). Empty when the API is down. */
export const getMapPlaces = async (bbox: [number, number, number, number]): Promise<Fetched<MapPlacePin[]>> =>
  SHOWCASE ? { data: (await loadMapPlaces()).filter((p) => inBox(p, bbox)), sample: false }
    : read<MapPlacePin[]>(`/map/places?bbox=${bbox.map((v) => v.toFixed(4)).join(",")}`, []);

/** Owner only: start a map update (the key travels in a header, never the URL). */
export const runMapAgent = (key: string) =>
  SHOWCASE ? Promise.reject(new ApiError("showcase", SHOWCASE_WRITE)) : request<{ started: boolean }>("/agents/map/run", { method: "POST", headers: { "X-Admin-Key": key } });

/** When the map agent last ran. Null when the API is down. */
export const getMapStatus = async (): Promise<Fetched<MapStatus | null>> =>
  SHOWCASE ? { data: await loadMapStatus(), sample: false } : read<MapStatus | null>("/agents/map/status", null);

export const getUpdates = async (type?: UpdateType | "all"): Promise<Fetched<UpdateItem[]>> =>
  SHOWCASE ? { data: (await loadUpdates()).filter((u) => !type || type === "all" || u.type === type), sample: false } : read<UpdateItem[]>(type && type !== "all" ? `/updates?type=${type}` : "/updates",
    type && type !== "all" ? sample.updates.filter((u) => u.type === type) : sample.updates);

export const getAgents = (): Promise<Fetched<AgentCardData[]>> =>
  SHOWCASE ? Promise.resolve({ data: sample.agents, sample: false }) : read<AgentCardData[]>("/agents/status", sample.agents);

export const getWeather = (): Promise<Fetched<Weather>> =>
  SHOWCASE ? Promise.resolve({ data: sample.weather, sample: false }) : read<Weather>("/weather", sample.weather);


export function labelPhoto(file: File) {
  if (SHOWCASE) return Promise.reject(new ApiError("showcase", SHOWCASE_WRITE));
  const form = new FormData();
  form.append("photo", file);
  return request<{ photoUrl: string; aiLabel: ReportIn["userLabel"] | null; aiText: string }>(
    "/reports/label", { method: "POST", body: form });
}

export const sendReport = (body: ReportIn) =>
  SHOWCASE ? Promise.reject(new ApiError("showcase", SHOWCASE_WRITE)) : request<{ id: string; status: string }>("/reports", jsonBody(body));

export const photoSrc = (photoUrl: string) => `${API_URL}${photoUrl}`;

/** One place by id (known, searched or coord:), or null if the server doesn't know it. */
/** Places don't change, so one found on this visit is reused (the route page needs each one several times). */
const foundPlaces = new Map<string, Place>();

export function getPlace(id: string): Promise<Place | null> {
  const known = foundPlaces.get(id);
  if (known) return Promise.resolve(known);
  return shared(`place ${id}`, async () => {
    if (SHOWCASE) return (await loadAllTrips()).flatMap((r) => [r.from, r.to]).find((p) => p.id === id) ?? null;
    try {
      const place = await request<Place>(`/places/${encodeURIComponent(id)}`);
      foundPlaces.set(id, place);
      return place;
    } catch {
      return sample.places.find((p) => p.id === id) ?? null;
    }
  });
}
