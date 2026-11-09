"""Understat: gol attesi (xG) per partita nei 5 campionati principali. Facoltativo:
se la fonte non risponde, i modelli usano solo i gol reali."""
import codecs
import json
import logging
import re

from .. import http

log = logging.getLogger("understat")
BASE = "https://understat.com"


def _decode_js(page: str, var: str):
    m = re.search(var + r"\s*=\s*JSON\.parse\('(.+?)'\)", page)
    if not m:
        return None
    raw = codecs.decode(m.group(1), "unicode_escape")
    return json.loads(raw)


def league_matches(league: str, start_year: int) -> list[dict]:
    """Partite giocate con xG: [{date, home, away, hxg, axg}]."""
    data = None
    # 1) API usata dalla pagina (versione recente del sito)
    js = http.get_json(f"{BASE}/getLeagueData/{league}/{start_year}", delay=1.5,
                       headers={"X-Requested-With": "XMLHttpRequest",
                                "Referer": f"{BASE}/league/{league}/{start_year}"})
    if isinstance(js, dict):
        data = js.get("dates") or js.get("datesData")
    # 2) Vecchio formato: dati incorporati nella pagina
    if data is None:
        r = http.get(f"{BASE}/league/{league}/{start_year}", delay=1.5)
        if r is not None:
            try:
                data = _decode_js(r.text, "datesData")
            except (ValueError, UnicodeDecodeError) as e:
                log.warning("Understat non leggibile: %s", e)
    if not data:
        return []
    out = []
    for m in data:
        if not m.get("isResult"):
            continue
        try:
            out.append({
                "date": str(m["datetime"])[:10],
                "home": m["h"]["title"], "away": m["a"]["title"],
                "hxg": float(m["xG"]["h"]), "axg": float(m["xG"]["a"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return out
