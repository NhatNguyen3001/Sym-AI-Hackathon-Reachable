"use client";
import { useCallback, useEffect, useState } from "react";
import { SampleDataBanner } from "@/components/Banners";
import { FilterChips } from "@/components/FilterChips";
import { MapFreshness } from "@/components/MapFreshness";
import { OwnerMapUpdate } from "@/components/OwnerMapUpdate";
import { UpdateRow } from "@/components/Rows";
import { getUpdates } from "@/lib/api";
import { useEvents } from "@/lib/events";
import { useMapStatus } from "@/lib/useMapStatus";
import type { UpdateItem, UpdateType } from "@/lib/types";

type Filter = UpdateType | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All updates" },
  { value: "report", label: "Traveller reports" },
  { value: "roadworks", label: "Road and path works" },
  { value: "transport", label: "Station lifts" },
  { value: "weather", label: "Weather" },
  { value: "venue", label: "Building access" },
];

export function LiveClient() {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<UpdateItem[] | null>(null);
  const [sample, setSample] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [mapStatus, reloadMapStatus] = useMapStatus();

  const loadItems = useCallback(async (f: Filter) => {
    const r = await getUpdates(f);
    setItems(r.data);
    setSample(r.sample);
    return r.data;
  }, []);

  useEffect(() => {
    let current = true;
    getUpdates(filter).then((r) => {
      if (!current) return;
      setItems(r.data);
      setSample(r.sample);
    });
    return () => {
      current = false;
    };
  }, [filter]);

  useEvents(["barrier_changed", "lift_changed", "weather_changed", "report_created", "map_updated"], async () => {
    const fresh = await loadItems(filter);
    if (fresh[0]) setAnnounce(`New update: ${fresh[0].title} at ${fresh[0].place}.`);
  });

  return (
    <div className="space-y-4">
      <section aria-label="How to read an update" className="rounded-[18px] border border-line bg-surface p-5">
        <h2 className="text-[18px] font-bold">How to read an update</h2>
        <ul className="mt-2 space-y-1 text-[16px]">
          <li><strong>In effect</strong> — checked, and it is in the way now.</li>
          <li><strong>Unconfirmed</strong> — someone reported it. It has not been checked yet.</li>
          <li><strong>Cleared</strong> — the problem is gone. People should be able to get through.</li>
        </ul>
      </section>
      <section aria-label="Map updates" className="flex flex-wrap items-center justify-between gap-3">
        <MapFreshness status={mapStatus} className="text-[15px]" />
        <OwnerMapUpdate status={mapStatus} reload={reloadMapStatus} />
      </section>
      <FilterChips label="Show" options={FILTERS} value={filter} onChange={setFilter} />
      <SampleDataBanner show={sample} />
      <p role="status" className="sr-only">{announce}</p>
      <section aria-label="Updates" className="rounded-[18px] border border-line bg-surface">
        {items === null ? (
          <p className="p-5 text-muted">Loading updates…</p>
        ) : items.length === 0 ? (
          <p className="p-5 text-muted">Nothing in this group right now.</p>
        ) : (
          <ul>{items.map((i) => <UpdateRow key={i.id} item={i} />)}</ul>
        )}
      </section>
    </div>
  );
}
