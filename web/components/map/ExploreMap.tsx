"use client";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { guardMap } from "./guardMap";
import { useVisibleMount } from "./useVisibleMount";
import { HAZARD_LABEL, type Hazard, type HazardKind } from "@/lib/hazards";
import { insideSydney } from "@/lib/start";
import type { AmenityPin } from "@/lib/types";
import type { UserFix } from "@/lib/useUserLocation";

const CAMPUS: [number, number] = [-33.7755, 151.1155];
const COLOUR: Record<HazardKind, string> = {
  slope: "#B45309",
  roadworks: "#C2410C",
  lift: "#BE123C",
  amenity: "#A16207",
};

const GLYPH: Record<HazardKind, string> = {
  slope: '<path d="M3 18 10 8l4 5 7-9"/><path d="M3 21h18"/>',
  roadworks: '<path d="M4 7h16M4 12h16M4 17h16M8 4v16M16 4v16"/>',
  lift: '<path d="M7 3h10v18H7z"/><path d="M12 3v18"/><path d="M9.5 9.5 12 7l2.5 2.5M9.5 14.5 12 17l2.5-2.5"/>',
  amenity: '<path d="M12 8v5"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
};

function hazardIcon(h: Hazard, selected: boolean) {
  const colour = COLOUR[h.kind];
  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<span style="display:flex;width:40px;height:40px;align-items:center;justify-content:center;border-radius:999px;background:${colour};border:3px solid #fff;box-shadow:0 2px 8px rgba(21,32,27,.35);outline:${selected ? "3px solid " + colour : "none"};outline-offset:2px">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[h.kind]}</svg></span>`,
  });
}

const AMENITY_STYLE: Record<AmenityPin["kind"], { colour: string; svg: string; legend: string }> = {
  entrance: { colour: "#1D4FA8", legend: "Level entrance", svg: '<path d="M5 21V4h10l4 4v13"/><path d="M15 4v4h4"/><path d="M10 21v-6"/>' },
  toilet: { colour: "#0F766E", legend: "Accessible toilet", svg: '<circle cx="12" cy="5" r="1.6"/><path d="M12 8v5M9 21l3-8 3 8M8 12h8"/>' },
  parking: { colour: "#4338CA", legend: "Accessible parking", svg: '<path d="M7 21V3h7a5 5 0 0 1 0 10H7"/>' },
};

function amenityIcon(pin: AmenityPin) {
  const { colour, svg } = AMENITY_STYLE[pin.kind];
  return L.divIcon({
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<span style="display:flex;width:40px;height:40px;align-items:center;justify-content:center;border-radius:999px;background:${colour};border:3px solid #fff;box-shadow:0 2px 8px rgba(21,32,27,.35)">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg></span>`,
  });
}

