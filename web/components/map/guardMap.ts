import type L from "leaflet";

/**
 * Leaflet 1.9 bug: an animated zoom (e.g. our fitBounds on load) schedules `_onZoomTransitionEnd` with a
 * setTimeout that `map.remove()` never cancels. Leaving the page mid-animation removes the map, then the timer
 * runs against the destroyed panes ("Cannot read properties of undefined (reading '_leaflet_pos')").
 * The callback returns early when `_animatingZoom` is false, so clear it while the map is being removed.
 * Registered once at creation (not in an effect) so it can't be unhooked before `unload` fires.
 */
export function guardMap(map: L.Map | null): L.Map | null {
  map?.once("unload", () => {
    (map as unknown as { _animatingZoom: boolean })._animatingZoom = false;
  });
  return map;
}
