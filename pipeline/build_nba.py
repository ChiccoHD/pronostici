"""NBA: calendario e risultati di due stagioni, tabellini dei giocatori, infortuni, quote ESPN."""
import logging
from datetime import date, datetime, timedelta, timezone

from . import config, store, trends
from .config import CACHE, PUBLIC_DATA
from .sources import espn
from .models import nba as N
from .models.common import r

log = logging.getLogger("nba")


def _games(season_year: int, today: date, status: dict, final: bool) -> list[dict]:
    """final=True: stagione conclusa, si scarica una volta sola."""
    path = CACHE / "nba" / f"games_{season_year}.json"
    cached = {g["id"]: g for g in store.load(path, [])}
    if final and cached:
        return list(cached.values())
    start = date(season_year, 10, 1)
    end = date(season_year + 1, 6, 30) if final else today + timedelta(days=config.DAYS_AHEAD["nba"])
    done = [g for g in cached.values() if g.get("hs") is not None]
    if done and not final:
        start = max(start, date.fromisoformat(max(g["date"][:10] for g in done)) - timedelta(days=3))
    events = espn.scoreboard_range("basketball", "nba", start, end, chunk_days=10)
    for ev in events:
        p = espn.parse_event(ev)
        if not p or p.get("season_type") not in (2, 3, None):
            continue
        g = {"id": p["id"], "date": p["date"], "state": p["state"], "home": p["home"]["id"],
             "away": p["away"]["id"], "home_name": p["home"]["name"], "away_name": p["away"]["name"],
             "home_abbr": p["home"]["abbr"], "away_abbr": p["away"]["abbr"],
             "home_color": p["home"].get("color"), "away_color": p["away"].get("color"),
             "home_alt": p["home"].get("alt"), "away_alt": p["away"].get("alt"),
             "home_logo": p["home"].get("logo"), "away_logo": p["away"].get("logo"),
             "hs": p["home"]["score"] if p["completed"] else None,
             "as": p["away"]["score"] if p["completed"] else None}
        if p.get("odds"):
            g["odds"] = p["odds"]
        elif cached.get(p["id"], {}).get("odds"):
            g["odds"] = cached[p["id"]]["odds"]
        cached[p["id"]] = g
    if events:
        status["espn"] = "ok"
    out = sorted(cached.values(), key=lambda g: g["date"])
    store.save(path, out)
    return out


def _box(season_year: int, games: list[dict], status: dict, max_new: int = 200) -> list[dict]:
    path = CACHE / "nba" / f"box_{season_year}.json"
    box = store.load(path, {})
    todo = [g for g in games if g.get("hs") is not None and (g["id"] not in box or "pred" not in box[g["id"]])][:max_new]
    for g in todo:
        summ = espn.summary("basketball", "nba", g["id"])
        if summ:
            box[g["id"]] = {"date": g["date"][:10], "lines": espn.nba_player_lines(summ), "pred": espn.predictor(summ)}
    if todo:
        store.save(path, box)
    status["tabellini"] = f"{len(box)} partite"
    lines = []
    for gid, b in box.items():
        for x in b["lines"]:
            lines.append({**x, "event": gid, "date": b["date"]})
    return lines, {gid: b.get("pred") for gid, b in box.items() if b.get("pred") is not None}


