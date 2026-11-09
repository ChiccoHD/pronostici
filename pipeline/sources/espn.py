"""ESPN (API pubblica non ufficiale): calendari, tabellini, giocatori, infortuni, quote NBA."""
import logging
from datetime import date, timedelta

from .. import http

log = logging.getLogger("espn")
SITE = "https://site.api.espn.com/apis/site/v2/sports"


def _d(x: date) -> str:
    return x.strftime("%Y%m%d")


def scoreboard(sport: str, league: str, start: date, end: date | None = None) -> list[dict]:
    """Eventi tra due date. Restituisce la lista grezza 'events'."""
    dates = _d(start) if not end or end == start else f"{_d(start)}-{_d(end)}"
    js = http.get_json(f"{SITE}/{sport}/{league}/scoreboard", {"dates": dates, "limit": 1000})
    if not js:
        return []
    return js.get("events", []) or []


def scoreboard_range(sport: str, league: str, start: date, end: date, chunk_days: int = 14) -> list[dict]:
    """Scarica un intervallo lungo a blocchi, senza duplicati."""
    seen, out = set(), []
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=chunk_days - 1), end)
        for ev in scoreboard(sport, league, cur, stop):
            if ev.get("id") not in seen:
                seen.add(ev.get("id"))
                out.append(ev)
        cur = stop + timedelta(days=1)
    return out


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
                "logo": t.get("logo"),
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
    if h and a:
        s = h + a
        out["p_home"], out["p_away"] = h / s, a / s
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


def pickcenter_odds(summ: dict) -> dict | None:
    pc = summ.get("pickcenter") or []
    if not pc:
        return None
    return parse_odds(pc[0])


# ---------------------------------------------------------------- tennis

def tennis_matches(events: list[dict]) -> list[dict]:
    """Incontri di singolare da uno scoreboard tennis (eventi = tornei)."""
    out = []
    for ev in events:
        tour_name = ev.get("name") or ev.get("shortName")
        groupings = ev.get("groupings") or []
        comps = []
        for g in groupings:
            slug = ((g.get("grouping") or {}).get("slug") or "").lower()
            if "doubles" in slug or "mixed" in slug:
                continue
            comps.extend(g.get("competitions") or [])
        if not groupings:
            comps = ev.get("competitions") or []
        for c in comps:
            players = []
            for p in c.get("competitors", []) or []:
                ath = p.get("athlete") or {}
                name = ath.get("displayName") or ath.get("fullName")
                if not name or "/" in name:
                    continue
                players.append({"id": str(p.get("id") or ath.get("id")), "name": name,
                                "winner": p.get("winner"), "order": p.get("order")})
            if len(players) != 2:
                continue
            st = (c.get("status") or {}).get("type", {})
            out.append({
                "id": str(c.get("id")),
                "date": c.get("date") or c.get("startDate") or ev.get("date"),
                "state": st.get("state"),
                "status": st.get("shortDetail") or st.get("description"),
                "tournament": tour_name,
                "round": (c.get("round") or {}).get("displayName") if isinstance(c.get("round"), dict) else c.get("round"),
                "players": sorted(players, key=lambda x: x.get("order") or 0),
            })
    return out
