"""ESPN (API pubblica non ufficiale): calendari, tabellini, giocatori, infortuni, quote NBA."""
import logging
import re
from datetime import date, timedelta

from .. import http

log = logging.getLogger("espn")
SITE = "https://site.api.espn.com/apis/site/v2/sports"


def _d(x: date) -> str:
    return x.strftime("%Y%m%d")


def scoreboard(sport: str, league: str, start: date, end: date | None = None) -> list[dict]:
    """Eventi tra due date. Restituisce la lista grezza 'events' (vuota se la fonte non risponde)."""
    if end and end != start:
        return scoreboard_range(sport, league, start, end)
    return scoreboard_day(sport, league, start) or []


def scoreboard_day(sport: str, league: str, day: date) -> list[dict] | None:
    """Eventi di un giorno; None se la fonte non ha risposto (per non segnarlo come già scaricato)."""
    js = http.get_json(f"{SITE}/{sport}/{league}/scoreboard", {"dates": _d(day)}, delay=0.35)
    if js is None:
        return None
    return js.get("events", []) or []


def scoreboard_range(sport: str, league: str, start: date, end: date, chunk_days: int = 14) -> list[dict]:
    """Scarica un intervallo un giorno alla volta (ESPN rifiuta gli intervalli di date), senza duplicati."""
    seen, out = set(), []
    cur = start
    while cur <= end:
        for ev in scoreboard(sport, league, cur):
            if ev.get("id") not in seen:
                seen.add(ev.get("id"))
                out.append(ev)
        cur += timedelta(days=1)
    return out


def league_board(sport: str, league: str) -> dict:
    """Calendario di default di una competizione (con stagione e date in programma); {} se non risponde."""
    return http.get_json(f"{SITE}/{sport}/{league}/scoreboard", delay=0.35) or {}


def summary(sport: str, league: str, event_id: str) -> dict | None:
    return http.get_json(f"{SITE}/{sport}/{league}/summary", {"event": event_id})


# ---------------------------------------------------------------- parsing comune

def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    try:
        s = str(v).replace(",", ".").strip()
        if s in ("", "-", "--"):
            return None
        return float(s)
    except ValueError:
        return None


def _hex(c):
    c = (c or "").strip().lstrip("#")
    return "#" + c.lower() if re.fullmatch(r"[0-9a-fA-F]{6}", c) else None


def parse_event(ev: dict) -> dict | None:
    """Evento a squadre (calcio, NBA) in forma compatta."""
    try:
        comp = ev["competitions"][0]
        teams = {}
        for c in comp.get("competitors", []):
            t = c.get("team", {})
            teams[c.get("homeAway")] = {
                "id": str(t.get("id")),
                "name": t.get("displayName") or t.get("name"),
                "short": t.get("shortDisplayName") or t.get("abbreviation"),
                "abbr": t.get("abbreviation"),
                "score": _num(c.get("score")),
                "color": _hex(t.get("color")), "alt": _hex(t.get("alternateColor")), "logo": t.get("logo"),
            }
        if "home" not in teams or "away" not in teams:
            return None
        st = (ev.get("status") or comp.get("status") or {}).get("type", {})
        out = {
            "id": str(ev["id"]),
            "date": ev.get("date"),
            "state": st.get("state"),          # pre | in | post
            "completed": bool(st.get("completed")),
            "status": st.get("shortDetail") or st.get("description"),
            "home": teams["home"],
            "away": teams["away"],
            "season_type": (ev.get("season") or {}).get("type"),
            "venue": (comp.get("venue") or {}).get("fullName"),
            "neutral": bool(comp.get("neutralSite")),
        }
        odds = (comp.get("odds") or [None])[0]
        if odds:
            out["odds"] = parse_odds(odds)
        return out
    except (KeyError, IndexError, TypeError) as e:
        log.debug("evento non leggibile: %s", e)
        return None


def _ml_to_prob(ml):
    ml = _num(ml)
    if ml is None or ml == 0:
        return None
    return 100 / (ml + 100) if ml > 0 else -ml / (-ml + 100)


