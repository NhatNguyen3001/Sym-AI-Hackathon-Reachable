"""Router selection: Valhalla for Sydney, the cycle 1 campus graph as the offline fallback."""
from typing import Protocol

from app.routing.cost import Context
from app.routing.geo import in_bbox, parse_bbox
from app.routing.graph import nearest_node
from app.routing.route import find_routes
from app.routing.valhalla import ValhallaClient, ValhallaRouter

CAMPUS_NOTE = "Using the offline campus map"


class Router(Protocol):
    def plan(self, start, end, profile, ctx: Context) -> dict: ...


class CampusRouter:
    """Wraps the cycle 1 NetworkX router. Only covers the area of the prebuilt campus graph."""

    def __init__(self, G, speed_mps: float, exit_names: dict[str, str]):
        self.G, self.speed, self.exit_names = G, speed_mps, exit_names
        ys = [d["y"] for _, d in G.nodes(data=True)]
        xs = [d["x"] for _, d in G.nodes(data=True)]
        self.bbox = (min(xs), min(ys), max(xs), max(ys))

    def covers(self, place) -> bool:
        return in_bbox(place.lat, place.lng, self.bbox)

    def plan(self, start, end, profile, ctx: Context) -> dict:
        for p in (start, end):
            if p.node is None:
                p.node = nearest_node(self.G, p.lat, p.lng)
        r = find_routes(self.G, start, end, profile, ctx, self.speed, self.exit_names)
        return {k: v for k, v in r.items() if k != "edges"}


def get_router(settings, G, places) -> Router:
    if settings.router == "campus":
        return CampusRouter(G, settings.speed_mps, places.exit_names)
    return ValhallaRouter(ValhallaClient(settings.valhalla_url), parse_bbox(settings.coverage_bbox),
                          settings.max_leg_km, settings.speed_mps, places.exit_names)
