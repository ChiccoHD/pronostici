"""Polymarket: mercati di previsione pubblici e gratuiti (nessuna chiave) sui GP di Formula 1.
Vincitore, podio, pole, testa a testa e safety car. Servono solo come confronto col modello, mai dentro il calcolo.
Il prezzo di un "Sì" (da 0 a 1) è la probabilità che il mercato dà all'evento; la quota corrispondente è 1/prezzo."""
import json
import logging
import re
import unicodedata

from .. import http

log = logging.getLogger("polymarket")
BASE = "https://gamma-api.polymarket.com"
DELAY = 1.5
# nomi di Jolpica → nomi usati da Polymarket
ALIAS = {"são paulo grand prix": ["brazilian grand prix", "sao paulo grand prix"], "mexico city grand prix": ["mexican grand prix", "mexico city grand prix"],
         "united states grand prix": ["united states grand prix", "us grand prix", "austin"], "british grand prix": ["british grand prix"],
         "emilia romagna grand prix": ["emilia romagna grand prix", "imola"], "abu dhabi grand prix": ["abu dhabi grand prix"]}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]+", " ", s).strip()


def _events() -> list[dict]:
    out = []
    for off in (0, 100, 200):
        js = http.get_json(f"{BASE}/events", {"tag_slug": "f1", "closed": "false", "limit": 100, "offset": off}, delay=DELAY)
        if not isinstance(js, list):
            break
        out += js
        if len(js) < 100:
            break
    return out


MIN_VOLUME = 100       # dollari scambiati sul singolo mercato (per i prezzi fermi a 0,5)
MIN_EVENT_VOLUME = 200 # dollari scambiati in tutto l'evento


def _vol(m) -> float:
    try:
        return float(m.get("volumeNum") or m.get("volume") or 0)
    except (TypeError, ValueError):
        return 0.0


def _yes(m) -> float | None:
    try:
        oc, pr = json.loads(m.get("outcomes") or "[]"), json.loads(m.get("outcomePrices") or "[]")
        i = [str(o).strip().lower() for o in oc].index("yes")
        p = float(pr[i])
    except (ValueError, TypeError, IndexError):
        return None
    return p if 0 < p < 1 else None


def _who(m) -> str:
    t = (m.get("groupItemTitle") or "").strip()
    if t:
        return t
    q = m.get("question") or ""
    hit = re.match(r"Will (.+?) (win|finish|take|get|be)\b", q)
    return hit.group(1) if hit else ""


def gp_markets(race_name: str, race_date: str) -> dict | None:
    """Mercati aperti per un GP: {"win": {nome: p}, "podium": ..., "pole": ..., "h2h": [[nomeA, nomeB, pA, volume]], "sc": p, "events": n}."""
    keys = ALIAS.get(norm(race_name), [norm(race_name)])
    try:
        evs = _events()
    except Exception:
        log.exception("Polymarket")
        return None
    out = {"win": {}, "podium": {}, "pole": {}, "fl": {}, "fp1": {}, "fp2": {}, "fp3": {}, "team_win": {}, "team_pole": {}, "h2h": [], "sc": None, "red": None, "events": 0}
    for e in evs:
        title = norm(e.get("title"))
        if not any(k in title for k in keys) or "sprint" in title:
            continue
        end = (e.get("endDate") or "")[:10]
        if end and race_date and end < race_date[:10]:
            continue
        # solo mercati con scambi veri: un evento senza volume, o un mercato mai scambiato fermo a 0,5, non dice niente
        allm = [m for m in e.get("markets") or [] if m.get("active", True) and not m.get("closed")]
        if sum(_vol(m) for m in allm) < MIN_EVENT_VOLUME:
            continue
        mk = [m for m in allm if not (0.49 <= (_yes(m) or 0) <= 0.51 and _vol(m) < MIN_VOLUME)]
        if not mk:
            continue
        out["events"] += 1
        prac = re.search(r"practice (\d)", title)
        kind = (f"fp{prac.group(1)}" if prac and "fastest" in title
                else "team_pole" if "constructor" in title and "pole" in title
                else "team_win" if "constructor" in title and ("1st" in title or "winner" in title or "win" in title)
                else None if "constructor" in title
                else "h2h" if "head" in title or "finish higher" in title else "podium" if "podium" in title else "pole" if "pole" in title
                else "fl" if "fastest lap" in title else "sc" if "safety car" in title else "red" if "red flag" in title
                else "win" if "winner" in title or "win " in title else None)
        if kind in ("win", "podium", "pole", "fl", "fp1", "fp2", "fp3", "team_win", "team_pole"):
            out.setdefault(kind, {})
            for m in mk:
                p, who = _yes(m), _who(m)
                if p is not None and who:
                    out[kind][who] = round(p, 4)
        elif kind in ("sc", "red"):
            p = _yes(mk[0])
            if p is not None:
                out[kind] = round(p, 4)
        elif kind == "h2h":
            for m in mk:
                try:
                    oc, pr = json.loads(m.get("outcomes") or "[]"), [float(x) for x in json.loads(m.get("outcomePrices") or "[]")]
                except (ValueError, TypeError):
                    continue
                if len(oc) == 2 and len(pr) == 2 and 0 < pr[0] < 1:
                    out["h2h"].append([oc[0].strip(), oc[1].strip(), round(pr[0], 4), round(float(m.get("volume") or 0))])
    return out if out["events"] else None
