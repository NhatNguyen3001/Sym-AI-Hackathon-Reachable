"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp } from "lucide-react";
import { PlaceInput } from "@/components/PlaceInput";
import { Button } from "@/components/ui/button";
import { getUpdates } from "@/lib/api";
import { distanceLabel, HAZARD_LABEL, hazardsFromUpdates, type Hazard, type HazardKind } from "@/lib/hazards";
import { useUserLocation } from "@/lib/useUserLocation";
import type { Place } from "@/lib/types";

const ExploreMap = dynamic(() => import("./ExploreMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-map-bg" aria-hidden="true" />,
});

const FILTERS: { id: HazardKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "slope", label: "Slopes" },
  { id: "roadworks", label: "Roadworks" },
  { id: "lift", label: "Lifts" },
  { id: "amenity", label: "Amenities" },
];

export function ExploreClient() {
  const router = useRouter();
  const { fix, status } = useUserLocation();
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [filter, setFilter] = useState<HazardKind | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [thanks, setThanks] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [to, setTo] = useState<Place | null>(null);

  useEffect(() => {
    let current = true;
    getUpdates().then((r) => {
      if (current) setHazards(hazardsFromUpdates(r.data));
    });
    return () => {
      current = false;
    };
  }, []);

  const visible = useMemo(
    () => hazards.filter((h) => !hidden.includes(h.id) && (filter === "all" || h.kind === filter)),
    [hazards, hidden, filter],
  );
  const selected = visible.find((h) => h.id === selectedId) ?? null;

  function go(e: React.FormEvent) {
    e.preventDefault();
    if (!to) return;
    const from = fix
      ? `coord:here:${fix.lat.toFixed(5)},${fix.lng.toFixed(5)}`
      : "mq-station";
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
      <ExploreMap hazards={visible} selectedId={selected?.id ?? null} onSelect={setSelectedId} fix={fix} />

      <div className="pointer-events-none absolute inset-x-0 bottom-20 z-[450] flex flex-col gap-3 px-3 lg:bottom-4">
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

        <form onSubmit={go} className="pointer-events-auto rounded-[22px] border border-line bg-surface p-3 shadow-lg">
          {status !== "ready" && status !== "pending" && (
            <p className="mb-2 px-1 text-[14px] text-muted">Location is off, so a route starts at Macquarie University station.</p>
          )}
          <PlaceInput label="Where to?" value={to} onChange={setTo} placeholder="Search a place" menuPlacement="up" />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {FILTERS.filter((f) => f.id !== "all").map((f) => {
              const on = filter === f.id;
              return (
                <button key={f.id} type="button" aria-pressed={on}
                  onClick={() => setFilter(on ? "all" : f.id)}
                  className={`min-h-12 rounded-[14px] px-1 text-[13px] font-bold ${on ? "bg-primary text-white" : "bg-bg text-ink"}`}>
                  {f.label}
                </button>
              );
            })}
          </div>
          <Button type="submit" size="lg" className="mt-3 w-full" disabled={!to}>Show a step-free route</Button>
        </form>
        <p role="status" className="sr-only">{note}</p>
      </div>
    </div>
  );
}
