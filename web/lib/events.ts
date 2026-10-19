"use client";
// Live updates from the API over Server-Sent Events. EventSource reconnects on its own after a drop.
import { useEffect, useRef } from "react";
import { API_URL } from "./api";
import { sessionId } from "./session";
import { SHOWCASE } from "./showcase";

export type ServerEvent = "barrier_changed" | "lift_changed" | "weather_changed" | "report_created" | "agent_run" | "map_updated";

export function useEvents(events: ServerEvent[], handler: (event: ServerEvent, data: Record<string, unknown>) => void) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const key = events.join(",");
  useEffect(() => {
    if (SHOWCASE || typeof EventSource === "undefined") return;   // the showcase has no live updates
    const source = new EventSource(`${API_URL}/events?session=${encodeURIComponent(sessionId())}`);
    const listeners = key.split(",").map((name) => {
      const fn = (e: MessageEvent) => {
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(e.data);
        } catch {
          // keep empty data
        }
        handlerRef.current(name as ServerEvent, data);
      };
      source.addEventListener(name, fn);
      return [name, fn] as const;
    });
    return () => {
      listeners.forEach(([name, fn]) => source.removeEventListener(name, fn));
      source.close();
    };
  }, [key]);
}
