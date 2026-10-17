// A tiny stand-in for the Transport for NSW API so the browser tests run offline and deterministically.
// GET /v1/tp/add_info   current lift alerts (default: Macquarie University station Lift 2 = south exit out)
// POST /_mock/lifts     {"osmIds": [...], "stops": [{id, text}]} replaces the broken lifts (stops: alerts at other stops)
// GET /v1/tp/trip       a small campus journey (Library -> bus 141 -> Mortarboard Cafe), times relative to now
// GET /v1/tp/stop_finder  nothing
import http from "node:http";

const PORT = Number(process.env.TFNSW_MOCK_PORT ?? 8300);
const LIFTS = { 9756349221: "Lift 1 to the Herring Rd west entry", 9756349250: "Lift 2 to the Herring Rd east entry", 9756349262: "Lift 3 to the platform" };
let broken = [9756349250];
let stopAlerts = [];

const alert = (osm) => ({
  id: `ems-e2e-${osm}`,
  url: `https://transportnsw.info/alerts/details#/ems-e2e-${osm}`,
  subtitle: `Macquarie University Station ${LIFTS[osm] ?? "lift"} is not available`,
  properties: { announcementType: "liftsEscalators", stopIDglobalID: "211310" },
  affected: {
    stops: [{ id: "211310", name: "Macquarie University Station" }],
    Infrastructures: [{ infrastructureIds: [{ provider: "osm", id: String(osm) }] }],
  },
});

const LIB = [-33.775688, 151.113509];
const MORT = [-33.772053, 151.11663];
const near = (a, b) => Math.abs(a[0] - b[0]) < 0.0005 && Math.abs(a[1] - b[1]) < 0.0005;
const coordOf = (v) => {
  const [lng, lat] = String(v ?? "").split(":").map(Number);
  return [lat, lng];
};

function campusTrip() {
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const s1 = [-33.776, 151.1142];
  const s2 = [-33.7726, 151.116];
  const walk = (a, b) => ({ duration: 120, transportation: { product: { class: 100 } }, origin: { coord: a }, destination: { coord: b }, coords: [a, b] });
  // Three departures of bus 141, ten minutes apart: one "way" with three "Leave at" times.
  const journey = (inMin) => {
    const dep = new Date(Date.now() + inMin * 60_000);
    const arr = new Date(dep.getTime() + 6 * 60_000);
    const ride = {
      duration: 360,
      transportation: { disassembledName: "141", product: { class: 5 }, destination: { name: "Manly" } },
      origin: { name: "Library Rd, Stand A", coord: s1, departureTimeEstimated: iso(dep), parent: { id: "2113001", type: "stop" }, properties: { platformName: "Stand A" } },
      destination: { name: "Mortarboard Stop", coord: s2, arrivalTimeEstimated: iso(arr), parent: { id: "2113002", type: "stop" }, properties: {} },
      stopSequence: [{}, {}, {}],
      properties: { PlanWheelChairAccess: "1" },
      coords: [s1, s2],
    };
    return { interchanges: 0, legs: [walk(LIB, s1), ride, walk(s2, MORT)] };
  };
  return { journeys: [journey(15), journey(25), journey(35)] };
}

const send = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "POST" && url.pathname === "/_mock/lifts") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      broken = body.osmIds ?? [];
      stopAlerts = body.stops ?? [];
      send(res, { broken });
    });
    return;
  }
  if (url.pathname === "/v1/tp/add_info") {
    const atStops = stopAlerts.map((a) => ({ id: `ems-e2e-stop-${a.id}`, subtitle: a.text, url: null,
      properties: { announcementType: "liftsEscalators", stopIDglobalID: a.id },
      affected: { stops: [{ id: a.id, name: "Stop" }] } }));
    return send(res, { infos: { current: [...broken.map(alert), ...atStops] } });
  }
  if (url.pathname === "/v1/tp/stop_finder") return send(res, { locations: [] });
  if (url.pathname === "/v1/tp/trip") {
    const o = coordOf(url.searchParams.get("name_origin"));
    const d = coordOf(url.searchParams.get("name_destination"));
    return send(res, near(o, LIB) && near(d, MORT) ? campusTrip() : { journeys: [] });
  }
  send(res, { error: "not mocked" }, 404);
}).listen(PORT, () => console.log(`TfNSW mock on ${PORT}`));
