"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { SlidersHorizontal, ThumbsUp } from "lucide-react";
import { NeedsTicks } from "@/components/NeedsTicks";
import { PlaceSearch } from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import { WeatherBanner } from "@/components/Banners";
import { getAmenities, getUpdates, getWeather } from "@/lib/api";
import { startPlaceId } from "@/lib/start";
import { distanceLabel, HAZARD_LABEL, hazardsFromUpdates, type Hazard } from "@/lib/hazards";
import { loadProfile, saveProfile } from "@/lib/profile";
import { profile as defaultProfile } from "@/lib/placeholder";
import { useUserLocation } from "@/lib/useUserLocation";
import type { AmenityPin, Place, Profile, Weather } from "@/lib/types";

const ExploreMap = dynamic(() => import("./ExploreMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-map-bg" aria-hidden="true" />,
});

export function ExploreClient() {
  const router = useRouter();
  const { fix, status } = useUserLocation();
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [going, setGoing] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [thanks, setThanks] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [to, setTo] = useState<Place | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [amenities, setAmenities] = useState<AmenityPin[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const drag = useRef({ y: 0, moved: false });

  useEffect(() => {
    let current = true;
    getUpdates().then((r) => {
      if (current) setHazards(hazardsFromUpdates(r.data));
    });
    getWeather().then((r) => {
      if (current) setWeather(r.data);
    });
    getAmenities().then((r) => {
      if (current) setAmenities(r.data);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state is only readable after mount (no hydration mismatch)
    setProfile(loadProfile());
    return () => {
      current = false;
    };
  }, []);

  const visible = useMemo(
    () => hazards.filter((h) => !hidden.includes(h.id)),
    [hazards, hidden],
  );
  const selected = visible.find((h) => h.id === selectedId) ?? null;

  function saveFilter() {
    saveProfile(profile);
    setFiltersOpen(false);
    setExpanded(false);
  }

  function goToAmenity(pin: AmenityPin) {
    saveProfile(profile);
    const from = startPlaceId(fix);
    router.push(`/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(pin.placeId)}`);
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (!to) return;
    setGoing(true);  // say so at once; the route page takes over from here
    saveProfile(profile);
    const from = startPlaceId(fix);
    router.push(`/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to.id)}`);
  }

  const locationText = status === "ready"
    ? "Your location is on the map."
    : status === "pending"
      ? "Looking for your location."
      : "Location is off. The map stays on Macquarie University.";

  return (
    <div className="relative min-h-0 flex-1">
      <h1 className="sr-only">Around you</h1>
      <p role="status" className="sr-only">{locationText}</p>
      <ExploreMap hazards={visible} selectedId={selected?.id ?? null} onSelect={setSelectedId} fix={fix}
        amenities={to ? [] : amenities} onAmenity={goToAmenity} />

      <div className="pointer-events-none absolute top-3 right-3 left-[4.5rem] z-[550] lg:top-3 lg:right-20 lg:left-auto lg:max-w-sm">
        <div className="pointer-events-auto">
          <WeatherBanner weather={weather} />
        </div>
      </div>

      <div className="pointer-events-none absolute top-3 right-16 left-3 z-[600] hidden lg:block">
        <form onSubmit={go} className="pointer-events-none flex items-start gap-2">
          <div className="pointer-events-auto w-[min(100%,380px)] rounded-[18px] bg-surface p-3 shadow-lg">
            {status !== "ready" && status !== "pending" && (
              <p className="mb-2 text-[14px] text-muted">Location is off, so a route starts at Macquarie University station.</p>
            )}
            <PlaceSearch label="Where to?" value={to} onChange={setTo} />
            <button type="button" aria-expanded={filtersOpen} aria-label={filtersOpen ? "Hide filter" : "Filter"}
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn("mt-2 inline-flex size-11 items-center justify-center rounded-full border",
                filtersOpen ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-ink")}>
              <SlidersHorizontal aria-hidden="true" className="size-5" strokeWidth={2.4} />
            </button>
            {filtersOpen && (
              <div className="mt-2 max-h-[34dvh] overflow-y-auto pr-1">
                <NeedsTicks profile={profile} onChange={setProfile} />
                <Button type="button" variant="secondary" size="lg" className="mt-3 w-full" onClick={saveFilter}>Save filter</Button>
              </div>
            )}
            <Button type="submit" size="lg" className="mt-2 w-full" disabled={!to || going}>{going ? "Finding…" : "Show a step-free route"}</Button>
          </div>
        </form>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[600] flex flex-col gap-3 px-3 pb-[env(safe-area-inset-bottom)] lg:bottom-4 lg:left-3 lg:max-w-md lg:pb-0">
        {selected && (
          <article className="pointer-events-auto rounded-[18px] bg-[#15201b] p-4 text-white shadow-lg">
            <p className="text-[14px] font-bold tracking-wide text-[#ffd7a8] uppercase">{HAZARD_LABEL[selected.kind]}</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[22px] leading-tight font-bold">{selected.title}</h2>
                <p className="text-[18px] font-bold">{distanceLabel(fix, selected.lat, selected.lng) ?? selected.place}</p>
                <p className="text-[15px] text-[#d5ddd8]">{selected.place}</p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)}
                className="inline-flex min-h-11 items-center rounded-[12px] px-2 text-[15px] font-bold text-white underline">
                Close
              </button>
            </div>
            <p className="mt-2 text-[14px] text-[#d5ddd8]">{selected.time} · {selected.source}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button"
                onClick={() => {
                  setHidden((ids) => [...ids, selected.id]);
                  setSelectedId(null);
                  setNote("Hidden on your map. This does not change it for other people.");
                }}
                className="inline-flex min-h-12 items-center rounded-full bg-[#e11d48] px-4 font-bold text-white">
                Not there
              </button>
              <button type="button"
                onClick={() => {
                  setThanks((t) => ({ ...t, [selected.id]: (t[selected.id] ?? 0) + 1 }));
                  setNote("Thanks. That stays on this device.");
                }}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1d4fa8] px-4 font-bold text-white">
                <ThumbsUp aria-hidden="true" className="size-5" strokeWidth={2.4} />
                Still there{(thanks[selected.id] ?? 0) > 0 ? ` ${thanks[selected.id]}` : ""}
              </button>
            </div>
          </article>
        )}

        <form onSubmit={go} className="pointer-events-auto rounded-[22px] border border-line bg-surface p-3 shadow-lg lg:hidden">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Hide options" : "Show options"}
            onPointerDown={(e) => {
              drag.current = { y: e.clientY, moved: false };
            }}
            onPointerMove={(e) => {
              if (Math.abs(e.clientY - drag.current.y) > 8) drag.current.moved = true;
            }}
            onPointerUp={(e) => {
              const dy = e.clientY - drag.current.y;
              if (dy > 28) setExpanded(false);
              else if (dy < -28) setExpanded(true);
            }}
            onClick={() => {
              if (drag.current.moved) {
                drag.current.moved = false;
                return;
              }
              setExpanded((v) => !v);
            }}
            className="mx-auto mb-2 flex h-8 w-16 items-center justify-center rounded-full"
          >
            <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-line-strong" />
          </button>
          {status !== "ready" && status !== "pending" && (
            <p className="mb-2 px-1 text-[14px] text-muted">Location is off, so a route starts at Macquarie University station.</p>
          )}
          <PlaceSearch label="Where to?" value={to} onChange={setTo} />
          {expanded && (
            <div className="mt-3 max-h-[38dvh] overflow-y-auto">
              <NeedsTicks profile={profile} onChange={setProfile} />
              <Button type="button" variant="secondary" size="lg" className="mt-3 w-full" onClick={saveFilter}>Save filter</Button>
            </div>
          )}
          {(expanded || to) && (
            <Button type="submit" size="lg" className="mt-3 w-full" disabled={!to || going}>{going ? "Finding…" : "Show a step-free route"}</Button>
          )}
        </form>
        <p role="status" className="sr-only">{note}</p>
      </div>
    </div>
  );
}
