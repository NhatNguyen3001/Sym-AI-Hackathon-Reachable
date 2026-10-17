"use client";
import { useCallback, useEffect, useState } from "react";
import { SampleDataBanner } from "@/components/Banners";
import { FilterChips } from "@/components/FilterChips";
import { AgentCard, UpdateRow } from "@/components/Rows";
import { Card } from "@/components/layout/Page";
import { getAgents, getUpdates } from "@/lib/api";
import { useEvents } from "@/lib/events";
import type { AgentCardData, UpdateItem, UpdateType } from "@/lib/types";

type Filter = UpdateType | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "report", label: "User reports" },
  { value: "roadworks", label: "Roadworks" },
  { value: "transport", label: "Transport" },
  { value: "weather", label: "Weather" },
  { value: "venue", label: "Venues" },
];

export function LiveClient() {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<UpdateItem[] | null>(null);
  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [sample, setSample] = useState(false);
  const [announce, setAnnounce] = useState("");

  const loadItems = useCallback(async (f: Filter) => {
    const r = await getUpdates(f);
    setItems(r.data);
    setSample(r.sample);
    return r.data;
  }, []);
  const loadAgents = useCallback(async () => setAgents((await getAgents()).data), []);

  // Fetch on mount and when the filter changes; ignore a response that arrives after a newer request.
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
  useEffect(() => {
    let current = true;
    getAgents().then((r) => current && setAgents(r.data));
    return () => {
      current = false;
    };
  }, []);

  useEvents(["barrier_changed", "lift_changed", "weather_changed", "report_created", "agent_run"], async (event) => {
    if (event === "agent_run" || event === "report_created") loadAgents();
    if (event === "agent_run") return;
    const fresh = await loadItems(filter);
    if (fresh[0]) setAnnounce(`New update: ${fresh[0].title}`);
  });

  return (
    <div className="flex flex-wrap gap-6">
      <div className="min-w-0 flex-[1_1_560px] space-y-4">
        <FilterChips label="Show updates about" options={FILTERS} value={filter} onChange={setFilter} />
        <SampleDataBanner show={sample} />
        <p role="status" className="sr-only">{announce}</p>
        <section aria-label="Updates" className="rounded-[18px] border border-line bg-surface">
          {items === null ? (
            <p className="p-5 text-muted">Loading updates…</p>
          ) : items.length === 0 ? (
            <p className="p-5 text-muted">Nothing in this category right now.</p>
          ) : (
            <ul>{items.map((i) => <UpdateRow key={i.id} item={i} />)}</ul>
          )}
        </section>
      </div>
      <aside aria-labelledby="agents-h" className="flex-[1_1_320px]">
        <Card>
          <h2 id="agents-h" className="text-[20px] font-bold">Sym agents</h2>
          <p className="text-[15px] text-muted">The team keeping the map up to date</p>
          <ul className="mt-4 space-y-3">{agents.map((a) => <AgentCard key={a.name} agent={a} />)}</ul>
        </Card>
      </aside>
    </div>
  );
}