def build(today: date):
    status = {}
    sy = config.nba_season_start_year(today)
    try:
        prev = _games(sy - 1, today, status, final=True)
        cur = _games(sy, today, status, final=False)
    except Exception as ex:
        log.exception("NBA calendario")
        return [], {}, {"errore": f"{type(ex).__name__}: {ex}"}
    games = prev + cur
    cur_done = [g for g in cur if g.get("hs") is not None]
    season_from = min((g["date"][:10] for g in cur), default=f"{sy}-10-15")
    lines, preds = _box(sy, cur, status)
    bpi_path = CACHE / "nba" / f"bpi_{sy}.json"
    bpi = store.load(bpi_path, {})        # previsione ESPN registrata prima della partita
    preds = {**preds, **bpi}
    mdl = N.fit(games, today, season_from)
    if mdl is None:
        return [], {}, {**status, "errore": "storico insufficiente"}
    bt = N.backtest(games, (date.fromisoformat(prev[0]["date"][:10]) + timedelta(days=45)).isoformat() if prev else season_from,
                    season_from, preds)
    w_espn = bt["espn"]["weight"]
    status["incrocio_espn"] = bt["espn"]
    reliability = {"nba": {"name": "NBA", **bt}}
    rec = N.records(games, season_from)
    rest = N.rest_days(games)
    names = {}
    for g in games:
        for side in ("home", "away"):
            old = names.get(g[side], (None, None, None, None))
            names[g[side]] = (g[side + "_name"], g.get(side + "_abbr"), g.get(side + "_color") or old[2], g.get(side + "_logo") or old[3])
    team_ids = {}
    for g in sorted(cur_done, key=lambda g: g["date"], reverse=True):
        for t in (g["home"], g["away"]):
            team_ids.setdefault(t, []).append(g["id"])

    now = datetime.now(timezone.utc)
    upcoming = [g for g in cur if g["state"] in ("pre", "in")     # anche quelle in corso
                and datetime.fromisoformat(g["date"].replace("Z", "+00:00")) >= now - timedelta(hours=4)
                and date.fromisoformat(g["date"][:10]) <= today + timedelta(days=config.DAYS_AHEAD["nba"])]
    index = []
    for g in upcoming:
        try:
            summ = espn.summary("basketball", "nba", g["id"]) or {}
            inj = espn.injuries(summ)
            book = espn.pickcenter_odds(summ) or g.get("odds")
            hb = rest.get((g["id"], g["home"]), 9) == 1
            ab = rest.get((g["id"], g["away"]), 9) == 1
            p_espn = espn.predictor(summ)
            if p_espn is not None:
                bpi[g["id"]] = round(p_espn, 4)
            shift = N.blend_shift(mdl, g["home"], g["away"], hb, ab, p_espn, w_espn)
            mk = N.markets(mdl, g["home"], g["away"], hb, ab, book, shift)
            mk["espn_bpi"] = p_espn
            mk["espn_weight"] = w_espn if p_espn is not None else 0.0
            th = N.team_summary(games, g["home"], season_from)
            ta = N.team_summary(games, g["away"], season_from)
            fh = mk["exp"][0] / (th["season"].get("pf") or mk["exp"][0])
            fa = mk["exp"][1] / (ta["season"].get("pf") or mk["exp"][1])
            inj_h = {x["pid"]: x for x in inj.get(g["home"], [])}
            inj_a = {x["pid"]: x for x in inj.get(g["away"], [])}
            def team(t, b2b, injd):
                n = names.get(t, (t, None, None, None))
                rr = rec.get(t, {"w": 0, "l": 0})
                return {"name": n[0], "short": n[1], "color": n[2], "logo": n[3], "id": t, "lk": "nba", "record": rr,
                        "b2b": b2b, "rating": mdl.ratings().get(t), "injuries": list(injd.values())}
            detail = {
                "id": f"basket-nba-{g['id']}", "sport": "nba", "league": "nba", "league_name": "NBA",
                "date": g["date"], "home": team(g["home"], hb, inj_h), "away": team(g["away"], ab, inj_a),
                "markets": mk, "book": book,
                "form": {"home": th, "away": ta}, "h2h": N.h2h(games, g["home"], g["away"]),
                "trends": {"home": trends.nba(th["last"], "home"), "away": trends.nba(ta["last"], "away")},
                "players": {"home": N.player_props(lines, g["home"], team_ids.get(g["home"], []), fh, inj_h),
                            "away": N.player_props(lines, g["away"], team_ids.get(g["away"], []), fa, inj_a)},
                "names": {t: v[0] for t, v in names.items()},
                "reliability": bt["win"].get("grade"),
                "updated": now.isoformat(timespec="minutes"),
            }
            store.save(PUBLIC_DATA / "events" / f"{detail['id']}.json", detail)
            index.append({"id": detail["id"], "sport": "nba", "league": "nba", "league_name": "NBA",
                          "date": g["date"], "home": detail["home"]["name"], "away": detail["away"]["name"],
                          "home_short": detail["home"]["short"], "away_short": detail["away"]["short"],
                          "home_color": detail["home"]["color"], "away_color": detail["away"]["color"],
                          "home_logo": detail["home"]["logo"], "away_logo": detail["away"]["logo"],
                          "main": mk["win"], "main_labels": ["1", "2"],
                          "book": [r(book["p_home"]), r(book["p_away"])] if book and book.get("p_home") else None,
                          "extra": {f"Over {mk['total_line']:g}": mk["totals"].get(f"{mk['total_line']:g}")},
                          "exp_score": mk["exp"]})
        except Exception as ex:
            log.exception("NBA partita %s", g["id"])
            status.setdefault("errori_partite", []).append(f"{g['id']}: {ex}")
    store.save(bpi_path, bpi)
    try:  # classifica e schede squadra: un errore qui non tocca le partite
        league_page(games, lines, rec, names, season_from)
    except Exception:
        log.exception("Pagina NBA")
    status["partite_in_arrivo"] = len(upcoming)
    status["partite_stagione"] = len(cur_done)
    return index, reliability, status


