"use client";
import dynamic from "next/dynamic";

/** Leaflet needs the browser, so the map only ever renders on the client. */
export const RouteMap = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[240px] w-full bg-map-bg" aria-hidden="true" />,
});
