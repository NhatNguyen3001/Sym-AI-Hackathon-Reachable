"use client";
// Client-only Leaflet map. Load it through RouteMap (next/dynamic with ssr: false), never directly from a server file.
import "leaflet/dist/leaflet.css";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import { Minus, Plus } from "lucide-react";
import { guardMap } from "./guardMap";
import { useVisibleMount } from "./useVisibleMount";
import type { PlaceMark, SlopeSpan } from "@/lib/routeFeatures";
import type { Leg, LiftRow, MapBarrier, RouteOption, RouteOut } from "@/lib/types";
import { useUserLocation } from "@/lib/useUserLocation";

const PRIMARY = "#1D4FA8";
const ALT = ["#6B746F", "#0F766E", "#6D28D9"];
const WARN = "#A84A00";
const RIDE = "#15201B"; // ink token: public transport legs
const CAMPUS: [number, number] = [-33.7765, 151.116];

const ICON_SVG: Record<string, string> = {
  stairs: '<path d="M3 20h5v-5h5v-5h5V5h3"/>',
  blocked: '<path d="M4 3v18M12 3v18M20 3v18M2 8h20M2 16h20"/>',
  default: '<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
};

function barrierIcon(b: MapBarrier) {
  const glyph = ICON_SVG[b.type] ?? ICON_SVG.default;
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<span role="img" aria-label="Barrier: ${b.title.replace(/"/g, "&quot;")}" style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:9px;background:${WARN};border:2px solid #fff">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyph}</svg></span>`,
  });
}

const SLOPE = "#B45309";
const TOILET = "#0F766E";

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function labelIcon(text: string, row = 0) {
  return L.divIcon({
    className: "",
    iconSize: [210, 52],
    iconAnchor: [105, 26 - row * 56],
    html: `<span style="display:inline-block;max-width:210px;padding:4px 8px;border-radius:12px;background:#fff;border:1px solid #d7e0ea;font:700 12px/1.3 sans-serif;color:#15201b;text-align:center;box-shadow:0 1px 4px rgba(21,32,27,.18)">${escapeHtml(text)}</span>`,
  });
}

const MARK_GLYPH: Record<PlaceMark["kind"], { colour: string; svg: string }> = {
  slope: { colour: SLOPE, svg: '<path d="M3 18 10 8l4 5 7-9"/><path d="M3 21h18"/>' },
  toilet: { colour: TOILET, svg: '<circle cx="12" cy="5" r="1.6"/><path d="M12 8v5M9 21l3-8 3 8M8 12h8"/>' },
  entrance: { colour: PRIMARY, svg: '<path d="M5 21V4h10l4 4v13"/><path d="M15 4v4h4"/><path d="M10 21v-6"/>' },
};

function placeIcon(mark: PlaceMark) {
  const { colour, svg } = MARK_GLYPH[mark.kind];
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<span role="img" aria-label="${escapeHtml(mark.label)}" style="display:flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:999px;background:${colour};border:3px solid #fff;box-shadow:0 2px 6px rgba(21,32,27,.3)">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg></span>`,
  });
}

const LIFT_COLOUR: Record<LiftRow["status"], string> = { Working: PRIMARY, "Out of service": "#BE123C", "Not sure": "#6B746F" };
const LIFT_SVG = '<path d="M7 3h10v18H7z"/><path d="M12 3v18"/><path d="M9.5 9.5 12 7l2.5 2.5M9.5 14.5 12 17l2.5-2.5"/>';

function liftIcon(lift: LiftRow, selected: boolean) {
  const colour = LIFT_COLOUR[lift.status];
  const cross = lift.status === "Out of service"
    ? '<span style="position:absolute;right:-4px;top:-4px;display:flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:999px;background:#fff;color:#BE123C;font:800 13px/1 sans-serif">!</span>'
    : "";
  return L.divIcon({
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<span style="position:relative;display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:12px;background:${colour};border:3px solid #fff;box-shadow:0 2px 8px rgba(21,32,27,.35);outline:${selected ? "3px solid " + colour : "none"};outline-offset:2px">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LIFT_SVG}</svg>${cross}</span>`,
  });
}

const userIcon = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<span style="display:block;width:22px;height:22px;border-radius:999px;background:${PRIMARY};border:3px solid #fff;box-shadow:0 0 0 6px rgba(29,79,168,.25)"></span>`,
});

