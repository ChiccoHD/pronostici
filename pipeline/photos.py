"""Foto dei calciatori: ESPN, poi Wikidata (Wikimedia Commons), poi TheSportsDB; se non c'è da nessuna parte
restano le iniziali. Ogni giocatore si controlla una volta: l'esito resta in data/cache/photos.json.
Voce di cache: {"u": indirizzo o None, "s": fonte trovata, "d": giorno, "chk": fonti già sentite}."""
import logging
from datetime import date

from . import http, store
from .config import CACHE
from .sources import thesportsdb, wikidata

log = logging.getLogger("photos")
ENABLED = True          # i dati di esempio la spengono (nessuna rete)
RETRY_DAYS = 30         # chi è senza foto si ricontrolla dopo un mese
BUDGET = {"espn": 1500, "wd": 2000, "tsdb": 60}  # controlli nuovi per aggiornamento, il resto al giro dopo
SOURCES = ("espn", "wd", "tsdb")
NAMES = {"espn": "ESPN", "wd": "Wikipedia", "tsdb": "TheSportsDB"}
PATH = CACHE / "photos.json"
ESPN = "https://a.espncdn.com/i/headshots/soccer/players/full/{pid}.png"

_cache: dict | None = None
_wd_down = False


def _load() -> dict:
    global _cache
    if _cache is None:
        _cache = store.load(PATH, {}) or {}
    return _cache


def _upgrade(v: dict) -> dict:
    """Voci del formato precedente (senza "chk")."""
    if "chk" not in v:
        v["chk"] = ["espn"] + (["tsdb"] if v.get("s") is None else [])
        if v.get("s") == "attesa":
            v["s"] = None
    return v


def _entry(pid: str, today: str) -> dict:
    c = _load().setdefault("soccer", {})
    e = _upgrade(c[pid]) if pid in c else None
    if e is None or (not e.get("u") and set(SOURCES) <= set(e["chk"])
                     and (date.fromisoformat(today) - date.fromisoformat(e["d"])).days >= RETRY_DAYS):
        e = c[pid] = {"u": None, "s": None, "d": today, "chk": []}
    return e


def _done(e: dict, src: str, url: str | None, today: str) -> None:
    e["chk"] = sorted(set(e["chk"]) | {src}, key=SOURCES.index)
    e["d"] = today
    if url:
        e["u"], e["s"] = url, src


def attach_many(details: list[dict], today_d: date, count: dict) -> None:
    """Aggiunge "photo" ai giocatori delle partite di un campionato: indirizzo, "" se non c'è da nessuna parte
    (o non ancora controllata altrove: il sito mostra le iniziali)."""
    global _wd_down
    if not ENABLED:
        return
    today = today_d.isoformat()
    people = []   # (giocatore, voce di cache, nomi squadra)
    for d in details:
        for side in ("home", "away"):
            t = d.get(side) or {}
            teams = [x for x in (t.get("name"), t.get("short"), t.get("fd")) if x]
            for p in (d.get("players") or {}).get(side, []):
                pid = str(p.get("pid") or "")
                if pid.isdigit():
                    people.append((p, _entry(pid, today), teams))
    todo = lambda src: [x for x in people if not x[1]["u"] and src not in x[1]["chk"]]

    # 1. ESPN, giocatore per giocatore (basta sapere se il file esiste)
    seen = set()
    for p, e, _ in todo("espn"):
        if id(e) in seen or BUDGET["espn"] <= 0:
            continue
        seen.add(id(e))
        BUDGET["espn"] -= 1
        url = ESPN.format(pid=p["pid"])
        ok = http.exists(url)
        if ok is not None:
            _done(e, "espn", url if ok else None, today)

    # 2. Wikidata, a gruppi
    if not _wd_down:
        batch, seen = [], set()
        for p, e, teams in todo("wd"):
            if "espn" in e["chk"] and id(e) not in seen and len(batch) < BUDGET["wd"]:
                seen.add(id(e))
                batch.append((p, e, teams))
        if batch:
            BUDGET["wd"] -= len(batch)
            try:
                res = wikidata.footballer_photos([(p["name"], teams) for p, _, teams in batch])
            except Exception:
                log.exception("Wikidata")
                res = None
            if res is None:
                _wd_down = True
            else:
                for p, e, _ in batch:
                    if p["name"] in res:
                        _done(e, "wd", res[p["name"]], today)

    # 3. TheSportsDB, pochi alla volta (dai server di GitHub rifiuta spesso)
    seen = set()
    for p, e, teams in todo("tsdb"):
        if "wd" not in e["chk"] or id(e) in seen or BUDGET["tsdb"] <= 0:
            continue
        seen.add(id(e))
        BUDGET["tsdb"] -= 1
        found, answered = thesportsdb.player_photo(p.get("name") or "", teams)
        if answered:
            _done(e, "tsdb", found, today)

    for p, e, _ in people:
        p["photo"] = e["u"] or ""
        k = NAMES.get(e["s"]) if e["u"] else ("senza foto" if set(SOURCES) <= set(e["chk"]) else "da controllare")
        count[k] = count.get(k, 0) + 1


def save() -> None:
    if ENABLED and _cache is not None:
        store.save(PATH, _cache)
