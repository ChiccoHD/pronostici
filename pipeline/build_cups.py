"""Coppe europee (Champions, Europa League, Conference) e Champions femminile.

Le squadre di una coppa arrivano da campionati diversi, quindi serve una scala comune:
il modello si adatta su tre stagioni di 11 campionati europei (football-data) più le partite
di coppa (ESPN). Sono le partite di coppa a collegare i campionati tra loro.
La Champions femminile usa solo i risultati ESPN della competizione (meno dati, meno affidabile)."""
import logging
from datetime import date, datetime, timedelta, timezone

from . import config, store
from .config import CACHE, CUPS, EURO_LINK_FD, PUBLIC_DATA, SOCCER_LEAGUES, WOMEN_CUPS
from .names import Matcher
from .sources import espn
from .models import soccer as S
from .build_soccer import _fd_history, espn_book

log = logging.getLogger("cups")

CUP_WEEKDAYS = {1, 2, 3}       # martedì, mercoledì, giovedì
RESCAN_DAYS = 10


def _cup_events(code: str, start: date, end: date, today: date, status: dict) -> list[dict]:
    """Partite di una coppa tra due date, scaricando solo i giorni di coppa e una volta sola quelli passati."""
    path = CACHE / "cups" / f"{code}.json"
    cache = store.load(path, {"scanned": [], "events": {}})
    scanned, events = set(cache["scanned"]), cache["events"]
    d, n_req = start, 0
    while d <= end:
        iso = d.isoformat()
        weekend_final = d.month in (5, 6) and d.weekday() == 5
        if (d.weekday() in CUP_WEEKDAYS or weekend_final) and (iso not in scanned or d >= today - timedelta(days=RESCAN_DAYS)):
            evs = espn.scoreboard_day("soccer", code, d)
            n_req += 1
            if evs is not None:
                for ev in evs:
                    p = espn.parse_event(ev)
                    if p:
                        events[p["id"]] = p
                if d < today - timedelta(days=1):
                    scanned.add(iso)
        d += timedelta(days=1)
    store.save(path, {"scanned": sorted(scanned), "events": events})
    status[f"espn_{code}"] = f"{sum(1 for e in events.values() if e['completed'])} giocate, {n_req} giorni controllati"
    return sorted(events.values(), key=lambda e: e["date"])


def _as_match(e: dict, home: str, away: str, comp: str) -> dict:
    return {"date": e["date"][:10], "home": home, "away": away, "hg": float(e["home"]["score"]),
            "ag": float(e["away"]["score"]), "comp": comp}


def _detail(key, name, e, home, away, matches, ratings, bt, share, kind):
    lh, la = ratings.lambdas(home, away)
    mk = S.markets(lh, la, share)
    sf = (date.fromisoformat(e["date"][:10]) - timedelta(days=365)).isoformat()

    def team(side, nm):
        t = e[side]
        return {"name": t["name"], "short": t["short"], "abbr": t.get("abbr"), "color": t.get("color"),
                "alt": t.get("alt"), "logo": t.get("logo"), "fd": nm, "rating": ratings.table().get(nm)}
    th, ta = S.team_summary(matches, home, sf), S.team_summary(matches, away, sf)
    known = lambda nm: sum(1 for m in matches if nm in (m["home"], m["away"]))
    return {
        "id": f"calcio-{key}-{e['id']}", "sport": "soccer", "league": key, "league_name": name, "cup": kind,
        "date": e["date"], "venue": e.get("venue"),
        "home": team("home", home), "away": team("away", away),
        "markets": mk, "corners": None, "cards": None, "book": espn_book(e) or None,
        "form": {"home": th, "away": ta}, "h2h": S.h2h(matches, home, away), "players": {"home": [], "away": []},
        "low_data": known(home) < 15 or known(away) < 15,
        "reliability": bt["1x2"].get("grade"),
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
    }


def _index_entry(d):
    mk = d["markets"]
    return {"id": d["id"], "sport": "soccer", "league": d["league"], "league_name": d["league_name"],
            "date": d["date"], "home": d["home"]["name"], "away": d["away"]["name"],
            "home_short": d["home"].get("abbr") or d["home"]["short"], "away_short": d["away"].get("abbr") or d["away"]["short"],
            "home_color": d["home"].get("color"), "away_color": d["away"].get("color"),
            "home_logo": d["home"].get("logo"), "away_logo": d["away"].get("logo"),
            "main": mk["1x2"], "main_labels": ["1", "X", "2"], "book": (d.get("book") or {}).get("1x2"),
            "extra": {"Over 2,5": mk["ou"]["2.5"], "Goal": mk["btts"]}, "xg": mk["xg"]}


