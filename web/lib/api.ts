// The only place the web app talks to the backend. Reads fall back to sample data so pages still
// render when the API is down; writes throw ApiError so pages can say what went wrong.
import * as sample from "./placeholder";
import type {
  AgentCardData, Fetched, Place, Profile, ReportIn, RouteResult, UpdateItem, UpdateType, VenueCheck, Weather,
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
  return res.json() as Promise<T>;
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

export const getPlaces = (q: string) =>
  read<Place[]>(`/places?q=${encodeURIComponent(q)}`,
    sample.places.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())));

export const getRoute = (from: string, to: string, profile: Profile) =>
  read<RouteResult>("/route", sample.route, jsonBody({ from, to, profile }));

export const getVenueCheck = (id: string) => read<VenueCheck>(`/venue/${encodeURIComponent(id)}/check`, sample.venue);

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