const userIcon = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<span style="display:block;width:22px;height:22px;border-radius:999px;background:#1d4fa8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(29,79,168,.25)"></span>`,
});

function Recenter({ fix, token }: { fix: UserFix | null; token: number }) {
  const map = useMap();
  const fixRef = useRef(fix);
  useEffect(() => {
    fixRef.current = fix;
  }, [fix]);
  useEffect(() => {
    if (token === 0) return;
    const current = fixRef.current;
    const target = current ? L.latLng(current.lat, current.lng) : L.latLng(CAMPUS);
    map.flyTo(target, Math.max(map.getZoom(), 18), { duration: 0.4 });
  }, [token, map]);
  return null;
}

/** Shows where the map is on its region (data-lat/lng/zoom), for tests and debugging. */
function ViewReport() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer().parentElement;
    const report = () => {
      const c = map.getCenter();
      el?.setAttribute("data-lat", c.lat.toFixed(5));
      el?.setAttribute("data-lng", c.lng.toFixed(5));
      el?.setAttribute("data-zoom", String(map.getZoom()));
    };
    report();
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [map]);
  return null;
}

export default function ExploreMap({
  hazards, selectedId, onSelect, fix, amenities = [], onAmenity,
}: {
  hazards: Hazard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fix: UserFix | null;
  amenities?: AmenityPin[];
  onAmenity?: (pin: AmenityPin) => void;
}) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [recenter, setRecenter] = useState(0);
  const mountKey = useVisibleMount();
  const mapRef = useCallback((m: L.Map | null) => setMap(guardMap(m)), []);

  useEffect(() => {
    const el = map?.getContainer();
    if (!map || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  // Open where you are (inside Greater Sydney), else on campus. Pins never move the map. When your location arrives
  // after the map opened, go there once, unless you've already moved the map yourself.
  const moved = useRef(false);
  const wentToFix = useRef(false);
  useEffect(() => {
    if (!map) return;
    const mark = () => {
      moved.current = true;
    };
    map.on("dragstart zoomstart", mark);
    return () => {
      map.off("dragstart zoomstart", mark);
    };
  }, [map]);
  useEffect(() => {
    if (!map || !fix || wentToFix.current || !insideSydney(fix)) return;
    wentToFix.current = true;
    if (!moved.current) map.setView([fix.lat, fix.lng], Math.max(map.getZoom(), 17), { animate: false });
  }, [map, fix]);

  return (
    <div role="region" aria-label="Live map" className="absolute inset-0">
      {mountKey !== null && (
        <MapContainer
          key={mountKey}
          center={fix && insideSydney(fix) ? [fix.lat, fix.lng] : CAMPUS}
          zoom={17}
          maxZoom={19}
          zoomControl={false}
          ref={mapRef}
          className="absolute inset-0 z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19} // OSM serves zoom 19; Leaflet's TileLayer stops at 18 unless told (grey map)
          />
          <Recenter fix={fix} token={recenter} />
          <ViewReport />
          {fix && fix.accuracy > 0 && fix.accuracy < 1500 && (
            <Circle center={[fix.lat, fix.lng]} radius={fix.accuracy}
              pathOptions={{ color: "#1d4fa8", weight: 1, fillColor: "#1d4fa8", fillOpacity: 0.12 }} />
          )}
          {fix && (
            <Marker position={[fix.lat, fix.lng]} icon={userIcon} alt="Your location" title="Your location" keyboard={false} zIndexOffset={800} />
          )}
          {amenities.map((pin) => (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={amenityIcon(pin)}
              title={`${pin.label} at ${pin.name}`}
              alt={`${pin.label} at ${pin.name}`}
              eventHandlers={{ click: () => onAmenity?.(pin) }}
              zIndexOffset={650}
            />
          ))}
          {hazards.map((h) => (
            <Marker
              key={h.id}
              position={[h.lat, h.lng]}
              icon={hazardIcon(h, h.id === selectedId)}
              title={`${HAZARD_LABEL[h.kind]}: ${h.title}`}
              alt={`${HAZARD_LABEL[h.kind]}: ${h.title}`}
              eventHandlers={{ click: () => onSelect(h.id) }}
              zIndexOffset={h.id === selectedId ? 700 : 400}
            />
          ))}
        </MapContainer>
      )}
      <ul className="absolute top-3 left-[4.5rem] z-[500] flex max-w-[calc(100%-5.25rem)] flex-wrap gap-1.5 lg:top-auto lg:bottom-4 lg:left-3 lg:max-w-[calc(100%-4.5rem)]">
        {fix && (
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] font-bold">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
            You
          </li>
        )}
        {(Object.keys(AMENITY_STYLE) as AmenityPin["kind"][])
          .filter((kind) => amenities.some((pin) => pin.kind === kind))
          .map((kind) => (
            <li key={kind} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] font-bold">
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: AMENITY_STYLE[kind].colour }} />
              {AMENITY_STYLE[kind].legend}
            </li>
          ))}
        {(["slope", "roadworks", "lift", "amenity"] as HazardKind[]).map((kind) => (
          <li key={kind} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] font-bold">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: COLOUR[kind] }} />
            {HAZARD_LABEL[kind]}
          </li>
        ))}
      </ul>
      <div className="absolute top-[4.5rem] left-3 z-[500] flex flex-col gap-2 lg:top-3 lg:right-3 lg:left-auto">
        <button type="button" aria-label="Centre on your location" onClick={() => setRecenter((n) => n + 1)}
          className="flex size-12 items-center justify-center rounded-full border border-line-strong bg-surface text-primary shadow-sm hover:bg-bg">
          <LocateFixed aria-hidden="true" className="size-5" strokeWidth={2.4} />
        </button>
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
