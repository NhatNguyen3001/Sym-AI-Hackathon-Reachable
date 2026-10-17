"use client";
import { useEffect, useState } from "react";

/**
 * A fresh key while the component is mounted and visible, or null while it isn't.
 *
 * Next.js keeps visited pages mounted but hidden (React <Activity>). Hiding runs effect cleanups, and
 * react-leaflet's MapContainer destroys its Leaflet map in one, but keeps the dead map in state. When the
 * page is shown again, layers are added to the destroyed map ("reading 'appendChild'", "Map container is
 * being reused by another instance"). Rendering the map only while this returns a key, and keying the
 * MapContainer with it, gives every reveal a brand-new map on a brand-new element.
 */
export function useVisibleMount(): number | null {
  const [key, setKey] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the effect running is the signal we want
    setKey((k) => (k ?? 0) + 1);
    return () => setKey(null);
  }, []);
  return key;
}
