export type Aid = "manual_wheelchair" | "power_wheelchair" | "walker" | "cane" | "pram";

export interface Profile {
  aid: Aid;
  maxSlope: number;
  avoid: { stairs: boolean; kerbsNoRamp: boolean; slipperyWhenWet: boolean; uneven: boolean };
  destination: { entrance: boolean; toilet: boolean; parking: boolean };
  text: string;
}

export interface AmenityPin {
  id: string;
  placeId: string;
  name: string;
  kind: "entrance" | "toilet" | "parking";
  label: string;
  lat: number;
  lng: number;
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
  /** Campus station exit id, or null for a whole station on a public transport trip. */
  exitId: string | null;
  exit: string;
  status: "Working" | "Out of service" | "Not sure";
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

export interface LiftAlert {
  station: string;
  text: string;
  /** The alert names the platform this trip uses. */
  blocking: boolean;
  url: string | null;
}

type Line = { type: "LineString"; coordinates: [number, number][] };

export interface WalkLeg {
  kind: "walk";
  minutes: number;
  distanceM: number;
  geometry: Line;
  steps: Step[];
  stepFree: boolean;
  maxSlope: number;
  slopeEstimated?: boolean;
  /** "reachable": our accessible walk; "tfnsw": a transfer path from Transport for NSW. */
  source: "reachable" | "tfnsw";
  to: string;
}

export interface StationLeg {
  kind: "station";
  station: string;
  stopId: string | null;
  minutes: number;
  path: { type: string; label: string }[];
  liftAlerts: LiftAlert[];
}

export interface RideStop {
  name: string;
  platform: string;
  lat: number;
  lng: number;
}

export interface RideLeg {
  kind: "ride";
  mode: string;
  label: string;
  line: string;
  headsign: string;
  from: RideStop;
  to: RideStop;
  departAt: string;
  arriveAt: string;
  minutes: number;
  stops: number;
  wheelchairAccessible: boolean | null;
  geometry: Line;
}

export type Leg = WalkLeg | StationLeg | RideLeg;

export interface TripOption {
  id: string;
  mode: "walk" | "transit";
  minutes: number;
  leaveAt?: string;
  arriveAt?: string;
  summary: string;
  stepFree: boolean;
  interchanges: number;
  warnings: string[];
  liftAlerts: LiftAlert[];
  legs: Leg[];
  explanation?: string;
}

/** A secondary route drawn as a dashed line, with a plain comparison to the recommended one. */
export interface RouteOption extends RouteOut {
  summary: string;
  steps?: Step[];
}

export interface RouteResult {
  ok: boolean;
  /** The walk/roll route. Null when the trip is only possible with public transport. */
  accessible?: RouteOut | null;
  fastest?: RouteOut | null;
  /** Other real paths. The recommended route stays solid; these are dashed. */
  alternatives?: RouteOption[];
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
  /** Ways to get there, best first: the walk/roll and public transport trips. */
  options?: TripOption[];
  /** Set when public transport options couldn't be planned. */
  transitNote?: string;
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
