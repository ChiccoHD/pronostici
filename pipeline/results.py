"""Risultati finali delle partite già iniziate che restano in elenco (per qualche giorno dopo la fine).

Il pronostico resta quello fatto prima del via: qui si aggiunge solo l'esito (campo "final"),
nell'elenco e nel file della partita, per confrontarlo con le percentuali e con le quote.
Una richiesta ESPN per competizione e giorno; le partite già chiuse non vengono più cercate."""
import logging
import re
from datetime import date, datetime, timedelta, timezone

from . import store
from .config import CUPS, NATIONAL, PUBLIC_DATA, SOCCER_LEAGUES, WOMEN_CUPS
from .sources import espn

log = logging.getLogger("results")

SOCCER_CODE = {**{k: v["espn"] for k, v in SOCCER_LEAGUES.items()}, **{k: v["espn"] for k, v in CUPS.items()},
               **{k: v["espn"] for k, v in WOMEN_CUPS.items()}, **{k: v["espn"] for k, v in NATIONAL.items()}}
WAIT_HOURS = {"soccer": 1.8, "nba": 2.2, "tennis": 1.0}     # prima di cercare il risultato
GIVE_UP_DAYS = 3
VOID = ("POSTPONED", "CANCELED", "CANCELLED", "ABANDONED", "SUSPENDED", "FORFEIT")


def _target(e: dict):
    m = re.match(r"^(calcio|basket|tennis)-(.+)-(\d+)$", e["id"])
    if not m:
        return None
    kind, league, eid = m.groups()
    if kind == "calcio":
        code = SOCCER_CODE.get(league)
        return ("soccer", code, eid) if code else None
    if kind == "basket":
        return ("basketball", "nba", eid)
    return ("tennis", league, eid)


def _num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _team_final(ev: dict) -> dict | None:
    comp = (ev.get("competitions") or [{}])[0]
    st = (ev.get("status") or comp.get("status") or {}).get("type", {})
    name = str(st.get("name") or "").upper()
    if any(v in name for v in VOID):
        return {"void": st.get("shortDetail") or "Rinviata"}
    if not st.get("completed"):
        return None
    side = {c.get("homeAway"): c for c in comp.get("competitors", [])}
    if "home" not in side or "away" not in side:
        return None
    h, a = _num(side["home"].get("score")), _num(side["away"].get("score"))
    if h is None or a is None:
        return None
    out = {"h": h, "a": a, "st": st.get("shortDetail") or "Finita"}
    lh, la = side["home"].get("linescores") or [], side["away"].get("linescores") or []
    if lh and la:
        out["periods"] = [[_num(x.get("value")) for x in lh], [_num(x.get("value")) for x in la]]
    stats = {}
    for k in ("home", "away"):
        for s in side[k].get("statistics") or []:
            if s.get("name") in ("wonCorners", "yellowCards", "redCards", "totalShots", "shotsOnTarget", "possessionPct"):
                stats.setdefault(s["name"], {})[k] = s.get("displayValue")
    if stats:
        out["stats"] = {n: [v.get("home"), v.get("away")] for n, v in stats.items()}
    return out


def _tennis_final(c: dict) -> dict | None:
    st = (c.get("status") or {}).get("type", {})
    name = str(st.get("name") or "").upper()
    ps = sorted(c.get("competitors") or [], key=lambda p: p.get("order") or 0)
    if len(ps) != 2:
        return None
    if any(v in name for v in VOID) and not st.get("completed"):
        return {"void": st.get("shortDetail") or "Annullata"}
    if not st.get("completed"):
        return None
    sets = [[_num(x.get("value")) or 0 for x in (p.get("linescores") or [])] for p in ps]
    won = [0, 0]
    for i in range(min(len(sets[0]), len(sets[1]))):
        if sets[0][i] != sets[1][i]:
            won[0 if sets[0][i] > sets[1][i] else 1] += 1
    winner = 0 if ps[0].get("winner") else 1 if ps[1].get("winner") else (0 if won[0] > won[1] else 1)
    out = {"h": won[0], "a": won[1], "w": winner, "sets": sets, "games": sum(sets[0]) + sum(sets[1]),
           "st": st.get("shortDetail") or "Finita"}
    if "RETIRED" in name or "WALKOVER" in name or "ret" in str(st.get("shortDetail") or "").lower():
        out["ret"] = True
    return out


def _find(sport, code, day, eid, boards):
    key = (sport, code, day)
    if key not in boards:
        boards[key] = espn.scoreboard_day(sport, code, date.fromisoformat(day)) or []
    for ev in boards[key]:
        if sport == "tennis":
            for g in ev.get("groupings") or []:
                for c in g.get("competitions") or []:
                    if str(c.get("id")) == eid:
                        return _tennis_final(c), True
        elif str(ev.get("id")) == eid:
            return _team_final(ev), True
    return None, False


def attach(events: list[dict], status: dict) -> None:
    """Aggiunge "final" alle partite concluse (nell'elenco e nel loro file)."""
    now = datetime.now(timezone.utc)
    boards, found, n_req0 = {}, 0, 0
    for e in events:
        if e.get("final"):
            continue
        start = datetime.fromisoformat(e["date"].replace("Z", "+00:00"))
        if now < start + timedelta(hours=WAIT_HOURS.get(e["sport"], 2)) or now > start + timedelta(days=GIVE_UP_DAYS):
            continue
        tg = _target(e)
        if not tg:
            continue
        sport, code, eid = tg
        res, seen = None, False
        d0 = start.date()
        for d in (d0, d0 - timedelta(days=1), d0 + timedelta(days=1)):     # ESPN ragiona con l'ora degli Stati Uniti
            res, seen = _find(sport, code, d.isoformat(), eid, boards)
            if seen:
                break
        if not res:
            continue
        e["final"] = res
        path = PUBLIC_DATA / "events" / f"{e['id']}.json"
        d = store.load(path)
        if d:
            d["final"] = res
            store.save(path, d)
        found += 1
    status["risultati"] = f"{found} nuovi esiti, {len(boards)} calendari letti"
