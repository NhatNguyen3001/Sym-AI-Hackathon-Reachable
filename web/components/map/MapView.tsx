"use client";
// Client-only Leaflet map. Load it through RouteMap (next/dynamic with ssr: false), never directly from a server file.
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import { Minus, Plus } from "lucide-react";
import { guardMap } from "./guardMap";
import { useVisibleMount } from "./useVisibleMount";
import type { MapBarrier, RouteOut } from "@/lib/types";

const PRIMARY = "#1D4FA8";
const FASTEST = "#6B746F";
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

export default function MapView({
  accessible, fastest, barriers = [],
}: {
  accessible?: RouteOut | null;
  fastest?: RouteOut | null;
  barriers?: MapBarrier[];
}) {
  const [map, setMap] = useState<L.Map | null>(null);
  const mountKey = useVisibleMount();
  const mapRef = useCallback((m: L.Map | null) => setMap(guardMap(m)), []);
  const reduced = useReducedMotion();
  const acc = useMemo(() => toLatLng(accessible), [accessible]);
  const fast = useMemo(() => toLatLng(fastest), [fastest]);
  const sameAsFastest = acc.length === fast.length && acc.every((p, i) => p[0] === fast[i][0] && p[1] === fast[i][1]);

  // Leaflet measures its container once; tell it when the container changes size.
  useEffect(() => {
    const el = map?.getContainer();
    if (!map || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => {
    const pts = [...acc, ...fast];
    if (map && pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], animate: !reduced });
  }, [map, acc, fast, reduced]);

  return (
    <div role="region" aria-label="Route map" className="relative h-full min-h-[560px] w-full">
      {mountKey !== null && <MapContainer
        key={mountKey}
        center={CAMPUS}
        zoom={17}
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
        {fast.length > 1 && !sameAsFastest && (
          <Polyline positions={fast} pathOptions={{ color: FASTEST, weight: 6, dashArray: "10 10", opacity: 0.95 }} />
        )}
        {acc.length > 1 && <Polyline positions={acc} pathOptions={{ color: PRIMARY, weight: 8, opacity: 1 }} />}
        {acc.length > 0 && (
          <>
            <CircleMarker center={acc[0]} radius={9} pathOptions={{ color: PRIMARY, weight: 4, fillColor: "#fff", fillOpacity: 1 }} />
            <CircleMarker center={acc[acc.length - 1]} radius={10} pathOptions={{ color: PRIMARY, weight: 2, fillColor: PRIMARY, fillOpacity: 1 }} />
          </>
        )}
        {barriers.map((b) => (
          <Marker key={b.id} position={[b.lat, b.lng]} icon={barrierIcon(b)} title={b.title} alt={b.title} keyboard={false} />
        ))}
      </MapContainer>}

      <div className="pointer-events-none absolute top-3 left-3 z-[500] rounded-[14px] border border-line bg-surface px-3.5 py-2.5 text-[14px]">
        <p className="sr-only">Map legend</p>
        <ul className="space-y-1">
          <li className="flex items-center gap-2"><span aria-hidden="true" className="h-1.5 w-7 rounded bg-primary" />Your route</li>
          {!sameAsFastest && fast.length > 1 && (
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="w-7 border-t-[3px] border-dashed border-fastest" />Fastest route
            </li>
          )}
          <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-[4px] bg-warn" />Barrier</li>
        </ul>
      </div>

      <div className="absolute right-3 bottom-6 z-[500] flex flex-col gap-2">
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