def _upcoming(events, today, days):
    now = datetime.now(timezone.utc)
    return [e for e in events if e["state"] == "pre"
            and datetime.fromisoformat(e["date"].replace("Z", "+00:00")) >= now - timedelta(hours=2)
            and date.fromisoformat(e["date"][:10]) <= today + timedelta(days=days)]


def build_men(today: date):
    status, index, reliability = {}, [], {}
    y = config.soccer_season_start_year(today)
    # 1) campionati europei
    pool = []
    codes = [lg["fd"] for lg in SOCCER_LEAGUES.values() if lg.get("kind") == "fd"] + list(EURO_LINK_FD)
    for code in codes:
        st = {}
        rows = _fd_history(code, y, st)
        pool += rows
        if not rows:
            status.setdefault("campionati_mancanti", []).append(code)
    matcher = Matcher([m["home"] for m in pool] + [m["away"] for m in pool], min_score=0.86)
    # 2) partite di coppa delle ultime due stagioni
    cup_events = {}
    for key, cup in CUPS.items():
        cup_events[key] = _cup_events(cup["espn"], date(y - 1, 6, 20), today + timedelta(days=config.DAYS_AHEAD["cups"]), today, status)
    unmatched = set()

    def nm(team):
        m = matcher.match(team["name"])
        if not m:
            unmatched.add(team["name"])
        return m or team["name"]
    cup_matches = []
    for key, evs in cup_events.items():
        for e in evs:
            if e["completed"] and e["home"]["score"] is not None and e["away"]["score"] is not None:
                cup_matches.append(_as_match(e, nm(e["home"]), nm(e["away"]), key))
    matches = sorted(pool + cup_matches, key=lambda m: m["date"])
    status["partite_modello"] = f"{len(pool)} di campionato, {len(cup_matches)} di coppa"
    ratings = S.fit(matches, today)
    if ratings is None:
        return [], {}, {**status, "errore": "storico insufficiente"}
    bt = S.backtest(matches, date(y - 1, 9, 1).isoformat(), is_test=lambda m: m.get("comp") is not None)
    reliability["coppe"] = {"name": "Coppe europee", **bt}
    share = S.ht_share(pool)
    for key, cup in CUPS.items():
        n = 0
        for e in _upcoming(cup_events[key], today, config.DAYS_AHEAD["cups"]):
            d = _detail(key, cup["name"], e, nm(e["home"]), nm(e["away"]), matches, ratings, bt, share, "men")
            store.save(PUBLIC_DATA / "events" / f"{d['id']}.json", d)
            index.append(_index_entry(d))
            n += 1
        status[f"in_arrivo_{key}"] = n
    if unmatched:
        status["squadre_senza_campionato"] = len(unmatched)
    return index, reliability, status


def build_women(today: date):
    status, index, reliability = {}, [], {}
    y = config.soccer_season_start_year(today)
    for key, cup in WOMEN_CUPS.items():
        evs = _cup_events(cup["espn"], date(y - 2, 7, 1), today + timedelta(days=config.DAYS_AHEAD["cups"]), today, status)
        matches = [_as_match(e, e["home"]["name"], e["away"]["name"], key) for e in evs
                   if e["completed"] and e["home"]["score"] is not None and e["away"]["score"] is not None]
        ratings = S.fit(matches, today)
        if ratings is None:
            status["errore"] = f"storico insufficiente ({len(matches)} partite)"
            continue
        bt = S.backtest(matches, date(y - 1, 9, 1).isoformat())
        reliability[key] = {"name": cup["name"], **bt}
        for e in _upcoming(evs, today, config.DAYS_AHEAD["cups"]):
            d = _detail(key, cup["name"], e, e["home"]["name"], e["away"]["name"], matches, ratings, bt, 0.45, "women")
            d["low_data"] = True
            store.save(PUBLIC_DATA / "events" / f"{d['id']}.json", d)
            index.append(_index_entry(d))
        status["partite_storico"] = len(matches)
    return index, reliability, status


def build(today: date):
    index, rel, status = [], {}, {}
    for name, fn in (("uomini", build_men), ("donne", build_women)):
        try:
            i, r, s = fn(today)
            index += i
            rel.update(r)
            status[name] = s
        except Exception as ex:
            log.exception("Coppe %s", name)
            status[name] = {"errore": f"{type(ex).__name__}: {ex}"}
    return index, rel, status
