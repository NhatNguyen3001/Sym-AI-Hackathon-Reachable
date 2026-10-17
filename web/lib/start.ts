// Greater Sydney, the area the API covers (api COVERAGE_BBOX): west, south, east, north.
const SYDNEY = { west: 149.97, south: -34.33, east: 151.63, north: -32.99 };

/** Where a trip starts: your location when it's inside Greater Sydney. Null means the person types a start. */
export function startPlaceId(fix: { lat: number; lng: number } | null | undefined): string | null {
  if (!fix) return null;
  const inside = fix.lng >= SYDNEY.west && fix.lng <= SYDNEY.east && fix.lat >= SYDNEY.south && fix.lat <= SYDNEY.north;
  return inside ? `coord:here:${fix.lat.toFixed(5)},${fix.lng.toFixed(5)}` : null;
}
