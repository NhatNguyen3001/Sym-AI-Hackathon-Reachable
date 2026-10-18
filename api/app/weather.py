import time
import httpx

URL = "https://api.open-meteo.com/v1/forecast"
CAMPUS = (-33.7765, 151.1160)
PARAMS = {"current": "precipitation,rain,weather_code", "timezone": "Australia/Sydney"}
RAIN_CODES = set(range(51, 68)) | set(range(80, 83)) | {95, 96, 99}
CACHE_S = 600


class WeatherService:
    def __init__(self, http_get=httpx.get):
        self._get = http_get
        self._cache: dict[tuple[float, float], tuple[float, dict]] = {}
        self._override: bool | None = None

    def _fetch(self, cell: tuple[float, float]) -> dict:
        try:
            r = self._get(URL, params={**PARAMS, "latitude": cell[0], "longitude": cell[1]}, timeout=5)
            r.raise_for_status()
            cur = r.json()["current"]
            raining = float(cur.get("precipitation") or 0) > 0.1 or int(cur.get("weather_code") or 0) in RAIN_CODES
            return {"raining": raining, "summary": "Light rain now." if raining else "Dry right now.",
                    "until": None, "source": "Open-Meteo forecast"}
        except Exception:
            return {"raining": False, "summary": "Weather unavailable.", "until": None, "source": "Open-Meteo forecast (unavailable)"}

    def current(self, lat: float | None = None, lng: float | None = None) -> dict:
        """Weather near a point (cached per 0.1 degree cell, about 10 km); defaults to the campus."""
        from app.sandbox import current_box
        box = current_box()
        if box is not None and box.rain is not None:  # this phone's demo rain toggle (sandbox)
            return {"raining": box.rain, "summary": "Light rain now." if box.rain else "Dry right now.",
                    "until": None, "source": "Demo rain toggle"}
        if self._override is not None:
            return {"raining": self._override, "summary": "Light rain now." if self._override else "Dry right now.",
                    "until": None, "source": "Demo rain toggle"}
        lat, lng = (lat, lng) if lat is not None and lng is not None else CAMPUS
        cell = (round(lat, 1), round(lng, 1))
        hit = self._cache.get(cell)
        if not hit or time.monotonic() - hit[0] > CACHE_S:
            hit = self._cache[cell] = (time.monotonic(), self._fetch(cell))
        return hit[1]

    def toggle_override(self) -> dict:
        self._override = not self.current()["raining"]
        return self.current()