# ---------------------------------------------------------------- classifica e schede squadra

EAST = {"ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL", "NY", "ORL", "PHI", "TOR", "WSH"}


def league_page(games, lines, rec, names, season_from):
    from collections import defaultdict
    by_team = defaultdict(lambda: defaultdict(list))
    for x in lines:
        by_team[x["team"]][x["pid"]].append(x)
    rows, teams = [], {}
    for t, n in names.items():
        rr = rec.get(t)
        if not rr:
            continue
        summ = N.team_summary(games, t, season_from)
        gp = rr["w"] + rr["l"]
        row = {"id": t, "name": n[0], "short": n[1], "color": n[2], "logo": n[3], "w": rr["w"], "l": rr["l"],
               "pct": round(rr["w"] / gp, 3) if gp else 0, "group": "Est" if n[1] in EAST else "Ovest",
               "pf": summ["season"].get("pf"), "pa": summ["season"].get("pa"), "form": summ["form5"].get("seq", [])}
        rows.append(row)
        players = []
        for pid, rs in by_team[t].items():
            rs = sorted(rs, key=lambda x: x["date"], reverse=True)
            b = N.player_block(rs, 200)
            if b and b["min"] >= 8:
                players.append({"pid": pid, "name": rs[0]["name"], "pos": rs[0].get("pos"), "gp": len(rs), **b})
        players.sort(key=lambda p: -p["pts"])
        teams[t] = {"id": t, "name": n[0], "short": n[1], "color": n[2], "logo": n[3], "record": rr, "group": row["group"],
                    "last": summ["last"][:10], "form5": summ["form5"], "form10": summ["form10"], "season": summ["season"],
                    "home_season": summ["home_season"], "away_season": summ["away_season"], "players": players[:15],
                    "trends": trends.nba(summ["last"])}
    for g in ("Est", "Ovest"):
        grp = sorted([x for x in rows if x["group"] == g], key=lambda x: (-x["pct"], -x["w"]))
        for i, x in enumerate(grp, 1):
            x["pos"] = i
    rows.sort(key=lambda x: (x["group"], x["pos"]))
    for t in teams.values():
        t["pos"] = next(x["pos"] for x in rows if x["id"] == t["id"])
    store.save(PUBLIC_DATA / "leagues" / "nba.json", {
        "key": "nba", "name": "NBA", "sport": "nba", "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "table": rows, "teams": teams, "names": {t: v[0] for t, v in names.items()}})
