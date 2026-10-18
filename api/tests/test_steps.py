import networkx as nx
from app.routing.cost import Context
from app.routing.steps import group_steps


def path_graph(edges):
    G = nx.MultiDiGraph()
    for i, d in enumerate(edges):
        G.add_edge(i, i + 1, 0, **d)
    return G, [(i, i + 1, 0) for i in range(len(edges))]


def test_consecutive_slopes_merge_and_report_steepest():
    G, p = path_graph([{"length": 50, "grade_abs": 0.02}, {"length": 60, "grade_abs": 0.03}])
    assert [s["label"] for s in group_steps(G, p, Context())] == ["Gentle slope, up to 3%, 110 m"]


def test_tiny_runs_are_absorbed():
    G, p = path_graph([{"length": 50, "grade_abs": 0.03}, {"length": 4, "grade_abs": 0.0}, {"length": 60, "grade_abs": 0.03}])
    assert [s["label"] for s in group_steps(G, p, Context())] == ["Gentle slope, up to 3%, 114 m"]


def test_consecutive_crossings_merge():
    G, p = path_graph([{"length": 5, "footway": "crossing"}, {"length": 6, "footway": "crossing"}, {"length": 80}])
    labels = [s["label"] for s in group_steps(G, p, Context())]
    assert labels == ["Kerb ramp at crossing", "Flat footpath, 80 m"]


def test_steps_carry_their_kind_slope_and_whether_measured():
    """Plain wording (cycle 6): the web app says how hard a slope is for each person, so it needs the facts."""
    G, p = path_graph([{"length": 50, "grade_abs": 0.03, "slope_measured": True}, {"length": 80}])
    slope, flat = group_steps(G, p, Context())
    assert (slope["kind"], slope["slope"], slope["measured"]) == ("slope", 3, True)
    assert (flat["kind"], flat["slope"]) == ("flat", None)


def test_crossings_and_lifts_have_no_slope():
    G, p = path_graph([{"length": 5, "footway": "crossing"}, {"length": 80}])
    crossing = group_steps(G, p, Context())[0]
    assert crossing["kind"] == "crossing" and crossing["slope"] is None