def parse_odds(o: dict) -> dict:
    """Quote americane ESPN -> linee e probabilità implicite (senza margine)."""
    out = {
        "provider": (o.get("provider") or {}).get("name"),
        "details": o.get("details"),
        "total": _num(o.get("overUnder")),
        "spread": _num(o.get("spread")),
    }
    h = _ml_to_prob((o.get("homeTeamOdds") or {}).get("moneyLine"))
    a = _ml_to_prob((o.get("awayTeamOdds") or {}).get("moneyLine"))
    # Formato più recente: moneyline.home.close.odds
    ml = o.get("moneyline") or {}
    if h is None and ml:
        h = _ml_to_prob(((ml.get("home") or {}).get("close") or {}).get("odds"))
        a = _ml_to_prob(((ml.get("away") or {}).get("close") or {}).get("odds"))
    dr = _ml_to_prob((o.get("drawOdds") or {}).get("moneyLine"))
    if dr is None and ml:
        dr = _ml_to_prob(((ml.get("draw") or {}).get("close") or {}).get("odds"))
    if h and a and dr:  # calcio: 1X2
        s = h + a + dr
        out["p_home"], out["p_draw"], out["p_away"] = h / s, dr / s, a / s
    elif h and a:
        s = h + a
        out["p_home"], out["p_away"] = h / s, a / s
    ov, un = _ml_to_prob(o.get("overOdds")), _ml_to_prob(o.get("underOdds"))
    if ov and un:
        out["p_over"], out["p_under"] = ov / (ov + un), un / (ov + un)
    return out


# ---------------------------------------------------------------- calcio

def soccer_player_lines(summ: dict) -> list[dict]:
    """Statistiche per giocatore di una partita di calcio."""
    rows = []
    for team in summ.get("rosters", []) or []:
        tid = str((team.get("team") or {}).get("id"))
        side = team.get("homeAway")
        for p in team.get("roster", []) or []:
            ath = p.get("athlete") or {}
            stats = {}
            for s in p.get("stats", []) or []:
                name = s.get("name") or s.get("abbreviation")
                if name:
                    stats[name] = _num(s.get("value", s.get("displayValue")))
            started = bool(p.get("starter"))
            sub_in = p.get("subbedIn")
            sub_in = bool(sub_in.get("didSub")) if isinstance(sub_in, dict) else bool(sub_in)
            if not started and not sub_in and not stats.get("appearances"):
                continue
            rows.append({
                "pid": str(ath.get("id")),
                "name": ath.get("displayName") or ath.get("fullName"),
                "pos": (p.get("position") or {}).get("abbreviation"),
                "team": tid, "side": side, "start": started, "sub": (not started) and sub_in,
                "g": stats.get("totalGoals", 0) or 0,
                "a": stats.get("goalAssists", 0) or 0,
                "sh": stats.get("totalShots", 0) or 0,
                "sot": stats.get("shotsOnTarget", 0) or 0,
                "yc": stats.get("yellowCards", 0) or 0,
                "rc": stats.get("redCards", 0) or 0,
                "fc": stats.get("foulsCommitted", 0) or 0,
                "fs": stats.get("foulsSuffered", 0) or 0,
                "sv": stats.get("saves", 0) or 0,
                "off": stats.get("offsides", 0) or 0,
            })
    return rows


def soccer_team_stats(summ: dict) -> dict:
    """Statistiche di squadra (possesso, tiri, angoli...) dal tabellino."""
    out = {}
    for t in (summ.get("boxscore") or {}).get("teams", []) or []:
        tid = str((t.get("team") or {}).get("id"))
        d = {}
        for s in t.get("statistics", []) or []:
            d[s.get("name")] = _num(s.get("displayValue", s.get("value")))
        out[tid] = d
    return out


# ---------------------------------------------------------------- NBA

_NBA_LABELS = {"MIN": "min", "PTS": "pts", "REB": "reb", "AST": "ast", "STL": "stl", "BLK": "blk",
               "TO": "tov", "PF": "pf", "OREB": "oreb", "DREB": "dreb", "+/-": "pm"}


