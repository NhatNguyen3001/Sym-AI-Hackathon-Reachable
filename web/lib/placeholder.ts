// Sample data from the UI spec (section 6), with real campus names. Shown only when the API can't be reached.
import type { AgentCardData, Place, Profile, RouteResult, UpdateItem, VenueCheck, Weather } from "./types";

export const profile: Profile = {
  aid: "manual_wheelchair",
  maxSlope: 5,
  avoid: { stairs: true, kerbsNoRamp: true, slipperyWhenWet: true, uneven: false },
  destination: { entrance: true, toilet: true, parking: false },
  text: "I use a manual wheelchair. Nothing steeper than 5%, and I need an accessible toilet where I'm going.",
};

export const places: Place[] = [
  { id: "mq-station", name: "Macquarie University station", kind: "station", lat: -33.77735, lng: 151.11825 },
  { id: "library", name: "Waranara Library", kind: "venue", lat: -33.775688, lng: 151.113509 },
  { id: "library-cafe", name: "Library Café", kind: "venue", lat: -33.775877, lng: 151.113573 },
  { id: "globe-cafe", name: "Globe Café", kind: "venue", lat: -33.775408, lng: 151.115141 },
];

export const weather: Weather = { raining: false, summary: "Dry right now.", until: null, source: "Sample data" };

export const route: RouteResult = {
  ok: true,
  accessible: {
    geometry: {
      type: "LineString",
      coordinates: [
        [151.11825, -33.77735], [151.1180777, -33.7771612], [151.1172909, -33.776671],
        [151.1163834, -33.7760746], [151.1152115, -33.7758859], [151.1139064, -33.7759191], [151.1135439, -33.7754681],
      ],
    },
    distanceM: 578, minutes: 10, maxSlope: 3, stepFree: true,
  },
  fastest: null,
  minutesLonger: 0,
  exitUsed: "north",
  steps: [
    { icon: "lift", label: "Lift at north exit", confidence: "Confirmed", lengthM: 20 },
    { icon: "check", label: "Flat footpath, 61 m", confidence: "Confirmed", lengthM: 61 },
    { icon: "slope", label: "Gentle slope, up to 3%, 92 m", confidence: "Confirmed", lengthM: 92 },
    { icon: "alert", label: "Kerb ramp at crossing", confidence: "Not sure", lengthM: 8 },
  ],
  liftStatus: [
    { exitId: "north", exit: "North exit lift", status: "Working", source: "Transport for NSW (sample data)", updated: "4 min ago" },
    { exitId: "south", exit: "South exit lift", status: "Out of service", source: "Transport for NSW (sample data)", updated: "1 hr ago" },
  ],
  barriers: [],
  explanation: "Use the lift at the north exit, as the south exit lift is out of service. This is also the fastest route.",
  status: "Some details not sure",
  weather,
};

export const venue: VenueCheck = {
  id: "library-cafe",
  name: "Library Café",
  checks: [
    { field: "Level entrance", status: "Confirmed", source: "Venue website and 2 reviews agree" },
    { field: "Step-free inside", status: "Likely", source: "User photo, 3 days ago" },
    { field: "Accessible toilet", status: "Not found", source: "Not mentioned in any source" },
  ],
  checkedBy: "Sym agent", checkedAgo: "2 min ago", sourceCount: 4,
  sources: [{ label: "Venue website", url: null }, { label: "2 reviews", url: null }, { label: "User photo", url: null }, { label: "Campus map", url: null }],
};

export const updates: UpdateItem[] = [
  { id: "s1", type: "report", title: "Footpath blocked by fencing", place: "Wally's Walk", time: "10 min ago", source: "User photo, matched to a roadworks notice", status: "Confirmed", tone: "warn" },
  { id: "s2", type: "report", title: "Kerb ramp may be damaged", place: "Herring Road crossing", time: "25 min ago", source: "One user report, no photo yet", status: "Needs checking", tone: "warn", lat: -33.7783, lng: 151.1195 },
  { id: "s3", type: "weather", title: "Light rain until about 3 pm", place: "Macquarie Park", time: "30 min ago", source: "Weather forecast", status: "Active", tone: "warn" },
  { id: "s4", type: "transport", title: "Lift out of service", place: "Macquarie University station, south exit", time: "1 hr ago", source: "Transport for NSW lift alert", status: "Confirmed", tone: "warn", lat: -33.777433, lng: 151.118452 },
  { id: "s5", type: "roadworks", title: "Footpath works, detour in place", place: "Management Drive", time: "2 hrs ago", source: "Live Traffic NSW", status: "Confirmed", tone: "warn", lat: -33.77215, lng: 151.1159 },
  { id: "s6", type: "venue", title: "Entrance details updated", place: "Library Café", time: "Today", source: "Venue website and 2 reviews", status: "Updated", tone: "primary" },
  { id: "s7", type: "report", title: "Ramp repaired", place: "Near the Library", time: "Today", source: "Confirmed by 3 users", status: "Resolved", tone: "primary" },
];

export const agents: AgentCardData[] = [
  { name: "Updates agent", status: "Running", tone: "primary", desc: "Watching roadworks, transport, weather and council notices. Last check 3 min ago." },
  { name: "Report checker", status: "2 in queue", tone: "warn", desc: "Rechecks every user report against other sources before it changes the map." },
  { name: "Venue agent", status: "Idle", tone: "muted", desc: "Checks entrances, toilets and parking when someone picks a destination." },
  { name: "Route agent", status: "Idle", tone: "muted", desc: "Turns your needs into a route and explains it in plain English." },
];
