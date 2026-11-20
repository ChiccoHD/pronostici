"""OpenF1: dati dettagliati dal 2023 (gomme, soste, meteo in pista, direzione gara, colori delle squadre).
Gratis per i dati storici; la diretta durante le sessioni è a pagamento, quindi qui si usano solo sessioni concluse,
salvate in cache una volta per sempre (non cambiano più)."""
import logging

from .. import http, store
from ..config import CACHE

log = logging.getLogger("openf1")
BASE = "https://api.openf1.org/v1"
DELAY = 2.2            # limite gratuito circa 30 richieste al minuto


def _get(ep: str, params: dict):
    return http.get_json(f"{BASE}/{ep}", params, delay=DELAY)


def sessions(year: int) -> list[dict]:
    path = CACHE / "f1" / f"openf1_sessions_{year}.json"
    js = _get("sessions", {"year": year})
    if js:
        store.save(path, js)
        return js
    return store.load(path, [])


def session_data(session_key: int, budget: list[int]) -> dict | None:
    """Gomme, soste, meteo, direzione gara, piloti e risultato di una sessione conclusa (cache permanente).
    budget: [richieste rimaste in questo giro], per non esagerare con la fonte."""
    path = CACHE / "f1" / "sessions" / f"{session_key}.json"
    old = store.load(path)
    if old is not None:
        return old
    if budget[0] < 6:
        return None
    out = {}
    for ep in ("stints", "pit", "weather", "race_control", "drivers", "session_result"):
        budget[0] -= 1
        js = _get(ep, {"session_key": session_key})
        if js is None:
            return None            # riprova al prossimo giro
        if ep == "race_control":   # solo i messaggi utili (bandiere, safety car, virtual safety car)
            js = [{"lap": x.get("lap_number"), "cat": x.get("category"), "flag": x.get("flag"), "msg": (x.get("message") or "")[:80]}
                  for x in js if x.get("category") in ("SafetyCar", "Flag") and (x.get("category") == "SafetyCar" or x.get("flag") in ("RED", "CHEQUERED"))]
        if ep == "weather":        # riassunto: niente righe minuto per minuto
            js = {"air": [x.get("air_temperature") for x in js], "track": [x.get("track_temperature") for x in js],
                  "rain": sum(1 for x in js if x.get("rainfall")), "n": len(js)}
        if ep == "drivers":
            js = [{"num": x.get("driver_number"), "code": x.get("name_acronym"), "team": x.get("team_name"), "colour": x.get("team_colour"),
                   "last": x.get("last_name")} for x in js]
        if ep == "stints":
            js = [{"num": x.get("driver_number"), "n": x.get("stint_number"), "from": x.get("lap_start"), "to": x.get("lap_end"),
                   "c": x.get("compound"), "age": x.get("tyre_age_at_start")} for x in js]
        if ep == "pit":
            js = [{"num": x.get("driver_number"), "lap": x.get("lap_number"), "stop": x.get("stop_duration"), "lane": x.get("pit_duration")} for x in js]
        out[ep] = js
    store.save(path, out)
    return out


def laps_summary(session_key: int, budget: list[int], keep: bool = True) -> dict | None:
    """Giri di una sessione riassunti per pilota: giro migliore, migliori settori, giro ideale, velocità alla speed trap.
    keep=False per una sessione appena finita (si riprova al giro dopo, quando i dati sono completi)."""
    path = CACHE / "f1" / "laps" / f"{session_key}.json"
    old = store.load(path)
    if old is not None:
        return old
    if budget[0] < 2:
        return None
    budget[0] -= 2
    laps = _get("laps", {"session_key": session_key})
    drv = _get("drivers", {"session_key": session_key}) or []
    if not laps:
        return None
    info = {x.get("driver_number"): x for x in drv}
    per, times = {}, {}
    for l in laps:
        if l.get("lap_duration") and not l.get("is_pit_out_lap"):
            times.setdefault(l.get("driver_number"), []).append(l["lap_duration"])
        n = l.get("driver_number")
        p = per.setdefault(n, {"num": n, "code": (info.get(n) or {}).get("name_acronym"), "team": (info.get(n) or {}).get("team_name"),
                               "colour": (info.get(n) or {}).get("team_colour"), "lap": None, "s1": None, "s2": None, "s3": None, "st": None, "laps": 0})
        p["laps"] += 1
        for k, src in (("s1", "duration_sector_1"), ("s2", "duration_sector_2"), ("s3", "duration_sector_3"), ("lap", "lap_duration")):
            v = l.get(src)
            if v and v > 5 and (p[k] is None or v < p[k]):
                p[k] = round(v, 3)
        st = l.get("st_speed")
        if st and 150 < st < 400 and (p["st"] is None or st > p["st"]):
            p["st"] = st
    rows = []
    for p in per.values():
        if p["s1"] and p["s2"] and p["s3"]:
            p["ideal"] = round(p["s1"] + p["s2"] + p["s3"], 3)
        # passo lungo: giri tra il 102% e il 110% del proprio migliore (prove con tanta benzina), almeno 5
        t = sorted(x for x in times.get(p["num"], []) if p["lap"] and p["lap"] * 1.02 <= x <= p["lap"] * 1.10)
        if len(t) >= 5:
            p["long"], p["long_n"] = round(t[len(t) // 2], 3), len(t)
        rows.append(p)
    out = {"rows": rows}
    if keep:
        store.save(path, out)
    return out