def nba_player_lines(summ: dict) -> list[dict]:
    rows = []
    for team in (summ.get("boxscore") or {}).get("players", []) or []:
        tid = str((team.get("team") or {}).get("id"))
        for block in team.get("statistics", []) or []:
            labels = block.get("labels") or []
            for a in block.get("athletes", []) or []:
                if a.get("didNotPlay") or not a.get("stats"):
                    continue
                ath = a.get("athlete") or {}
                r = {"pid": str(ath.get("id")), "name": ath.get("displayName"),
                     "pos": (ath.get("position") or {}).get("abbreviation"),
                     "team": tid, "start": bool(a.get("starter"))}
                for lab, val in zip(labels, a["stats"]):
                    if lab in _NBA_LABELS:
                        r[_NBA_LABELS[lab]] = _num(val) or 0
                    elif lab in ("FG", "3PT", "FT") and isinstance(val, str) and "-" in val:
                        m, att = val.split("-", 1)
                        key = {"FG": "fg", "3PT": "tp", "FT": "ft"}[lab]
                        r[key + "m"], r[key + "a"] = _num(m) or 0, _num(att) or 0
                if (r.get("min") or 0) <= 0:
                    continue
                rows.append(r)
    return rows


def injuries(summ: dict) -> dict[str, list[dict]]:
    """Infortuni dal riepilogo di una partita (team_id -> lista)."""
    out = {}
    for t in summ.get("injuries", []) or []:
        tid = str((t.get("team") or {}).get("id"))
        lst = []
        for inj in t.get("injuries", []) or []:
            ath = inj.get("athlete") or {}
            lst.append({
                "pid": str(ath.get("id")),
                "name": ath.get("displayName"),
                "status": inj.get("status") or (inj.get("type") or {}).get("description"),
                "detail": (inj.get("details") or {}).get("type") or inj.get("shortComment"),
            })
        out[tid] = lst
    return out


def predictor(summ: dict) -> float | None:
    """Probabilità di vittoria della squadra di casa secondo il modello di ESPN (BPI), 0-1."""
    p = ((summ.get("predictor") or {}).get("homeTeam") or {}).get("gameProjection")
    v = _num(p)
    return v / 100 if v is not None and 0 < v < 100 else None


def pickcenter_odds(summ: dict) -> dict | None:
    pc = summ.get("pickcenter") or []
    if not pc:
        return None
    return parse_odds(pc[0])


# ---------------------------------------------------------------- tennis

TENNIS_SLUG = {"atp": "mens-singles", "wta": "womens-singles"}
_TENNIS_STATUS = {"STATUS_FINAL": "Completed", "STATUS_RETIRED": "Retired"}


def tennis_matches(events: list[dict], tour: str) -> list[dict]:
    """Incontri di singolare (uomini per 'atp', donne per 'wta') da uno scoreboard tennis.
    Ogni evento ESPN è un torneo con l'intero tabellone."""
    slug = TENNIS_SLUG[tour]
    out = []
    for ev in events:
        tour_name = ev.get("name") or ev.get("shortName") or ""
        location = (ev.get("venue") or {}).get("displayName") or ""
        major = bool(ev.get("major"))
        for g in ev.get("groupings") or []:
            if ((g.get("grouping") or {}).get("slug") or "") != slug:
                continue
            for c in g.get("competitions") or []:
                players = []
                for p in c.get("competitors", []) or []:
                    ath = p.get("athlete") or {}
                    name = ath.get("displayName") or ath.get("fullName")
                    if not name or name == "TBD" or "/" in name:
                        continue
                    players.append({
                        "id": str(p.get("id") or ""), "pid": str(ath.get("id") or p.get("id") or ""), "name": name, "winner": bool(p.get("winner")),
                        "order": p.get("order") or 0, "rank": (p.get("curatedRank") or {}).get("current"),
                        "country": (ath.get("flag") or {}).get("alt"),
                        "flag": (ath.get("flag") or {}).get("href"),
                        "cc": (re.search(r"/([a-z]{3})\.png", (ath.get("flag") or {}).get("href") or "") or [None, None])[1],
                        "sets": [int(_num(x.get("value")) or 0) for x in p.get("linescores") or []],
                    })
                if len(players) != 2:
                    continue
                players.sort(key=lambda x: x["order"])
                st = (c.get("status") or {}).get("type", {})
                out.append({
                    "id": str(c.get("id")),
                    "date": c.get("date") or c.get("startDate") or ev.get("date"),
                    "time_valid": c.get("timeValid", True),
                    "state": st.get("state"), "status_name": st.get("name"),
                    "status": st.get("shortDetail") or st.get("description"),
                    "tournament": tour_name, "location": location, "major": major,
                    "court": (c.get("venue") or {}).get("court"),
                    "round": (c.get("round") or {}).get("displayName") if isinstance(c.get("round"), dict) else c.get("round"),
                    "best_of": 5 if major and tour == "atp" else 3,  # il campo "format" di ESPN dice sempre 5
                    "players": players,
                })
    return out


