"""Open-Meteo: previsioni del tempo gratuite, senza chiave (per le sessioni dei Gran Premi)."""
from .. import http

URL = "https://api.open-meteo.com/v1/forecast"


def forecast(lat: float, lon: float) -> dict | None:
    js = http.get_json(URL, {"latitude": lat, "longitude": lon, "forecast_days": 16, "timezone": "UTC",
                             "hourly": "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,cloud_cover"}, delay=1.0)
    h = (js or {}).get("hourly")
    if not h or not h.get("time"):
        return None
    return h
