// Greater Sydney, the area the API covers (api COVERAGE_BBOX): west, south, east, north.
const SYDNEY = { west: 149.97, south: -34.33, east: 151.63, north: -32.99 };

export function insideSydney(fix: { lat: number; lng: number } | null | undefined): boolean {
  return !!fix && fix.lng >= SYDNEY.west && fix.lng <= SYDNEY.east && fix.lat >= SYDNEY.south && fix.lat <= SYDNEY.north;
}

/** Where a trip starts: your location when it's inside Greater Sydney, otherwise Macquarie University station. */
export function startPlaceId(fix: { lat: number; lng: number } | null | undefined): string {
  return fix && insideSydney(fix) ? `coord:here:${fix.lat.toFixed(5)},${fix.lng.toFixed(5)}` : "mq-station";
}
