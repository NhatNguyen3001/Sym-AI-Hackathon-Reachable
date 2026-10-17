"use client";
import { cn } from "cn";
import { freshnessLine } from "@/lib/freshness";
import type { MapStatus } from "@/lib/types";

/** "Places and roadworks updated today, 9:42 am" — when the map agent last gathered the pins. */
export function MapFreshness({ status, className }: { status: MapStatus | null; className?: string }) {
  const line = status ? freshnessLine(status, new Date()) : "";
  if (!line) return null;
  return <p className={cn("text-[13px] font-bold text-muted", className)}>{line}</p>;
}
