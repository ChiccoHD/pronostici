"""Calcio: scarica i dati, aggiorna la cache, calcola le percentuali e scrive i file del sito."""
import logging
from datetime import date, datetime, timedelta, timezone

from . import config, store
from .config import CACHE, SOCCER_LEAGUES, PUBLIC_DATA
from .names import Matcher
from .sources import espn, footballdata, understat
from .models import soccer as S
from .models.common import devig, r

log = logging.getLogger("soccer")


def _fd_history(code: str, start_year: int, status: dict) -> list[dict]:
    out = []
    for y in (start_year - 2, start_year - 1, start_year):
        sc = config.fd_season_code(y)
        path = CACHE / "soccer" / f"fd_{code}_{sc}.json"
        rows = store.load(path)
        if rows is None or y == start_year:
            fresh = footballdata.season(code, sc)
            if fresh:
                store.save(path, fresh)
                rows = fresh
                status["football-data"] = "ok"
            elif rows is None:
                rows = []
                if y == start_year:
                    status.setdefault("football-data", "non raggiungibile")
        out.extend(rows)
    out.sort(key=lambda m: m["date"])
    return out


def _attach_xg(matches: list[dict], league: dict, start_year: int, matcher: Matcher, status: dict):
    xg_rows = []
    for y in (start_year - 1, start_year):
        path = CACHE / "soccer" / f"understat_{league['understat']}_{y}.json"
        rows = store.load(path)
        if rows is None or y == start_year:
            fresh = understat.league_matches(league["understat"], y)
            if fresh:
                store.save(path, fresh)
                rows = fresh
                status["understat"] = "ok"
            elif rows is None:
                rows = []
        xg_rows.extend(rows)
    if not xg_rows:
        status.setdefault("understat", "non raggiungibile (si usano solo i gol)")
        return 0
    idx = {}
    for x in xg_rows:
        h, a = matcher.match(x["home"]), matcher.match(x["away"])
        if h and a:
            idx[(x["date"], h, a)] = x
    n = 0
    for m in matches:
        d = date.fromisoformat(m["date"])
        for dd in (d, d - timedelta(days=1), d + timedelta(days=1)):
            x = idx.get((dd.isoformat(), m["home"], m["away"]))
            if x:
                m["hxg"], m["axg"] = x["hxg"], x["axg"]
                n += 1
                break
    return n


def _espn_events(league: dict, season_from: date, today: date, status: dict) -> list[dict]:
    path = CACHE / "soccer" / f"espn_events_{league['espn']}_{season_from.year}.json"
    cached = {e["id"]: e for e in store.load(path, [])}
    start = season_from
    done = [e for e in cached.values() if e["completed"]]
    if done:
        start = max(season_from, date.fromisoformat(max(e["date"][:10] for e in done)) - timedelta(days=4))
    fresh = espn.scoreboard_range("soccer", league["espn"], start, today + timedelta(days=config.DAYS_AHEAD["soccer"]))
    for ev in fresh:
        p = espn.parse_event(ev)
        if p:
            cached[p["id"]] = p
    if fresh:
        status["espn"] = "ok"
    else:
        status.setdefault("espn", "nessun evento ricevuto")
    events = sorted(cached.values(), key=lambda e: e["date"])
    store.save(path, events)
    return events


def _espn_players(league: dict, season_year: int, events: list[dict], status: dict, max_new: int = 120):
    path = CACHE / "soccer" / f"espn_players_{league['espn']}_{season_year}.json"
    box = store.load(path, {})
    todo = [e for e in events if e["completed"] and e["id"] not in box][:max_new]
    for e in todo:
        summ = espn.summary("soccer", league["espn"], e["id"])
        if not summ:
            continue
        box[e["id"]] = {"date": e["date"][:10], "lines": espn.soccer_player_lines(summ)}
    if todo:
        store.save(path, box)
    status["espn_tabellini"] = f"{len(box)} partite"
    lines = []
    for eid, b in box.items():
        for x in b["lines"]:
            lines.append({**x, "event": eid, "date": b["date"]})
    return lines


def _book_from_fixtures(fixtures, code, matcher, d_iso, home, away):
    for f in fixtures:
        if f.get("div") != code:
            continue
        if matcher.match(f["home"]) == home and matcher.match(f["away"]) == away and abs(
                (date.fromisoformat(f["date"]) - date.fromisoformat(d_iso)).days) <= 1:
            return f
    return None