type LatLng = [number, number];
const toLatLng = (r?: { geometry: RouteOut["geometry"] } | null) =>
  (r ? r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng) : []);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return reduced;
}

function sameLine(a?: RouteOut | null, b?: RouteOut | null) {
  const left = toLatLng(a);
  const right = toLatLng(b);
  return left.length > 1 && left.length === right.length && left.every((p, i) => p[0] === right[i][0] && p[1] === right[i][1]);
}

export default function MapView({
  accessible, fastest, alternatives = [], barriers = [], routeLabel = "", marks = [], slopes = [], onPick, legs, ends,
  lifts = [], selectedLift = null, onLift,
}: {
  accessible?: RouteOut | null;
  fastest?: RouteOut | null;
  alternatives?: RouteOption[];
  barriers?: MapBarrier[];
  routeLabel?: string;
  marks?: PlaceMark[];
  slopes?: SlopeSpan[];
  onPick?: (which: "active" | number) => void;
  /** A public transport trip: walks drawn solid, rides dotted, stations as rings. */
  legs?: Leg[];
  /** Start and destination, shown as pins before the route arrives. */
  ends?: { from?: [number, number]; to?: [number, number] };
  /** Station lifts on this trip. Tapping one opens its status card. */
  lifts?: LiftRow[];
  selectedLift?: string | null;
  onLift?: (key: string) => void;
}) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const mountKey = useVisibleMount();
  const mapRef = useCallback((m: L.Map | null) => setMap(guardMap(m)), []);
  const reduced = useReducedMotion();
  const { fix } = useUserLocation();
  const acc = useMemo(() => toLatLng(accessible), [accessible]);
  // Each extra line keeps its index in `alternatives`, so a click picks the right one. The fastest line is only
  // shown for comparison when there are no alternatives: it is not a route you can pick (pick: null).
  const extras = useMemo(() => {
    const offered = alternatives
      .map((alt, pick) => ({ ...alt, pick: pick as number | null }))
      .filter((alt) => !sameLine(accessible, alt) && toLatLng(alt).length > 1);
    if (offered.length) return offered;
    if (fastest && !sameLine(accessible, fastest)) return [{ ...fastest, summary: "Fastest route", pick: null }];
    return [];
  }, [accessible, alternatives, fastest]);

  const trip = useMemo(() => {
    const walks: LatLng[][] = [];
    const rides: LatLng[][] = [];
    const stops: LatLng[] = [];
    for (const l of legs ?? []) {
      if (l.kind === "walk") walks.push(toLatLng(l));
      if (l.kind === "ride") {
        rides.push(toLatLng(l));
        stops.push([l.from.lat, l.from.lng], [l.to.lat, l.to.lng]);
      }
    }
    return { walks: walks.filter((w) => w.length > 1), rides: rides.filter((r) => r.length > 1), stops };
  }, [legs]);
  const hasTrip = trip.rides.length > 0;
  const pins = useMemo(() => [
    ...(ends?.from ? [[ends.from, "route-start"] as const] : []),
    ...(ends?.to ? [[ends.to, "route-end"] as const] : []),
  ], [ends]);

  // Leaflet measures its container once; tell it when the container changes size.
  useEffect(() => {
    const el = map?.getContainer();
    if (!map || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => {
    const line = [...acc, ...extras.flatMap((alt) => toLatLng(alt)), ...trip.walks.flat(), ...trip.rides.flat()];
    const pts = line.length > 1 ? line : pins.map(([pt]) => pt as LatLng);
    if (map && pts.length > 1) {
      // The whole trip in view. On phones the route sheet covers up to 58% of the screen from the bottom.
      const narrow = window.matchMedia("(max-width: 1023px)").matches;
      map.fitBounds(L.latLngBounds(pts), {
        paddingTopLeft: [28, 72],
        paddingBottomRight: [28, narrow ? Math.round(window.innerHeight * 0.58) + 16 : 48],
        maxZoom: 19,
        animate: false,
      });
    }
  }, [map, acc, extras, trip, pins]);

  return (
    <div role="region" aria-label="Route map" className="relative h-full min-h-[240px] w-full">
      {mountKey !== null && <MapContainer
        key={mountKey}
        center={CAMPUS}
        zoom={18}
        maxZoom={19}
        zoomControl={false}
        zoomAnimation={!reduced}
        fadeAnimation={!reduced}
        markerZoomAnimation={!reduced}
        ref={mapRef}
        className="absolute inset-0 z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19} // OSM serves zoom 19; Leaflet's TileLayer stops at 18 unless told (grey map)
        />
        {extras.map((alt, i) => {
          const line = toLatLng(alt);
          const mid = line[Math.floor(line.length / 2)];
          const choose = alt.pick === null ? undefined : () => onPick?.(alt.pick as number);
          return (
            <Fragment key={`${alt.summary}-${i}`}>
              <Polyline positions={line} eventHandlers={choose ? { click: choose } : {}} interactive={!!choose}
                pathOptions={{ color: ALT[i % ALT.length], weight: 14, opacity: 0.01 }} />
              <Polyline positions={line} eventHandlers={choose ? { click: choose } : {}} interactive={!!choose}
                pathOptions={{ color: ALT[i % ALT.length], weight: 6, dashArray: i % 2 ? "2 10" : "10 8", opacity: 0.95 }} />
              {mid && <Marker position={mid} icon={labelIcon(alt.summary, i + 1)} alt={alt.summary} title={alt.summary}
                eventHandlers={choose ? { click: choose } : {}} interactive={!!choose} zIndexOffset={500} />}
            </Fragment>
          );
        })}
        {acc.length > 1 && (
          <>
            <Polyline positions={acc} eventHandlers={{ click: () => onPick?.("active") }}
              pathOptions={{ color: PRIMARY, weight: 16, opacity: 0.01 }} />
            <Polyline positions={acc} eventHandlers={{ click: () => onPick?.("active") }}
              pathOptions={{ color: PRIMARY, weight: 8, opacity: 1 }} />
          </>
        )}
        {trip.rides.map((r, i) => (
          <Polyline key={`ride-${i}`} positions={r} pathOptions={{ color: RIDE, weight: 6, dashArray: "2 10", opacity: 0.9 }} />
        ))}
        {trip.walks.map((w, i) => (
          <Polyline key={`walk-${i}`} positions={w} pathOptions={{ color: PRIMARY, weight: 8, opacity: 1 }} />
        ))}
        {trip.stops.map((pt, i) => (
          <CircleMarker key={`stop-${i}`} center={pt} radius={7} pathOptions={{ color: RIDE, weight: 3, fillColor: "#fff", fillOpacity: 1 }} />
        ))}
        {slopes.map((span) => (
          <Polyline key={span.id} positions={span.positions} pathOptions={{ color: SLOPE, weight: 8, opacity: 1 }} />
        ))}
        {routeLabel && acc.length > 1 && (
          <Marker position={acc[Math.floor(acc.length / 2)]} icon={labelIcon(routeLabel)} alt={routeLabel} title={routeLabel} keyboard={false} zIndexOffset={600} />
        )}
        {marks.map((mark) => (
          <Marker key={mark.id} position={[mark.lat, mark.lng]} icon={placeIcon(mark)} alt={mark.label} title={mark.label} keyboard={false} zIndexOffset={700} />
        ))}
        {acc.length === 0 && pins.map(([pt, kind]) => (
          <CircleMarker key={kind} center={pt} radius={kind === "route-start" ? 9 : 10} className={kind}
            pathOptions={kind === "route-start"
              ? { color: PRIMARY, weight: 4, fillColor: "#fff", fillOpacity: 1 }
              : { color: PRIMARY, weight: 2, fillColor: PRIMARY, fillOpacity: 1 }} />
        ))}
        {acc.length > 0 && (
          <>
            <CircleMarker center={acc[0]} radius={9} pathOptions={{ color: PRIMARY, weight: 4, fillColor: "#fff", fillOpacity: 1 }} className="route-start" />
            <CircleMarker center={acc[acc.length - 1]} radius={10} pathOptions={{ color: PRIMARY, weight: 2, fillColor: PRIMARY, fillOpacity: 1 }} className="route-end" />
          </>
        )}
        {barriers.map((b) => (
          <Marker key={b.id} position={[b.lat, b.lng]} icon={barrierIcon(b)} title={b.title} alt={b.title} keyboard={false} />
        ))}
        {lifts.map((l) => {
          const key = l.exitId ?? l.exit;
          return (
            <Marker key={`lift-${key}`} position={[l.lat as number, l.lng as number]} icon={liftIcon(l, key === selectedLift)}
              title={`${l.exit}: ${l.status}`} alt={`${l.exit}: ${l.status}`} zIndexOffset={800}
              eventHandlers={{ click: () => onLift?.(key) }} />
          );
        })}
        {fix && fix.accuracy > 0 && fix.accuracy < 1500 && (
          <Circle center={[fix.lat, fix.lng]} radius={fix.accuracy}
            pathOptions={{ color: PRIMARY, weight: 1, fillColor: PRIMARY, fillOpacity: 0.12 }} />
        )}
        {fix && (
          <Marker position={[fix.lat, fix.lng]} icon={userIcon} alt="Your location" title="Your location" keyboard={false} zIndexOffset={900} />
        )}
      </MapContainer>}

      <div className="absolute top-3 left-[4.5rem] z-[500] lg:top-16 lg:left-3">
        <button type="button" aria-expanded={legendOpen} aria-controls="route-legend" aria-label="Map legend"
          onClick={() => setLegendOpen((open) => !open)}
          className="inline-flex size-12 items-center justify-center rounded-[12px] border-2 border-ink bg-surface text-[22px] font-bold text-ink shadow-sm">
          ?
        </button>
        {legendOpen && (
          <div id="route-legend" className="mt-2 w-max max-w-[220px] rounded-[14px] border border-line bg-surface px-3.5 py-2.5 text-[14px] shadow-lg">
            <p className="sr-only">Map legend</p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-7 rounded bg-primary" />{hasTrip ? "Your walk or roll" : "Your route"}
              </li>
              {hasTrip && (
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="w-7 border-t-[3px] border-dotted border-ink" />Public transport
                </li>
              )}
              {extras.length > 0 && (
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="w-7 border-t-[3px] border-dashed" style={{ borderColor: ALT[0] }} />Other routes
                </li>
              )}
              {slopes.length > 0 && (
                <li className="flex items-center gap-2"><span aria-hidden="true" className="h-1.5 w-7 rounded" style={{ background: SLOPE }} />Gentle slope</li>
              )}
              {marks.some((m) => m.kind === "toilet") && (
                <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-full" style={{ background: TOILET }} />Accessible toilet</li>
              )}
              {marks.some((m) => m.kind === "entrance") && (
                <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-full" style={{ background: PRIMARY }} />Level entrance</li>
              )}
              <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-[4px] bg-warn" />Barrier</li>
              {(Object.keys(LIFT_COLOUR) as LiftRow["status"][])
                .filter((status) => lifts.some((l) => l.status === status))
                .map((status) => (
                  <li key={status} className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-3.5 rounded-[4px]" style={{ background: LIFT_COLOUR[status] }} />
                    Lift: {status.toLowerCase()}
                  </li>
                ))}
              {fix && <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-full border-2 border-white bg-primary" />You</li>}
            </ul>
          </div>
        )}
      </div>

      <div className="absolute right-3 bottom-44 z-[500] flex flex-col gap-2 lg:bottom-6">
        <button type="button" aria-label="Zoom in" onClick={() => map?.zoomIn()}
          className="flex size-12 items-center justify-center rounded-[12px] border border-line-strong bg-surface text-ink hover:bg-bg">
          <Plus aria-hidden="true" className="size-5" strokeWidth={2.4} />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => map?.zoomOut()}
          className="flex size-12 items-center justify-center rounded-[12px] border border-line-strong bg-surface text-ink hover:bg-bg">
          <Minus aria-hidden="true" className="size-5" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
