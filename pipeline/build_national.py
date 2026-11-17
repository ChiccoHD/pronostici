"""Nazionali maschili: Nations League, qualificazioni, fasi finali e amichevoli.

Storico: tutte le partite internazionali (dataset pubblico su GitHub), più i risultati recenti di ESPN
non ancora entrati nello storico. Partite in arrivo, quote e loghi: ESPN.
Modello: models/national.py (campo neutro, importanza della partita, memoria lunga)."""
import logging
from datetime import date, datetime, timedelta, timezone

from . import config, store, trends
from .config import CACHE, NATIONAL, PUBLIC_DATA
from .nations_it import it, to_history
from .sources import espn, intl_results
from .models import national as N
from .models import soccer as S
from .build_soccer import espn_book
from .build_cups import _index_entry

log = logging.getLogger("national")
DIR = CACHE / "national"
PAST_DAYS = 21          # quanti giorni indietro cercare risultati non ancora nello storico


def _history(today: date, status: dict) -> list[dict]:
    since = date(today.year - N.YEARS_BACK, 1, 1).isoformat()
    path = DIR / "history.json"
    rows = intl_results.matches(since)
    if rows:
        store.save(path, rows)
        status["storico"] = f"{len(rows)} partite, fino al {rows[-1]['date']}"
    else:
        rows = store.load(path, []) or []
        status["storico"] = f"fonte non raggiungibile, uso la copia salvata ({len(rows)} partite)"
    return rows


def _season_info(code: str) -> tuple[dict, list[dict]]:
    """Calendario e stagione della competizione (una richiesta)."""
    js = espn.league_board("soccer", code)
    lg = (js.get("leagues") or [{}])[0]
    cal = lg.get("calendar") or []
    dates = sorted({str(c if isinstance(c, str) else (c.get("startDate") or c.get("value") or ""))[:10] for c in cal} - {""})
    season = lg.get("season") or {}
    return {"end": (season.get("endDate") or "")[:10], "calendar": dates if len(dates) > 3 else None}, js.get("events") or []


def _events(key: str, comp: dict, today: date, last_hist: str, status: dict) -> list[dict]:
    """Partite della competizione: giorni recenti e prossimi, scaricando ogni giorno il meno possibile."""
    code = comp["espn"]
    path = DIR / f"{code}.json"
    cache = store.load(path, {"fetched": {}, "events": {}})
    fetched, events = cache["fetched"], cache["events"]
    info, default = _season_info(code)
    for ev in default:
        p = espn.parse_event(ev)
        if p:
            events[p["id"]] = p
    end = today + timedelta(days=config.DAYS_AHEAD["national"])
    parsed = [p for p in map(espn.parse_event, default) if p]
    finished = parsed and all(p["completed"] for p in parsed) and max(p["date"][:10] for p in parsed) < (today - timedelta(days=20)).isoformat()
    if (info["end"] and info["end"] < today.isoformat() and not parsed) or finished:
        status[key] = "fuori stagione"
        return sorted(events.values(), key=lambda e: e["date"])
    start = max(date.fromisoformat(last_hist) + timedelta(days=1) if last_hist else today, today - timedelta(days=PAST_DAYS))
    start = min(start, today - timedelta(days=1))
    n_req, d = 0, start
    while d <= end:
        iso = d.isoformat()
        last = fetched.get(iso)
        if info["calendar"] is not None and iso not in info["calendar"]:
            need = False
        elif d < today - timedelta(days=2):
            need = last is None or last <= iso          # i giorni passati: una volta dopo che sono finiti
        elif d <= today + timedelta(days=2):
            need = True                                  # oggi e dintorni: sempre (orari, risultati)
        else:
            need = last != today.isoformat()             # più avanti: una volta al giorno
        if need:
            evs = espn.scoreboard_day("soccer", code, d)
            n_req += 1
            if evs is not None:
                for ev in evs:
                    p = espn.parse_event(ev)
                    if p:
                        events[p["id"]] = p
                fetched[iso] = today.isoformat()
        d += timedelta(days=1)
    # la cache tiene solo l'ultimo anno
    lo = (today - timedelta(days=400)).isoformat()
    events = {k: v for k, v in events.items() if (v.get("date") or "")[:10] >= lo}
    fetched = {k: v for k, v in fetched.items() if k >= lo}
    store.save(path, {"fetched": fetched, "events": events})
    status[key] = f"{n_req} giorni controllati"
    return sorted(events.values(), key=lambda e: e["date"])


