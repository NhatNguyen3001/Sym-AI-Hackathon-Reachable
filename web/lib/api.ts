// The only place the web app talks to the backend. Reads fall back to sample data so pages still
// render when the API is down; writes throw ApiError so pages can say what went wrong.
import * as sample from "./placeholder";
import type {
  AgentCardData, AmenityPin, Fetched, Place, Profile, ReportIn, RouteResult, UpdateItem, UpdateType, VenueCheck, Weather,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

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
    res = await fetch(`${API_URL}${path}`, init);
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
export async function getPlaces(q: string): Promise<Fetched<Place[]> & { limited: boolean }> {
  try {
    const { body, headers } = await requestWithHeaders<Place[]>(`/places?q=${encodeURIComponent(q)}`);
    return { data: body, sample: false, limited: headers.get("X-Search-Limited") === "1" };
  } catch {
    const data = sample.places.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    return { data, sample: true, limited: true };
  }
}

const SAMPLE_TRIP = { from: "mq-station", to: "library" };

/** The sample route only stands in for the sample trip; any other failed trip is reported as an error. */
export async function getRoute(from: string, to: string, profile: Profile): Promise<Fetched<RouteResult>> {
  if (from === SAMPLE_TRIP.from && to === SAMPLE_TRIP.to) return read<RouteResult>("/route", sample.route, jsonBody({ from, to, profile }));
  return { data: await request<RouteResult>("/route", jsonBody({ from, to, profile })), sample: false };
}

export const getVenueCheck = (id: string) => read<VenueCheck>(`/venue/${encodeURIComponent(id)}/check`, sample.venue);

export const getAmenities = () => read<AmenityPin[]>("/amenities", sample.amenities);

export const getUpdates = (type?: UpdateType | "all") =>
  read<UpdateItem[]>(type && type !== "all" ? `/updates?type=${type}` : "/updates",
    type && type !== "all" ? sample.updates.filter((u) => u.type === type) : sample.updates);

export const getAgents = () => read<AgentCardData[]>("/agents/status", sample.agents);

export const getWeather = () => read<Weather>("/weather", sample.weather);

export const parseProfile = (text: string) => request<Profile>("/profile/parse", jsonBody({ text }));

export function labelPhoto(file: File) {
  const form = new FormData();
  form.append("photo", file);
  return request<{ photoUrl: string; aiLabel: ReportIn["userLabel"] | null; aiText: string }>(
    "/reports/label", { method: "POST", body: form });
}

export const sendReport = (body: ReportIn) => request<{ id: string; status: string }>("/reports", jsonBody(body));

export const photoSrc = (photoUrl: string) => `${API_URL}${photoUrl}`;

/** One place by id (known, searched or coord:), or null if the server doesn't know it. */
export async function getPlace(id: string): Promise<Place | null> {
  try {
    return await request<Place>(`/places/${encodeURIComponent(id)}`);
  } catch {
    return sample.places.find((p) => p.id === id) ?? null;
  }
}
