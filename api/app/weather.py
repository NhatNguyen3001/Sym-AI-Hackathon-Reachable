import time
import httpx

URL = "https://api.open-meteo.com/v1/forecast"
PARAMS = {"latitude": -33.7765, "longitude": 151.1160, "current": "precipitation,rain,weather_code", "timezone": "Australia/Sydney"}
RAIN_CODES = set(range(51, 68)) | set(range(80, 83)) | {95, 96, 99}
CACHE_S = 600


class WeatherService:
    def __init__(self, http_get=httpx.get):
        self._get = http_get
        self._cache: tuple[float, dict] | None = None
        self._override: bool | None = None

    def _fetch(self) -> dict:
        try:
            r = self._get(URL, params=PARAMS, timeout=5)
            r.raise_for_status()
            cur = r.json()["current"]
            raining = float(cur.get("precipitation") or 0) > 0.1 or int(cur.get("weather_code") or 0) in RAIN_CODES
            return {"raining": raining, "summary": "Light rain now." if raining else "Dry right now.",
                    "until": None, "source": "Open-Meteo forecast"}
        except Exception:
            return {"raining": False, "summary": "Weather unavailable.", "until": None, "source": "Open-Meteo forecast (unavailable)"}

    def current(self) -> dict:
        if self._override is not None:
            return {"raining": self._override, "summary": "Light rain now." if self._override else "Dry right now.",
                    "until": None, "source": "Demo rain toggle"}
        if not self._cache or time.monotonic() - self._cache[0] > CACHE_S:
            self._cache = (time.monotonic(), self._fetch())
        return self._cache[1]

    def toggle_override(self) -> dict:
        self._override = not self.current()["raining"]
        return self.current()
