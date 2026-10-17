"use client";
import "./leafletGlobal";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

export interface ClusterItem {
  id: string;
  lat: number;
  lng: number;
  icon: L.DivIcon;
  /** Accessible name of the pin. */
  title: string;
  z?: number;
  onClick: () => void;
}

/** A soft blue bubble (primary-soft fill, primary number): calm on the map, still easy to read. */
function bubble(cluster: L.MarkerCluster) {
  const n = cluster.getChildCount();
  const size = n < 10 ? 40 : n < 100 ? 46 : 54;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    html: `<span style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border-radius:999px;background:#e6edf9;color:#1d4fa8;font-weight:700;font-size:15px;border:3px solid #fff;box-shadow:0 0 0 2px #1d4fa8,0 2px 8px rgba(21,32,27,.25)"><span aria-hidden="true">${n}</span><span class="sr-only">${n} places here, tap to see them</span></span>`,
  });
}

/** Pins that join into number bubbles when zoomed out (spec section 5). At the closest zoom, a bubble that is
 * still there opens into its pins when tapped. */
export function ClusterLayer({ items }: { items: ClusterItem[] }) {
  const map = useMap();
  const group = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const latest = useRef(new Map<string, ClusterItem>());

  useEffect(() => {
    const g = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      // Far out, group generously; at street level only pins that would overlap join (a mall full of shops).
      maxClusterRadius: (zoom: number) => (zoom >= 17 ? 44 : 60), // pins are 40 px: closer ones would overlap
      iconCreateFunction: bubble,
    });
    map.addLayer(g);
    group.current = g;
    const all = markers.current;
    return () => {
      map.removeLayer(g);
      all.clear();
      group.current = null;
    };
  }, [map]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    latest.current = new Map(items.map((i) => [i.id, i]));
    const gone: L.Marker[] = [];
    for (const [id, m] of markers.current) {
      if (!latest.current.has(id)) {
        gone.push(m);
        markers.current.delete(id);
      }
    }
    if (gone.length) g.removeLayers(gone);
    const added: L.Marker[] = [];
    for (const it of items) {
      const m = markers.current.get(it.id);
      if (m) {
        m.setIcon(it.icon);
        m.setZIndexOffset(it.z ?? 0);
        continue;
      }
      const marker = L.marker([it.lat, it.lng], { icon: it.icon, title: it.title, alt: it.title, keyboard: true,
        zIndexOffset: it.z ?? 0 });
      marker.on("click", () => latest.current.get(it.id)?.onClick());
      // Leaflet only opens popups from the keyboard; these pins act on Enter and Space like any button.
      marker.on("keypress", (e: L.LeafletKeyboardEvent) => {
        const k = e.originalEvent.key;
        if (k === "Enter" || k === " ") {
          e.originalEvent.preventDefault();
          latest.current.get(it.id)?.onClick();
        }
      });
      markers.current.set(it.id, marker);
      added.push(marker);
    }
    if (added.length) g.addLayers(added);
  }, [items]);

  return null;
}
