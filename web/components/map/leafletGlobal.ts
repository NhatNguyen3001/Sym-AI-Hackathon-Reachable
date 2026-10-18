import L from "leaflet";

// leaflet.markercluster extends the global `L`; bundlers don't create one, so give it ours before it loads.
(globalThis as unknown as { L: typeof L }).L = L;
