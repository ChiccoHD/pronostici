"""Open-Meteo: previsioni del tempo gratuite, senza chiave (per le sessioni dei Gran Premi)."""
from .. import http

URL = "https://api.open-meteo.com/v1/forecast"
GEO = "https://geocoding-api.open-meteo.com/v1/search"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"


def geocode(name: str) -> list[dict]:
    """Città -> possibili luoghi (nome, paese, lat, lon, abitanti)."""
    js = http.get_json(GEO, {"name": name, "count": 5, "language": "en", "format": "json"}, delay=0.8)
    return [{"name": r.get("name"), "country": r.get("country"), "cc": r.get("country_code"), "admin1": r.get("admin1"),
             "lat": r.get("latitude"), "lon": r.get("longitude"), "pop": r.get("population") or 0}
            for r in (js or {}).get("results", []) or [] if r.get("latitude") is not None]


def history(lat: float, lon: float, start: str, end: str) -> dict | None:
    """Meteo passato ora per ora (archivio gratuito di Open-Meteo), per le verifiche."""
    js = http.get_json(ARCHIVE, {"latitude": lat, "longitude": lon, "start_date": start, "end_date": end, "timezone": "UTC",
                                 "hourly": "precipitation,wind_speed_10m,temperature_2m"}, delay=1.0)
    h = (js or {}).get("hourly")
    return h if h and h.get("time") else None


def forecast(lat: float, lon: float) -> dict | None:
    js = http.get_json(URL, {"latitude": lat, "longitude": lon, "forecast_days": 16, "timezone": "UTC",
                             "hourly": "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,cloud_cover"}, delay=1.0)
    h = (js or {}).get("hourly")
    if not h or not h.get("time"):
        return None
    return h