def build(today: date) -> tuple[list[dict], dict, dict]:
    start_year = config.soccer_season_start_year(today)
    season_from = date(start_year, 7, 1)
    fixtures = footballdata.fixtures()
    index, reliability, status_all = [], {}, {}
    for key, lg in SOCCER_LEAGUES.items():
        status = {}
        try:
            matches = _fd_history(lg["fd"], start_year, status)
            if not matches:
                status_all[key] = {**status, "errore": "nessuno storico disponibile"}
                continue
            matcher = Matcher([m["home"] for m in matches] + [m["away"] for m in matches])
            n_xg = _attach_xg(matches, lg, start_year, matcher, status)
            status["xg_partite"] = n_xg
            events = _espn_events(lg, season_from, today, status)
            lines = _espn_players(lg, start_year, events, status)

            ratings = S.fit(matches, today)
            if ratings is None:
                status_all[key] = {**status, "errore": "storico insufficiente"}
                continue
            share = S.ht_share(matches)
            table = S.standings(matches, season_from.isoformat())
            pos = {t["team"]: t for t in table}
            bt_from = date(start_year - 1, 8, 1).isoformat()
            bt = S.backtest(matches, bt_from)
            reliability[key] = {"name": lg["name"], **bt}

            now = datetime.now(timezone.utc)
            upcoming = [e for e in events if e["state"] == "pre"
                        and datetime.fromisoformat(e["date"].replace("Z", "+00:00")) >= now - timedelta(hours=2)
                        and date.fromisoformat(e["date"][:10]) <= today + timedelta(days=config.DAYS_AHEAD["soccer"])]
            unmatched = set()
            completed_by_team = {}
            for e in events:
                if e["completed"]:
                    for side in ("home", "away"):
                        completed_by_team.setdefault(e[side]["id"], []).append(e["id"])
            for tid in completed_by_team:
                completed_by_team[tid] = completed_by_team[tid][::-1]

            for e in upcoming:
                home, away = matcher.match(e["home"]["name"]), matcher.match(e["away"]["name"])
                if not home:
                    unmatched.add(e["home"]["name"])
                if not away:
                    unmatched.add(e["away"]["name"])
                if not home or not away:
                    continue
                detail = _event_detail(key, lg, e, home, away, matches, ratings, share, pos, lines,
                                       completed_by_team, fixtures, matcher, today, season_from, bt)
                store.save(PUBLIC_DATA / "events" / f"{detail['id']}.json", detail)
                index.append(_index_entry(detail))
            if unmatched:
                status["nomi_non_abbinati"] = sorted(unmatched)
            status["partite_in_arrivo"] = len(upcoming)
            status_all[key] = status
        except Exception as ex:  # un campionato che fallisce non blocca gli altri
            log.exception("Errore %s", key)
            status_all[key] = {**status, "errore": f"{type(ex).__name__}: {ex}"}
    return index, reliability, status_all


def _event_detail(key, lg, e, home, away, matches, ratings, share, pos, lines, completed_by_team,
                  fixtures, matcher, today, season_from, bt):
    lh, la = ratings.lambdas(home, away)
    mk = S.markets(lh, la, share)
    corners = S.side_counts(matches, today, home, away, "hc", "ac", "corners_f", "corners_a")
    cards = S.side_counts(matches, today, home, away, "hy", "ay", "yellow_f", "yellow_a")
    book = {}
    f = _book_from_fixtures(fixtures, lg["fd"], matcher, e["date"][:10], home, away)
    if f:
        p = devig(f.get("o1x2"))
        if p:
            book["1x2"] = [r(x) for x in p]
            book["odds_1x2"] = f["o1x2"]
        p = devig(f.get("oou25"))
        if p:
            book["ou25"] = [r(x) for x in p]
            book["odds_ou25"] = f["oou25"]
    sf = season_from.isoformat()
    th, ta = S.team_summary(matches, home, sf), S.team_summary(matches, away, sf)
    avg_h = th["season"].get("gf") or 1.35
    avg_a = ta["season"].get("gf") or 1.15
    players = {
        "home": S.player_markets(lines, e["home"]["id"], lh, avg_h, completed_by_team.get(e["home"]["id"], [])),
        "away": S.player_markets(lines, e["away"]["id"], la, avg_a, completed_by_team.get(e["away"]["id"], [])),
    }
    def team(side, name):
        t = e[side]
        p = pos.get(name, {})
        return {"name": t["name"], "short": t["short"], "abbr": t.get("abbr"), "color": t.get("color"), "alt": t.get("alt"), "fd": name,
                "pos": p.get("pos"), "pts": p.get("pts"), "played": p.get("p"),
                "rating": ratings.table().get(name)}
    return {
        "id": f"calcio-{key}-{e['id']}", "sport": "soccer", "league": key, "league_name": lg["name"],
        "date": e["date"], "venue": e.get("venue"),
        "home": team("home", home), "away": team("away", away),
        "markets": mk,
        "corners": S.count_market(*corners, lines=(7.5, 8.5, 9.5, 10.5, 11.5), disp=1.3) if corners else None,
        "cards": S.count_market(*cards, lines=(2.5, 3.5, 4.5, 5.5, 6.5), disp=1.35) if cards else None,
        "book": book or None,
        "form": {"home": th, "away": ta},
        "h2h": S.h2h(matches, home, away),
        "players": players,
        "reliability": bt["1x2"].get("grade"),
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
    }


def _index_entry(d):
    mk = d["markets"]
    return {"id": d["id"], "sport": "soccer", "league": d["league"], "league_name": d["league_name"],
            "date": d["date"], "home": d["home"]["name"], "away": d["away"]["name"],
            "home_short": d["home"].get("abbr") or d["home"]["short"], "away_short": d["away"].get("abbr") or d["away"]["short"],
            "home_color": d["home"].get("color"), "away_color": d["away"].get("color"),
            "main": mk["1x2"], "main_labels": ["1", "X", "2"],
            "book": (d.get("book") or {}).get("1x2"),
            "extra": {"Over 2,5": mk["ou"]["2.5"], "Goal": mk["btts"]},
            "xg": mk["xg"]}
