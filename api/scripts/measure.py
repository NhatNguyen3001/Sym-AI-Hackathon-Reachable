"""Median response times of the main API calls, for before/after comparisons.

Usage: .venv/Scripts/python scripts/measure.py [base_url]   (default http://127.0.0.1:8000)
"""
import statistics
import sys
import time

import httpx

CALLS = [
    ("GET /health", "get", "/health", None),
    ("GET /places/mq-station", "get", "/places/mq-station", None),
    ("GET /places?q=wara", "get", "/places?q=wara", None),
    ("POST /route (campus)", "post", "/route", {"from": "mq-station", "to": "library"}),
    ("GET /updates", "get", "/updates", None),
    ("GET /agents/status", "get", "/agents/status", None),
]
RUNS = 5


def main(base: str) -> None:
    with httpx.Client(base_url=base, timeout=30) as c:
        for label, method, path, body in CALLS:
            times = []
            for _ in range(RUNS):
                t = time.perf_counter()
                (c.post(path, json=body) if method == "post" else c.get(path)).raise_for_status()
                times.append((time.perf_counter() - t) * 1000)
            print(f"{label:28s} median {statistics.median(times):7.0f} ms   (min {min(times):.0f}, max {max(times):.0f})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000")
