from dataclasses import dataclass, field


@dataclass
class Place:
    id: str
    name: str
    kind: str
    lat: float
    lng: float
    node: object = None
    exits: list[str] = field(default_factory=list)
