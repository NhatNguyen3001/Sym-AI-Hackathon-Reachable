// Greater Sydney, the area the map agent gathers (api SYDNEY): west, south, east, north.
export const SYDNEY_BOX: [number, number, number, number] = [150.5, -34.2, 151.4, -33.4];
const ZOOMED_OUT = 13;

/** Which box of places to ask for: the view plus 20% at street level; all of Sydney once zoomed out. */
export function placesBox(view: { west: number; south: number; east: number; north: number }, zoom: number):
  [number, number, number, number] {
  if (zoom < ZOOMED_OUT) return SYDNEY_BOX;
  const dx = (view.east - view.west) * 0.2;
  const dy = (view.north - view.south) * 0.2;
  return [view.west - dx, view.south - dy, view.east + dx, view.north + dy];
}
