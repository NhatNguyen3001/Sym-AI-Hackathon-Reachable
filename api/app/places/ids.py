"""Place ids that carry their own coordinates: `coord:<lat>,<lng>` (pinned) and `coord:here:<lat>,<lng>` (device location)."""
from app.routing.places import Place


class BadPlaceId(ValueError):
    pass


def parse_coord_id(place_id: str) -> Place:
    rest = place_id.removeprefix("coord:")
    name = "Pinned location"
    if rest.startswith("here:"):
        rest, name = rest.removeprefix("here:"), "Your location"
    try:
        lat_s, lng_s = rest.split(",")
        lat, lng = float(lat_s), float(lng_s)
    except ValueError as e:
        raise BadPlaceId(place_id) from e
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise BadPlaceId(place_id)
    return Place(id=place_id, name=name, kind="place", lat=lat, lng=lng)