def _upcoming(events, today):
    now = datetime.now(timezone.utc)
    return [e for e in events if e["state"] in ("pre", "in")
            and datetime.fromisoformat(e["date"].replace("Z", "+00:00")) >= now - timedelta(hours=4)
            and date.fromisoformat(e["date"][:10]) <= today + timedelta(days=config.DAYS_AHEAD["national"])]


def _it_summary(s: dict) -> dict:
    for g in s.get("last", []):
        g["opp"] = it(g["opp"])
    return s


def _detail(key, comp, e, home, away, matches, ratings, bt, today):
    neutral = bool(e.get("neutral"))
    lh, la = ratings.lambdas(home, away, neutral)
    mk = S.markets(lh, la, 0.45)
    sf = (today - timedelta(days=730)).isoformat()      # "stagione" delle nazionali: ultimi due anni
    th, ta = _it_summary(S.team_summary(matches, home, sf)), _it_summary(S.team_summary(matches, away, sf))
    h2h = S.h2h(matches, home, away)
    for g in h2h["games"]:
        g["home"], g["away"] = it(g["home"]), it(g["away"])
    recent = (today - timedelta(days=4 * 365)).isoformat()
    played = lambda nm: sum(1 for m in matches if m["date"] >= recent and nm in (m["home"], m["away"]))

    def team(side, nm):
        t = e[side]
        name = it(nm) if nm else t["name"]
        return {"name": name, "short": name, "abbr": t.get("abbr"), "color": t.get("color"), "id": t.get("id"),
                "alt": t.get("alt"), "logo": t.get("logo"), "fd": nm, "national": True}
    friendly = key == "amichevoli"
    return {
        "id": f"calcio-{key}-{e['id']}", "sport": "soccer", "league": key, "league_name": comp["name"], "cup": "national",
        "date": e["date"], "venue": e.get("venue"), "neutral": neutral, "friendly": friendly,
        "home": team("home", home), "away": team("away", away),
        "markets": mk, "corners": None, "cards": None, "book": espn_book(e) or None,
        "form": {"home": th, "away": ta}, "h2h": h2h, "players": {"home": [], "away": []},
        "low_data": played(home) < 10 or played(away) < 10,
        "trends": {"home": trends.soccer(th["last"], "home"), "away": trends.soccer(ta["last"], "away")},
        "reliability": (bt.get("amichevoli" if friendly else "ufficiali") or {}).get("grade"),
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
    }


