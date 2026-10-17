from app.weather import WeatherService


class R:
    def __init__(self, j):
        self._j = j
        self.status_code = 200

    def json(self):
        return self._j

    def raise_for_status(self):
        pass


def test_rain_detected_and_cached():
    calls = []

    def get(url, params, timeout):
        calls.append(1)
        return R({"current": {"precipitation": 0.4, "weather_code": 61}})
    w = WeatherService(http_get=get)
    assert w.current()["raining"] is True and w.current()["raining"] is True
    assert len(calls) == 1
    assert w.current()["summary"] == "Light rain now."


def test_dry_weather():
    w = WeatherService(http_get=lambda *a, **k: R({"current": {"precipitation": 0.0, "weather_code": 1}}))
    assert w.current()["raining"] is False


def test_override_and_failure():
    def boom(*a, **k):
        raise OSError("offline")
    w = WeatherService(http_get=boom)
    assert w.current()["raining"] is False
    assert w.toggle_override()["raining"] is True
    assert w.current()["source"] == "Demo rain toggle"
    assert w.toggle_override()["raining"] is False


def test_weather_cached_per_rounded_location():
    calls = []

    def get(url, params, timeout):
        calls.append((params["latitude"], params["longitude"]))
        return R({"current": {"precipitation": 0.0, "weather_code": 1}})
    w = WeatherService(http_get=get)
    w.current(-33.87, 151.21)
    w.current(-33.871, 151.209)   # same 0.1 degree cell
    w.current(-33.77, 151.11)     # different cell
    w.current()                   # default campus point rounds into the same cell as the previous call
    assert calls == [(-33.9, 151.2), (-33.8, 151.1)]
