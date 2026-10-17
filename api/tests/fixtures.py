import networkx as nx
from app.routing.places import Place


def add(G, u, v, length, **kw):
    G.add_edge(u, v, 0, length=length, **kw)
    G.add_edge(v, u, 0, length=length, **kw)


def fixture_graph():
    """
    P (platform) --lift(north)--> N --100--> A --100 (2%)--> L (library)
    P --lift(south)--> S --60 steps--> L ; S --150 flat--> B --150--> L
    N --40 steep 8%--> L (shortcut, too steep for 5%)
    """
    G = nx.MultiDiGraph()
    coords = {"P": (0, 0), "N": (0.001, 0), "S": (-0.001, 0), "A": (0.001, 0.001), "B": (-0.001, 0.002), "L": (0, 0.003)}
    for n, (lat, lng) in coords.items():
        G.add_node(n, y=lat, x=lng)
    add(G, "P", "N", 20, kind="lift", exit_id="north")
    add(G, "P", "S", 20, kind="lift", exit_id="south")
    add(G, "N", "A", 100, highway="footway", grade_abs=0.0)
    add(G, "A", "L", 100, highway="footway", grade_abs=0.02, surface="paving_stones")  # cost 180
    add(G, "S", "L", 60, highway="steps")
    add(G, "S", "B", 150, highway="footway", grade_abs=0.0)
    add(G, "B", "L", 150, highway="footway", grade_abs=0.0)
    add(G, "N", "L", 40, highway="footway", grade_abs=0.08)
    return G


STATION = Place(id="mq-station", name="Macquarie University station", kind="station", lat=0, lng=0, node="P", exits=["north", "south"])
LIBRARY = Place(id="library", name="Waranara Library", kind="venue", lat=0, lng=0.003, node="L", exits=[])