def tennis_result_row(m: dict, tour: str, surface: str) -> dict | None:
    """Incontro concluso -> riga dello storico (stesso formato usato dal modello)."""
    comment = _TENNIS_STATUS.get(m.get("status_name"))
    if not comment or m.get("state") != "post":
        return None
    a, b = m["players"]
    if a["winner"] == b["winner"]:
        return None
    w, l = (a, b) if a["winner"] else (b, a)
    sets = [[x, y] for x, y in zip(w["sets"], l["sets"])]
    if comment == "Completed" and not sets:
        return None
    return {"id": m["id"], "date": (m["date"] or "")[:10], "tour": tour, "tournament": m["tournament"],
            "location": m["location"], "surface": surface, "round": m["round"] or "", "bo": m["best_of"],
            "w": w["name"], "l": l["name"], "wr": w["rank"], "lr": l["rank"], "sets": sets, "comment": comment}


STANDINGS = "https://site.api.espn.com/apis/v2/sports"


def standings_raw(sport: str, league: str, season: int | None = None) -> dict | None:
    params = {"season": season} if season else None
    return http.get_json(f"{STANDINGS}/{sport}/{league}/standings", params, delay=0.5)


def group_standings(sport: str, league: str, season: int | None = None) -> list[dict]:
    """Classifiche a gironi (Nations League, qualificazioni...): [{name, rows: [{id, name, abbr, logo, pos, p, w, d, l, gf, ga, gd, pts}]}].
    Lista vuota se la fonte non ha classifiche per questa competizione."""
    js = standings_raw(sport, league, season)
    if not js:
        return []
    groups = []

    def walk(node, label=""):
        name = node.get("name") or node.get("abbreviation") or label
        st = node.get("standings") or {}
        entries = st.get("entries") or []
        if entries:
            rows = []
            for e in entries:
                t = e.get("team") or {}
                s = {}
                for x in e.get("stats") or []:
                    k = x.get("name") or x.get("type")
                    if k is not None and x.get("value") is not None:
                        s[k] = x["value"]
                logo = (t.get("logos") or [{}])[0].get("href")
                rows.append({"id": str(t.get("id") or ""), "name": t.get("displayName") or t.get("name") or "",
                             "abbr": t.get("abbreviation") or "", "logo": logo,
                             "pos": int(s.get("rank") or 0), "p": int(s.get("gamesPlayed") or 0),
                             "w": int(s.get("wins") or 0), "d": int(s.get("ties") or 0), "l": int(s.get("losses") or 0),
                             "gf": int(s.get("pointsFor") or 0), "ga": int(s.get("pointsAgainst") or 0),
                             "gd": int(s.get("pointDifferential") or 0), "pts": int(s.get("points") or 0),
                             "note": (e.get("note") or {}).get("description")})
            if not all(r["pos"] for r in rows):
                rows.sort(key=lambda r: (-r["pts"], -r["gd"], -r["gf"]))
                for i, r in enumerate(rows, 1):
                    r["pos"] = i
            rows.sort(key=lambda r: r["pos"])
            groups.append({"name": name, "rows": rows})
        for ch in node.get("children") or []:
            walk(ch, name)

    walk(js)
    return groups
