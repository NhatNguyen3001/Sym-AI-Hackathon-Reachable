"use client";
import { useEffect, useState } from "react";

export interface UserFix {
  lat: number;
  lng: number;
  accuracy: number;
}

export type LocationStatus = "pending" | "ready" | "denied" | "unsupported";

export function useUserLocation() {
  const [fix, setFix] = useState<UserFix | null>(null);
  const [status, setStatus] = useState<LocationStatus>("pending");

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state is only readable after mount (no hydration mismatch)
      setStatus("unsupported");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStatus("ready");
      },
      () => setStatus("denied"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { fix, status };
}
