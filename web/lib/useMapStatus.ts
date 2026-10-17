"use client";
import { useCallback, useEffect, useState } from "react";
import { getMapStatus } from "./api";
import { useEvents } from "./events";
import type { MapStatus } from "./types";

/** The map agent's status, refreshed when a run finishes (SSE map_updated). */
export function useMapStatus(): [MapStatus | null, () => Promise<MapStatus | null>] {
  const [status, setStatus] = useState<MapStatus | null>(null);
  const reload = useCallback(async () => {
    const r = await getMapStatus();
    setStatus(r.data);
    return r.data;
  }, []);
  useEffect(() => {
    let current = true;
    getMapStatus().then((r) => {
      if (current) setStatus(r.data);
    });
    return () => {
      current = false;
    };
  }, []);
  useEvents(["map_updated"], () => {
    reload();
  });
  return [status, reload];
}
