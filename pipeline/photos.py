"""Foto dei calciatori: prima ESPN, se manca TheSportsDB, altrimenti restano le iniziali.
Ogni giocatore si controlla una volta sola: l'esito resta in data/cache/photos.json."""
import logging
from datetime import date

from . import http, store
from .config import CACHE
from .sources import thesportsdb

log = logging.getLogger("photos")
ENABLED = True          # i dati di esempio la spengono (nessuna rete)
RETRY_DAYS = 30         # chi è senza foto si ricontrolla dopo un mese
BUDGET = {"espn": 600, "tsdb": 150}  # controlli nuovi per ogni aggiornamento, poi si riprende al giro dopo
PATH = CACHE / "photos.json"
WAIT = "attesa"  # ESPN non ce l'ha, TheSportsDB ancora da sentire
ESPN = "https://a.espncdn.com/i/headshots/soccer/players/full/{pid}.png"

_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        _cache = store.load(PATH, {}) or {}
    return _cache


def _lookup(p: dict, teams: list[str], today: str) -> dict | None:
    """Voce di cache per un giocatore: {"u": indirizzo o None, "s": fonte, "d": giorno del controllo}."""
    pid = str(p.get("pid") or "")
    if not pid.isdigit():
        return None
    c = _load().setdefault("soccer", {})
    old = c.get(pid)
    if old and old.get("s") != WAIT and (old.get("u") or (date.fromisoformat(today) - date.fromisoformat(old["d"])).days < RETRY_DAYS):
        return old
    if not (old and old.get("s") == WAIT):  # ESPN già controllata: manca solo TheSportsDB
        if BUDGET["espn"] <= 0:
            return None
        BUDGET["espn"] -= 1
        url = ESPN.format(pid=pid)
        ok = http.exists(url)
        if ok is None:
            return None
        if ok:
            c[pid] = {"u": url, "s": "espn", "d": today}
            return c[pid]
        c[pid] = {"u": None, "s": WAIT, "d": today}
    if BUDGET["tsdb"] <= 0:
        return c[pid]
    BUDGET["tsdb"] -= 1
    found, answered = thesportsdb.player_photo(p.get("name") or "", teams)
    if not answered:
        return c[pid]
    c[pid] = {"u": found, "s": "tsdb" if found else None, "d": today}
    return c[pid]


def attach(detail: dict, today: date, count: dict) -> None:
    """Aggiunge "photo" ai giocatori di una partita di calcio: indirizzo, "" se non c'è da nessuna parte,
    assente se non ancora controllata (il sito prova allora ESPN da solo)."""
    if not ENABLED:
        return
    for side in ("home", "away"):
        t = detail.get(side) or {}
        teams = [t.get("name"), t.get("short"), t.get("fd")]
        for p in (detail.get("players") or {}).get(side, []):
            try:
                e = _lookup(p, teams, today.isoformat())
            except Exception:
                log.exception("Foto di %s", p.get("name"))
                e = None
            if e is None:
                count["da controllare"] = count.get("da controllare", 0) + 1
                continue
            p["photo"] = e["u"] or ""
            k = {"espn": "ESPN", "tsdb": "TheSportsDB", WAIT: "da controllare"}.get(e["s"], "senza foto")
            count[k] = count.get(k, 0) + 1


def save() -> None:
    if ENABLED and _cache is not None:
        store.save(PATH, _cache)
