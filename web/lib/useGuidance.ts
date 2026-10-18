"use client";
import { useEffect, useMemo, useState } from "react";
import {
  locate, navKey, OFF_ROUTE_M, pointAlong, progressAt, walkedLine, type LatLng, type NavFix, type NavProgress, type NavRoute,
} from "./navigation";
import type { UserFix } from "./useUserLocation";

/** Further than this from the whole route, you're nowhere near it: offer a preview instead of "off route". */
export const FAR_FROM_ROUTE_M = 300;
/** Preview pace: metres per tick, a tick every PREVIEW_TICK_MS (about 7x walking speed). */
const PREVIEW_STEP_M = 6;
const PREVIEW_TICK_MS = 600;

export interface Guidance {
  fix: NavFix | null;
  progress: NavProgress | null;
  /** Where "you" are: your location, or the preview point. */
  position: LatLng | null;
  walked: LatLng[];
  offRoute: boolean;
  farFromRoute: boolean;
}

const NONE: Guidance = { fix: null, progress: null, position: null, walked: [], offRoute: false, farFromRoute: false };

/** Where you are on the route and whether you've left it. On a ride the drawn line is only a guess (and GPS is poor
 *  underground), so being away from it is never "off route" there. */
export function assessGuidance(nav: NavRoute, position: LatLng,
  { accuracy, preview, hintM }: { accuracy: number; preview: boolean; hintM: number }): Guidance {
  const fix = locate(nav, position[0], position[1], hintM);
  if (!fix) return NONE;
  // A poor GPS fix can sit tens of metres away: only count what the accuracy doesn't explain.
  const off = fix.offM - (preview ? 0 : Math.min(40, accuracy));
  const progress = progressAt(nav, fix.alongM);
  const riding = progress.current.icon === "ride";
  // Nowhere near the route: the nearest point means nothing, so no progress yet.
  if (!preview && !riding && off > FAR_FROM_ROUTE_M) return { ...NONE, fix, position, farFromRoute: true };
  return { fix, progress, position, walked: walkedLine(nav, fix), offRoute: !riding && off > OFF_ROUTE_M, farFromRoute: false };
}

export function useGuidance(nav: NavRoute | null, on: boolean, user: UserFix | null, preview: boolean): Guidance {
  const [previewM, setPreviewM] = useState(0);
  // Furthest point reached, so a route that doubles back near itself doesn't jump backwards.
  const [hintM, setHintM] = useState(0);

  useEffect(() => {
    if (!on || !preview || !nav) return;
    const id = setInterval(() => setPreviewM((m) => Math.min(nav.total, m + PREVIEW_STEP_M)), PREVIEW_TICK_MS);
    return () => clearInterval(id);
  }, [on, preview, nav]);

  // A different route (not the same one re-planned by a live update) starts from its beginning.
  const key = nav ? navKey(nav) : "";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset progress for a different route or preview
    setPreviewM(0);
    setHintM(0);
  }, [key, preview]);

  const guidance = useMemo(() => {
    if (!on || !nav || nav.line.length < 2) return NONE;
    const position: LatLng | null = preview ? pointAlong(nav, previewM) : user ? [user.lat, user.lng] : null;
    if (!position) return NONE;
    return assessGuidance(nav, position, { accuracy: user?.accuracy ?? 0, preview, hintM });
  }, [on, nav, preview, previewM, user, hintM]);

  const along = guidance.progress && guidance.fix ? guidance.fix.alongM : 0;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remember progress for the next position
    if (along - 20 > hintM) setHintM(along - 20);
  }, [along, hintM]);

  return guidance;
}
