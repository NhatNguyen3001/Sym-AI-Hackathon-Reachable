"""Turns raw Transport for NSW Trip Planner and alert JSON into small records. No network here."""
import re
from dataclasses import dataclass, field
from datetime import datetime

WALK_CLASSES = {99, 100}
MODES = {1: "train", 2: "metro", 4: "lightrail", 5: "bus", 7: "coach", 9: "ferry", 11: "bus"}
PATH_TYPES = {"ELEVATOR": "lift", "LEVEL": "level", "ESCALATOR": "escalator", "STAIRS": "stairs", "RAMP": "ramp"}
_PLATFORMS = re.compile(r"platforms?\s+(\d+[a-z]?(?:\s*(?:/|,|&|and|to|-)\s*\d+[a-z]?)*)", re.I)


@dataclass
class StationPath:
    station: str
    stop_id: str | None
    seconds: int
    types: list[str]                     # lift | level | escalator | stairs | ramp, in walking order
    levels: list[tuple[int, int]]        # (from, to) per element
    street: tuple[float, float] | None   # (lat, lng) where the path meets the street


@dataclass
class Walk:
    seconds: int
    coords: list[list[float]]            # GeoJSON order [lng, lat]
    start: tuple[float, float]
    end: tuple[float, float]
    arrive_path: StationPath | None = None  # station walked into at the end of this walk
    leave_path: StationPath | None = None   # station walked out of at the start of this walk


@dataclass
class Stop:
    name: str
    stop_id: str | None
    platform: str
    lat: float
    lng: float


@dataclass
class Ride:
    mode: str
    line: str
    headsign: str
    origin: Stop
    dest: Stop
    depart: datetime
    arrive: datetime
    stops: int
    wheelchair: bool | None
    coords: list[list[float]]


@dataclass
class Journey:
    legs: list  # Walk | Ride
    interchanges: int


@dataclass
class LiftAlert:
    id: str
    text: str
    url: str | None
    station: str
    stop_ids: list[str]
    osm_ids: set[int] = field(default_factory=set)


def _time(point: dict, kind: str) -> datetime:
    raw = point.get(f"{kind}TimeEstimated") or point[f"{kind}TimePlanned"]
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def _geo(coords) -> list[list[float]]:
    return [[c[1], c[0]] for c in coords or []]


def _station_path(info: dict) -> StationPath:
    elems = info.get("footPathElem") or []
    leaving = info.get("position") == "BEFORE"  # walking out of the station, platform first
    inner = ((elems[0]["origin"] if leaving else elems[-1]["destination"]).get("location") or {}) if elems else {}
    outer = ((elems[-1]["destination"] if leaving else elems[0]["origin"]).get("location") or {}) if elems else {}
    c = outer.get("coord")
    return StationPath(station=inner.get("name", "the station"), stop_id=inner.get("id"),
                       seconds=int(info.get("duration") or 0),
                       types=[PATH_TYPES.get(e.get("type"), "level") for e in elems],
                       levels=[(int(e.get("levelFrom") or 0), int(e.get("levelTo") or 0)) for e in elems],
                       street=(c[0], c[1]) if c else None)


def _stop(point: dict) -> Stop:
    parent = point.get("parent") or {}
    props = point.get("properties") or {}
    c = point.get("coord") or parent.get("coord") or [0, 0]
    stop_id = parent.get("id") if parent.get("type") == "stop" else point.get("id")
    return Stop(name=(point.get("name") or "").split(",")[0], stop_id=stop_id,
                platform=props.get("platformName") or "", lat=c[0], lng=c[1])


def parse_journeys(raw: dict) -> list[Journey]:
    out = []
    for j in raw.get("journeys") or []:
        legs: list = []
        for leg in j.get("legs") or []:
            tr = leg.get("transportation") or {}
            cls = (tr.get("product") or {}).get("class")
            if cls in WALK_CLASSES:
                w = Walk(seconds=int(leg.get("duration") or 0), coords=_geo(leg.get("coords")),
                         start=tuple(leg["origin"]["coord"]), end=tuple(leg["destination"]["coord"]))
                for info in leg.get("footPathInfo") or []:
                    if info.get("position") == "BEFORE":
                        w.leave_path = _station_path(info)
                    else:
                        w.arrive_path = _station_path(info)
                legs.append(w)
                continue
            props = leg.get("properties") or {}
            legs.append(Ride(mode=MODES.get(cls, "bus"), line=tr.get("disassembledName") or tr.get("number") or "",
                             headsign=((tr.get("destination") or {}).get("name") or "").split(",")[0],
                             origin=_stop(leg["origin"]), dest=_stop(leg["destination"]),
                             depart=_time(leg["origin"], "departure"), arrive=_time(leg["destination"], "arrival"),
                             stops=max(1, len(leg.get("stopSequence") or []) - 1),
                             wheelchair=True if props.get("PlanWheelChairAccess") == "1" else None,
                             coords=_geo(leg.get("coords"))))
        out.append(Journey(legs=legs, interchanges=int(j.get("interchanges") or 0)))
    return out


def platform_numbers(text: str) -> set[str]:
    """Platform numbers named in text: 'Platform 2/3' -> {'2', '3'}, 'Platforms 1 to 4' -> {'1', ..., '4'}."""
    out: set[str] = set()
    for m in _PLATFORMS.finditer(text or ""):
        part = m.group(1)
        out.update(n.upper() for n in re.findall(r"\d+[a-z]?", part, re.I))
        for a, b in re.findall(r"(\d+)\s*(?:to|-)\s*(\d+)", part):
            out.update(str(n) for n in range(int(a), int(b) + 1))
    return out


def parse_alert(info: dict) -> LiftAlert:
    affected = info.get("affected") or {}
    stops = affected.get("stops") or []
    props = info.get("properties") or {}
    stop_ids = [s["id"] for s in stops if s.get("id")] or ([props["stopIDglobalID"]] if props.get("stopIDglobalID") else [])
    osm = {int(x["id"]) for inf in affected.get("Infrastructures") or [] for x in inf.get("infrastructureIds") or []
           if x.get("provider") == "osm" and str(x.get("id", "")).isdigit()}
    text = (info.get("subtitle") or props.get("smsText") or "").strip().split("\n")[0].strip()
    return LiftAlert(id=info["id"], text=text, url=info.get("url"), station=stops[0].get("name", "") if stops else "",
                     stop_ids=stop_ids, osm_ids=osm)
