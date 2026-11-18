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
