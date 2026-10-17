export type Aid = "manual_wheelchair" | "power_wheelchair" | "walker" | "cane" | "pram";

export interface Profile {
  aid: Aid;
  maxSlope: number;
  avoid: { stairs: boolean; kerbsNoRamp: boolean; slipperyWhenWet: boolean; uneven: boolean };
  destination: { entrance: boolean; toilet: boolean; parking: boolean };
  text: string;
}

export interface Place {
  id: string;
  name: string;
  kind: "station" | "venue" | "place";
  lat: number;
  lng: number;
  /** Suburb or area, shown under the name in search results. */
  detail?: string;
}

export interface RouteOut {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distanceM: number;
  minutes: number;
  maxSlope: number;
  stepFree: boolean;
  /** True when slopes come from coarse elevation data and are only estimates. */
  slopeEstimated?: boolean;
}

export interface Step {
  icon: "check" | "slope" | "alert" | "lift" | "crossing";
  label: string;
  confidence: string;
  lengthM: number;
}

export interface LiftRow {
  exitId: string;
  exit: string;
  status: "Working" | "Out of service";
  source: string;
  updated: string;
}

export interface Weather {
  raining: boolean;
  summary: string;
  until: string | null;
  source: string;
}

export interface MapBarrier {
  id: string;
  type: string;
  title: string;
  status: string;
  lat: number;
  lng: number;
}

export interface RouteResult {
  ok: boolean;
  accessible?: RouteOut;
  fastest?: RouteOut | null;
  minutesLonger?: number;
  steps?: Step[];
  exitUsed?: string | null;
  liftStatus: LiftRow[];
  barriers?: MapBarrier[];
  explanation: string;
  status?: string;
  weather: Weather;
  reason?: string;
  suggestion?: string;
  /** Set when the server used the offline campus map instead of Sydney-wide routing. */
  note?: string;
  /** Explains that slopes are estimates (routes outside the campus). */
  slopeNote?: string;
}

export interface VenueCheck {
  id: string;
  name: string;
  checks: { field: string; status: string; source: string }[];
  checkedBy: string;
  checkedAgo: string;
  sourceCount: number;
  sources: { label: string; url: string | null }[];
}

export type UpdateType = "report" | "roadworks" | "transport" | "weather" | "venue";

export interface UpdateItem {
  id: string;
  type: UpdateType;
  title: string;
  place: string;
  time: string;
  source: string;
  status: string;
  tone: "warn" | "primary";
  lat?: number | null;
  lng?: number | null;
}

export interface AgentCardData {
  name: string;
  status: string;
  tone: "primary" | "warn" | "muted";
  desc: string;
}

export type BarrierLabel = "blocked" | "stairs" | "broken_ramp" | "slippery" | "narrow" | "fine";

export interface ReportIn {
  photoUrl: string | null;
  lat: number;
  lng: number;
  userLabel: BarrierLabel;
  note: string;
}

export interface Trip {
  fromId: string;
  from: string;
  toId: string;
  to: string;
  minutes: number;
}

/** A read from the API, or sample data when the API can't be reached. */
export interface Fetched<T> {
  data: T;
  sample: boolean;
}
