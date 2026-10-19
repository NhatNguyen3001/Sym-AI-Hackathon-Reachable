"use client";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { cn } from "cn";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Eye, EyeOff, Layers, LocateFixed, Minus, Plus } from "lucide-react";
import { guardMap } from "./guardMap";
import { useVisibleMount } from "./useVisibleMount";
import { distanceLabel, HAZARD_LABEL, type Hazard, type HazardKind } from "@/lib/hazards";
import { opensOn } from "@/lib/start";
import { readStored, writeStored } from "@/lib/storage";
import type { AmenityPin, MapPlacePin } from "@/lib/types";
import { ClusterLayer, type ClusterItem } from "./ClusterLayer";
import type { UserFix } from "@/lib/useUserLocation";
import { SHOWCASE } from "@/lib/showcase";

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
    className: "pin-in",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<span style="display:flex;width:40px;height:40px;align-items:center;justify-content:center;border-radius:999px;background:${colour};border:3px solid #fff;box-shadow:0 2px 8px rgba(21,32,27,.35);outline:${selected ? "3px solid " + colour : "none"};outline-offset:2px">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[h.kind]}</svg></span>`,
  });
}

type PinKind = AmenityPin["kind"] | MapPlacePin["kind"];

const AMENITY_STYLE: Record<PinKind, { colour: string; svg: string; legend: string }> = {
  entrance: { colour: "#1D4FA8", legend: "Level entrance", svg: '<path d="M5 21V4h10l4 4v13"/><path d="M15 4v4h4"/><path d="M10 21v-6"/>' },
  toilet: { colour: "#0F766E", legend: "Accessible toilet", svg: '<circle cx="12" cy="5" r="1.6"/><path d="M12 8v5M9 21l3-8 3 8M8 12h8"/>' },
  parking: { colour: "#4338CA", legend: "Accessible parking", svg: '<path d="M7 21V3h7a5 5 0 0 1 0 10H7"/>' },
  venue: { colour: "#6D28D9", legend: "Wheelchair-accessible place", svg: '<circle cx="10" cy="5" r="1.6"/><path d="M10 8v6h5l2 5M10 11h5"/><path d="M14 18.5a5 5 0 1 1-6-6.5"/>' },
};

function amenityIcon(pin: { kind: PinKind }) {
  const { colour, svg } = AMENITY_STYLE[pin.kind];
  return L.divIcon({
    className: "pin-in",
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

/** Tells the page which part of Sydney is in view, so it can load the places there. */
function ViewWatcher({ onView }: { onView?: (bounds: L.LatLngBounds, zoom: number) => void }) {
  const map = useMap();
  const cb = useRef(onView);
  useEffect(() => {
    cb.current = onView;
  }, [onView]);
  useEffect(() => {
    const tell = () => cb.current?.(map.getBounds(), map.getZoom());
    tell();
    map.on("moveend", tell);
    return () => {
      map.off("moveend", tell);
    };
  }, [map]);
  return null;
}

const HIDDEN_KEY = "reachable.hiddenPinKinds";

/** A legend chip that turns one kind of pin on or off (aria-pressed: on = shown). */
function KindToggle({ label, colour, on, onToggle }: { label: string; colour: string; on: boolean; onToggle: () => void }) {
  return (
    // Named "… pins": the needs filter has its own "Accessible toilet" button with a different meaning.
    <button type="button" aria-pressed={on} aria-label={`${label} pins`} onClick={onToggle}
      className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-bold",
        "transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-95",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        on ? "border-line bg-surface text-ink shadow-sm" : "border-dashed border-line-strong bg-bg text-muted")}>
      <span aria-hidden="true" className="size-2.5 rounded-full transition-[background-color,box-shadow] duration-200"
        style={{ background: on ? colour : "transparent", boxShadow: on ? undefined : `inset 0 0 0 2px ${colour}` }} />
      <span className={cn("transition-opacity duration-200", !on && "opacity-70")}>{label}</span>
      {on
        ? <Eye aria-hidden="true" className="size-3.5 opacity-60" strokeWidth={2.4} />
        : <EyeOff aria-hidden="true" className="size-3.5" strokeWidth={2.4} />}
    </button>
  );
}

interface OpenPlace {
  id: string;
  name: string;
  label: string;
  source?: string;
  lat: number;
  lng: number;
  go: () => void;
}

/** What a place pin is, with a "Go here" button: tapping a pin never plans a route by itself. */
function PlacePopup({ place, fix, onClose }: { place: OpenPlace; fix: UserFix | null; onClose: () => void }) {
  const map = useMap();
  const go = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The showcase has no "Go here" (only its recorded trips can be shown), so focus goes to the popup itself.
    const t = setTimeout(() => (go.current ?? box.current)?.focus(), 0);
    return () => clearTimeout(t);
  }, [place.id]);
  const away = distanceLabel(fix, place.lat, place.lng);
  return (
    // Keep the popup clear of the controls and, on phones, of the folded bottom panel (about 200 px).
    <Popup position={[place.lat, place.lng]} offset={[0, -16]} eventHandlers={{ remove: onClose }}
      autoPanPaddingTopLeft={[72, 90]}
      autoPanPaddingBottomRight={[16, typeof window !== "undefined" && window.innerWidth < 1024 ? 220 : 24]}>
      {/* Leaflet only closes popups on Escape while the map itself has focus; here focus is on "Go here". */}
      <div ref={box} tabIndex={-1} role="dialog" aria-label={place.name} className="min-w-[180px] text-[15px] text-ink outline-none"
        onKeyDown={(e) => {
          if (e.key === "Escape") map.closePopup();
        }}>
        <p className="text-[13px] font-bold tracking-wide text-muted uppercase">{place.label}</p>
        {place.name !== place.label && <p className="text-[17px] leading-tight font-bold">{place.name}</p>}
        <p className="mt-1">{[away, place.source].filter(Boolean).join(" · ")}</p>
        {!SHOWCASE && (
          <button ref={go} type="button" onClick={place.go}
            className="mt-2 inline-flex min-h-11 items-center rounded-full bg-primary px-4 font-bold text-white hover:bg-primary-hover">
            Go here
          </button>
        )}
      </div>
    </Popup>
  );
}

function placeTitle(p: MapPlacePin): string {
  return p.name === p.label || p.name.startsWith("Accessible ") ? `${p.label} (${p.source})` : `${p.label} at ${p.name} (${p.source})`;
}

export default function ExploreMap({
  hazards, selectedId, onSelect, fix, amenities = [], onAmenity, places = [], onPlace, onView, onPinOpen,
}: {
  hazards: Hazard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fix: UserFix | null;
  amenities?: AmenityPin[];
  onAmenity?: (pin: AmenityPin) => void;
  /** Accessible places from OpenStreetMap, across Sydney. */
  places?: MapPlacePin[];
  onPlace?: (pin: MapPlacePin) => void;
  onView?: (bounds: L.LatLngBounds, zoom: number) => void;
  /** A place popup opened (phones fold the bottom panel so the popup can be seen). */
  onPinOpen?: () => void;
}) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [openPlace, setOpenPlaceState] = useState<OpenPlace | null>(null);
  const setOpenPlace = useCallback((p: OpenPlace | null) => {
    setOpenPlaceState(p);
    if (p) onPinOpen?.();
  }, [onPinOpen]);
  // Kinds of pin turned off with the legend chips, remembered on this device.
  const [hiddenKinds, setHiddenKinds] = useState<string[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false); // phones: the pin chips open from a button
  useEffect(() => {
    try {
      const saved = JSON.parse(readStored(HIDDEN_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after mount
      if (Array.isArray(saved)) setHiddenKinds(saved.filter((k) => typeof k === "string"));
    } catch {
      // nothing saved, or unreadable: show everything
    }
  }, []);
  const [announce, setAnnounce] = useState("");
  const toggleKind = (kind: string, label: string) => {
    const hide = !hiddenKinds.includes(kind);
    const next = hide ? [...hiddenKinds, kind] : hiddenKinds.filter((k) => k !== kind);
    setHiddenKinds(next);
    writeStored(HIDDEN_KEY, JSON.stringify(next));
    setAnnounce(`${label} pins ${hide ? "hidden" : "shown"}`);
  };
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
    if (!map || !fix || wentToFix.current || !opensOn(fix)) return;
    wentToFix.current = true;
    if (!moved.current) map.setView([fix.lat, fix.lng], Math.max(map.getZoom(), 17), { animate: false });
  }, [map, fix]);

  // Every pin goes into one layer that groups them into number bubbles when zoomed out; your own dot stays out.
  const items: ClusterItem[] = useMemo(() => [
    ...places.filter((p) => !hiddenKinds.includes(p.kind)).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, icon: amenityIcon(p), iconKey: p.kind, title: placeTitle(p), z: 600,
      onClick: () => setOpenPlace({ id: p.id, name: p.name, label: p.label, source: p.source, lat: p.lat, lng: p.lng,
        go: () => onPlace?.(p) }) })),
    ...amenities.filter((pin) => !hiddenKinds.includes(pin.kind)).map((pin) => ({ id: pin.id, lat: pin.lat, lng: pin.lng, icon: amenityIcon(pin),
      iconKey: pin.kind, title: `${pin.label} at ${pin.name}`, z: 650,
      onClick: () => setOpenPlace({ id: pin.id, name: pin.name, label: pin.label, lat: pin.lat, lng: pin.lng,
        go: () => onAmenity?.(pin) }) })),
    ...hazards.filter((h) => !hiddenKinds.includes(h.kind)).map((h) => ({ id: `hazard:${h.id}`, lat: h.lat, lng: h.lng, icon: hazardIcon(h, h.id === selectedId),
      iconKey: `${h.kind}:${h.id === selectedId}`,
      title: `${HAZARD_LABEL[h.kind]}: ${h.title}`, z: h.id === selectedId ? 700 : 400, onClick: () => onSelect(h.id) })),
  ], [places, amenities, hazards, selectedId, onPlace, onAmenity, onSelect, hiddenKinds, setOpenPlace]);

  return (
    <div role="region" aria-label="Live map" className="absolute inset-0">
      {mountKey !== null && (
        <MapContainer
          key={mountKey}
          center={fix && opensOn(fix) ? [fix.lat, fix.lng] : CAMPUS}
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
            // Not tappable and drawn under the pins, so a pin right where you stand can still be tapped.
            <Marker position={[fix.lat, fix.lng]} icon={userIcon} alt="Your location" title="Your location" keyboard={false}
              interactive={false} zIndexOffset={-1000} />
          )}
          <ClusterLayer items={items} />
          {openPlace && <PlacePopup place={openPlace} fix={fix} onClose={() => setOpenPlace(null)} />}
          <ViewWatcher onView={onView} />
        </MapContainer>
      )}
      {/* Phones: the chips sit in a panel opened by "Choose pins" (the top of the map is busy with banners).
          Desktop: always shown as chips at the bottom left. */}
      <p role="status" className="sr-only">{announce}</p>
      <ul id="map-pin-kinds" aria-label="Pins on the map" className={cn(
        "absolute top-[4.5rem] right-3 left-[4.5rem] z-[650] flex-wrap gap-1.5 rounded-[16px] bg-surface p-2 shadow-lg",
        "lg:top-auto lg:right-auto lg:bottom-4 lg:left-3 lg:z-[500] lg:max-w-[calc(100%-4.5rem)] lg:bg-transparent lg:p-0 lg:shadow-none",
        // Phones: slides and fades open; invisible when closed, so it is never tapped or tabbed to by accident.
        "flex origin-top-left transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none",
        "lg:visible lg:translate-y-0 lg:scale-100 lg:opacity-100",
        pinsOpen ? "visible translate-y-0 scale-100 opacity-100" : "invisible -translate-y-1 scale-95 opacity-0")}>
        {fix && (
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] font-bold">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-primary" />
            You
          </li>
        )}
        {(Object.keys(AMENITY_STYLE) as PinKind[])
          .filter((kind) => amenities.some((pin) => pin.kind === kind) || places.some((p) => p.kind === kind))
          .map((kind) => (
            <li key={kind}>
              <KindToggle label={AMENITY_STYLE[kind].legend} colour={AMENITY_STYLE[kind].colour}
                on={!hiddenKinds.includes(kind)} onToggle={() => toggleKind(kind, AMENITY_STYLE[kind].legend)} />
            </li>
          ))}
        {(["slope", "roadworks", "lift", "amenity"] as HazardKind[]).map((kind) => (
          <li key={kind}>
            <KindToggle label={HAZARD_LABEL[kind]} colour={COLOUR[kind]} on={!hiddenKinds.includes(kind)}
              onToggle={() => toggleKind(kind, HAZARD_LABEL[kind])} />
          </li>
        ))}
      </ul>
      <div className="absolute top-[4.5rem] left-3 z-[500] flex flex-col gap-2 lg:top-3 lg:right-3 lg:left-auto">
        <button type="button" aria-label="Centre on your location" onClick={() => setRecenter((n) => n + 1)}
          className="flex size-12 items-center justify-center rounded-full border border-line-strong bg-surface text-primary shadow-sm hover:bg-bg">
          <LocateFixed aria-hidden="true" className="size-5" strokeWidth={2.4} />
        </button>
        {/* Second in the column: on phones the open bottom panel can cover the lowest buttons. */}
        <button type="button" aria-label="Choose pins" aria-expanded={pinsOpen} aria-controls="map-pin-kinds"
          onClick={() => setPinsOpen((v) => !v)}
          className={cn("flex size-12 items-center justify-center rounded-[12px] border lg:hidden",
            pinsOpen ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-ink hover:bg-bg")}>
          <Layers aria-hidden="true" className="size-5" strokeWidth={2.4} />
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
