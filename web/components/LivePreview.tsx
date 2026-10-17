"use client";
import { useEffect, useState } from "react";
import { UpdateRow } from "./Rows";
import { getUpdates } from "@/lib/api";
import { updates as sampleUpdates } from "@/lib/placeholder";
import type { UpdateItem } from "@/lib/types";

/** First three live updates; starts with sample rows so the static page never waits on the API. */
export function LivePreview() {
  const [items, setItems] = useState<UpdateItem[]>(sampleUpdates.slice(0, 3));
  useEffect(() => {
    let current = true;
    getUpdates().then((r) => current && !r.sample && setItems(r.data.slice(0, 3)));
    return () => {
      current = false;
    };
  }, []);
  return (
    <ul className="rounded-[18px] border border-line bg-surface">
      {items.map((i) => <UpdateRow key={i.id} item={i} />)}
    </ul>
  );
}