def build(today: date):
    status, index, reliability = {}, [], {}
    hist = _history(today, status)
    if not hist:
        return [], {}, {**status, "errore": "storico non disponibile"}
    known = {m["home"] for m in hist} | {m["away"] for m in hist}
    last_hist = max(m["date"] for m in hist)
    unmatched = set()

    def hn(t):
        n = to_history(t["name"], known)
        if not n:
            unmatched.add(t["name"])
        return n
    per_comp, extra = {}, []
    have = {(m["home"], m["away"], m["date"]) for m in hist if m["date"] >= (today - timedelta(days=60)).isoformat()}
    for key, comp in NATIONAL.items():
        try:
            evs = _events(key, comp, today, last_hist, status)
        except Exception as ex:          # una competizione non deve fermare le altre
            log.exception("Nazionali %s", key)
            status[key] = f"errore: {type(ex).__name__}: {ex}"
            continue
        per_comp[key] = evs
        now = datetime.now(timezone.utc).isoformat()
        for e in evs:     # risultati recenti non ancora nello storico
            if not (e["completed"] and e["date"] < now and e["home"]["score"] is not None and e["away"]["score"] is not None):
                continue
            h, a = hn(e["home"]), hn(e["away"])
            d0 = e["date"][:10]
            if not h or not a or d0 <= last_hist:
                continue
            days = {d0, (date.fromisoformat(d0) - timedelta(days=1)).isoformat()}
            if any((h, a, d) in have for d in days):
                continue
            have.add((h, a, d0))
            extra.append({"date": d0, "home": h, "away": a, "hg": float(e["home"]["score"]), "ag": float(e["away"]["score"]),
                          "tournament": comp["tournament"], "neutral": bool(e.get("neutral"))})
    matches = sorted(hist + extra, key=lambda m: m["date"])
    status["risultati_recenti_da_espn"] = len(extra)
    ratings = N.fit(matches, today)
    if ratings is None:
        return [], {}, {**status, "errore": "storico insufficiente"}
    since = (today - timedelta(days=540)).isoformat()
    official = lambda m: "friendly" not in m["tournament"].lower()
    bt = {"ufficiali": N.backtest(matches, since, is_test=official)["1x2"],
          "amichevoli": N.backtest(matches, since, is_test=lambda m: not official(m))["1x2"]}
    reliability["nazionali"] = {"name": "Nazionali, partite ufficiali", "1x2": bt["ufficiali"]}
    reliability["amichevoli"] = {"name": "Nazionali, amichevoli", "1x2": bt["amichevoli"]}
    for key, evs in per_comp.items():
        n = 0
        for e in _upcoming(evs, today):
            h, a = hn(e["home"]), hn(e["away"])
            d = _detail(key, NATIONAL[key], e, h or e["home"]["name"], a or e["away"]["name"], matches, ratings, bt, today)
            if not h or not a:
                d["low_data"] = True
            store.save(PUBLIC_DATA / "events" / f"{d['id']}.json", d)
            entry = _index_entry(d)
            entry["home_short"], entry["away_short"] = d["home"]["abbr"] or d["home"]["name"], d["away"]["abbr"] or d["away"]["name"]
            index.append(entry)
            n += 1
        if n:
            status[f"in_arrivo_{key}"] = n
    # classifiche a gironi (Nations League, qualificazioni...): solo per le competizioni con partite in questi giorni
    for key, evs in per_comp.items():
        if key == "amichevoli" or not evs:
            continue
        try:
            n = _standings(key, NATIONAL[key], known)
            if n:
                status[f"classifica_{key}"] = n
        except Exception as ex:
            log.exception("Classifica %s", key)
            status[f"classifica_{key}"] = f"errore: {type(ex).__name__}"
    if unmatched:
        status["nazionali_senza_storico"] = sorted(unmatched)
    return index, reliability, status


def _group_it(name: str) -> str:
    """'League A, Group 1' -> 'Lega A, gruppo 1'; 'Group C' -> 'Gruppo C'."""
    if name.strip().isdigit():                  # girone unico (es. Sudamerica: "2026")
        return "Classifica"
    s = name.replace("League", "Lega").replace("Group", "gruppo").replace("Grupo", "gruppo")
    return s[:1].upper() + s[1:]


def _standings(key: str, comp: dict, known: set) -> int:
    """Scrive public/data/leagues/<competizione>.json con i gironi; restituisce quante squadre."""
    groups = espn.group_standings("soccer", comp["espn"])
    if not groups:
        return 0
    table = []
    for g in groups:
        gname = _group_it(g["name"])
        for r in g["rows"]:
            hn = to_history(r["name"], known)
            nm = it(hn) if hn else r["name"]
            table.append({**{k: r[k] for k in ("pos", "p", "w", "d", "l", "gf", "ga", "gd", "pts")},
                          "id": r["id"], "name": nm, "short": nm, "abbr": r["abbr"], "logo": r["logo"],
                          "group": gname, "note": r.get("note")})
    store.save(PUBLIC_DATA / "leagues" / f"{key}.json", {
        "key": key, "name": comp["name"], "sport": "soccer", "national": True, "groups": [_group_it(g["name"]) for g in groups],
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "table": table, "teams": {}})
    return len(table)
