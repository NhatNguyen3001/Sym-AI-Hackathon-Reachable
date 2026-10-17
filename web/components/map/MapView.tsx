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
import type { MapBarrier, RouteOption, RouteOut } from "@/lib/types";
import { useUserLocation } from "@/lib/useUserLocation";

const PRIMARY = "#1D4FA8";
const ALT = ["#6B746F", "#0F766E", "#6D28D9"];
const WARN = "#A84A00";
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

const userIcon = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<span style="display:block;width:22px;height:22px;border-radius:999px;background:${PRIMARY};border:3px solid #fff;box-shadow:0 0 0 6px rgba(29,79,168,.25)"></span>`,
});

const toLatLng = (r?: RouteOut | null) => (r ? r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) : []);

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
  accessible, fastest, alternatives = [], barriers = [], routeLabel = "", marks = [], slopes = [], onPick,
}: {
  accessible?: RouteOut | null;
  fastest?: RouteOut | null;
  alternatives?: RouteOption[];
  barriers?: MapBarrier[];
  routeLabel?: string;
  marks?: PlaceMark[];
  slopes?: SlopeSpan[];
  onPick?: (which: "active" | number) => void;
}) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const mountKey = useVisibleMount();
  const mapRef = useCallback((m: L.Map | null) => setMap(guardMap(m)), []);
  const reduced = useReducedMotion();
  const { fix } = useUserLocation();
  const acc = useMemo(() => toLatLng(accessible), [accessible]);
  const extras = useMemo(() => {
    const offered = alternatives.filter((alt) => !sameLine(accessible, alt) && toLatLng(alt).length > 1);
    if (offered.length) return offered;
    if (fastest && !sameLine(accessible, fastest)) return [{ ...fastest, summary: "Fastest route" }];
    return [];
  }, [accessible, alternatives, fastest]);

  // Leaflet measures its container once; tell it when the container changes size.
  useEffect(() => {
    const el = map?.getContainer();
    if (!map || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => {
    const pts = [...acc, ...extras.flatMap((alt) => toLatLng(alt))];
    if (map && pts.length > 1) {
      const narrow = window.matchMedia("(max-width: 1023px)").matches;
      map.fitBounds(L.latLngBounds(pts), {
        paddingTopLeft: [28, 72],
        paddingBottomRight: [28, narrow ? 160 : 48],
        maxZoom: 19,
        animate: false,
      });
      const closer = Math.min(19, map.getZoom() + 2);
      if (closer > map.getZoom()) map.setZoom(closer, { animate: false });
    }
  }, [map, acc, extras]);

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
        />
        {extras.map((alt, i) => {
          const line = toLatLng(alt);
          const mid = line[Math.floor(line.length / 2)];
          const choose = () => onPick?.(i);
          return (
            <Fragment key={`${alt.summary}-${i}`}>
              <Polyline positions={line} eventHandlers={{ click: choose }}
                pathOptions={{ color: ALT[i % ALT.length], weight: 14, opacity: 0.01 }} />
              <Polyline positions={line} eventHandlers={{ click: choose }}
                pathOptions={{ color: ALT[i % ALT.length], weight: 6, dashArray: i % 2 ? "2 10" : "10 8", opacity: 0.95 }} />
              {mid && <Marker position={mid} icon={labelIcon(alt.summary, i + 1)} alt={alt.summary} title={alt.summary}
                eventHandlers={{ click: choose }} zIndexOffset={500} />}
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
        {slopes.map((span) => (
          <Polyline key={span.id} positions={span.positions} pathOptions={{ color: SLOPE, weight: 8, opacity: 1 }} />
        ))}
        {routeLabel && acc.length > 1 && (
          <Marker position={acc[Math.floor(acc.length / 2)]} icon={labelIcon(routeLabel)} alt={routeLabel} title={routeLabel} keyboard={false} zIndexOffset={600} />
        )}
        {marks.map((mark) => (
          <Marker key={mark.id} position={[mark.lat, mark.lng]} icon={placeIcon(mark)} alt={mark.label} title={mark.label} keyboard={false} zIndexOffset={700} />
        ))}
        {acc.length > 0 && (
          <>
            <CircleMarker center={acc[0]} radius={9} pathOptions={{ color: PRIMARY, weight: 4, fillColor: "#fff", fillOpacity: 1 }} />
            <CircleMarker center={acc[acc.length - 1]} radius={10} pathOptions={{ color: PRIMARY, weight: 2, fillColor: PRIMARY, fillOpacity: 1 }} />
          </>
        )}
        {barriers.map((b) => (
          <Marker key={b.id} position={[b.lat, b.lng]} icon={barrierIcon(b)} title={b.title} alt={b.title} keyboard={false} />
        ))}
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
              <li className="flex items-center gap-2"><span aria-hidden="true" className="h-1.5 w-7 rounded bg-primary" />Your route</li>
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
