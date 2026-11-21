"""Meteo per le partite di calcio: città dello stadio (ESPN) -> coordinate (Open-Meteo, in cache) -> previsione all'ora
del calcio d'inizio. Solo informazione nella scheda: non entra nel modello finché la verifica non mostra un effetto
(Verifica fonti, modo meteo; vedi report/taratura.md)."""
import logging
from datetime import date, datetime, timedelta

from . import store
from .config import CACHE
from .sources import openmeteo

log = logging.getLogger(__name__)
PATH = CACHE / "geo.json"
DAYS = 4            # solo le partite dei prossimi giorni: oltre la previsione vale poco
MAX_GEO = 40        # città nuove cercate per giro (le altre al giro dopo)
ALIAS_CC = {"England": "GB", "Scotland": "GB", "Wales": "GB", "Northern Ireland": "GB", "USA": "US", "United States": "US",
            "Italy": "IT", "Spain": "ES", "Germany": "DE", "France": "FR", "Netherlands": "NL", "Turkey": "TR", "Türkiye": "TR",
            "Portugal": "PT", "Belgium": "BE", "Japan": "JP", "Brazil": "BR", "Argentina": "AR", "Norway": "NO", "Australia": "AU",
            "New Zealand": "NZ", "Canada": "CA", "Greece": "GR", "Austria": "AT", "Switzerland": "CH", "Denmark": "DK", "Sweden": "SE",
            "Czech Republic": "CZ", "Czechia": "CZ", "Croatia": "HR", "Serbia": "RS", "Poland": "PL", "Ukraine": "UA", "Cyprus": "CY",
            "Israel": "IL", "Hungary": "HU", "Romania": "RO", "Slovakia": "SK", "Slovenia": "SI", "Ireland": "IE", "Mexico": "MX"}

_geo = None
_fc = {}
_new = 0


def _cache():
    global _geo
    if _geo is None:
        _geo = store.load(PATH, {})
    return _geo


def place(city: str | None, country: str | None):
    """Coordinate della città (None se sconosciuta). Le ricerche fallite restano in cache per non ripeterle."""
    global _new
    if not city:
        return None
    key = f"{city}|{country or ''}"
    c = _cache()
    if key in c:
        return c[key] or None
    if _new >= MAX_GEO:
        return None
    _new += 1
    res = openmeteo.geocode(city.split(",")[0].strip())
    cc = ALIAS_CC.get(country or "", "")
    best = None
    for r in res:
        if not country or r["country"] in (country, None) or (cc and r["cc"] == cc):
            best = r
            break
    c[key] = {"lat": round(best["lat"], 3), "lon": round(best["lon"], 3), "name": best["name"]} if best else {}
    return c[key] or None


def at(lat: float, lon: float, when: str) -> dict | None:
    k = (lat, lon)
    if k not in _fc:
        _fc[k] = openmeteo.forecast(lat, lon)
    h = _fc[k]
    if not h:
        return None
    t = datetime.fromisoformat(when.replace("Z", "+00:00")).replace(tzinfo=None, minute=0, second=0, microsecond=0)
    key = t.strftime("%Y-%m-%dT%H:00")
    if key not in h["time"]:
        return None
    i = h["time"].index(key)
    j = min(i + 2, len(h["time"]))       # durata della partita: due ore
    g = lambda name: [x for x in (h.get(name) or [])[i:j] if x is not None]
    temp, pp, mm, wind = g("temperature_2m"), g("precipitation_probability"), g("precipitation"), g("wind_speed_10m")
    if not temp:
        return None
    return {"t": round(sum(temp) / len(temp)), "pp": max(pp) if pp else None, "mm": round(sum(mm), 1) if mm else None,
            "wind": round(max(wind)) if wind else None}


def attach(details: list[dict], events_by_id: dict, today: date):
    """Aggiunge d["weather"] alle partite dei prossimi giorni (non fa mai fallire chi la chiama)."""
    n = 0
    try:
        lim = today + timedelta(days=DAYS)
        for d in details:
            if date.fromisoformat(d["date"][:10]) > lim:
                continue
            e = events_by_id.get(str(d.get("espn_id") or d["id"].split("-")[-1])) or {}
            p = place(e.get("city"), e.get("country"))
            if not p:
                continue
            w = at(p["lat"], p["lon"], d["date"])
            if w:
                d["weather"] = {**w, "city": p["name"]}
                n += 1
    except Exception:
        log.exception("Meteo")
    return n


def save():
    if _geo is not None:
        store.save(PATH, _geo)
