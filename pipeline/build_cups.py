"""Coppe europee (Champions, Europa League, Conference) e Champions femminile.

Le squadre di una coppa arrivano da campionati diversi, quindi serve una scala comune:
il modello si adatta su tre stagioni di 11 campionati europei (football-data) più le partite
di coppa (ESPN). Sono le partite di coppa a collegare i campionati tra loro.
La Champions femminile usa solo i risultati ESPN della competizione (meno dati, meno affidabile)."""
import logging
from datetime import date, datetime, timedelta, timezone

from . import config, http, store
from .config import CACHE, CUPS, EURO_LINK_FD, EURO_LINK_FDNEW, PUBLIC_DATA, SOCCER_LEAGUES, WOMEN_CUPS
from .names import Matcher, norm
from .sources import espn, footballdata
from .models import soccer as S
from .build_soccer import _fd_history, espn_book, PLAYER_BASE
from . import photos, trends, weather

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


# Coefficiente UEFA delle federazioni (5 anni, uomini; aggiornare a ogni stagione, fonte uefa.com / Wikipedia
# "UEFA coefficient", novembre 2026). Serve solo a far partire le squadre senza campionato dal livello della nazione.
UEFA_COEF = {
    "England": 103.1, "Italy": 88.3, "Spain": 83.2, "Germany": 81.3, "France": 68.7, "Portugal": 65.0, "Belgium": 59.1,
    "Netherlands": 52.6, "Turkey": 49.9, "Poland": 45.1, "Czechia": 44.7, "Greece": 44.2, "Norway": 38.6, "Denmark": 38.3,
    "Cyprus": 34.2, "Switzerland": 30.2, "Austria": 27.7, "Hungary": 27.3, "Scotland": 26.3, "Sweden": 25.8, "Croatia": 25.7,
    "Romania": 24.9, "Ukraine": 24.3, "Israel": 23.9, "Azerbaijan": 23.7, "Slovenia": 22.8, "Slovakia": 22.4, "Bulgaria": 20.6,
    "Serbia": 18.3, "Russia": 17.3, "Iceland": 17.0, "Ireland": 16.3, "Armenia": 15.8, "Kosovo": 14.0, "Bosnia": 14.0,
    "Latvia": 13.9, "Finland": 13.6, "Kazakhstan": 12.4, "Liechtenstein": 11.0, "Moldova": 10.3, "Faroe Islands": 9.9,
    "Albania": 9.0, "North Macedonia": 9.0, "Belarus": 8.7, "Lithuania": 8.1, "Andorra": 7.8, "Malta": 7.6, "Gibraltar": 7.2,
    "Estonia": 7.0, "Northern Ireland": 6.6, "Georgia": 6.5, "Luxembourg": 6.3, "Montenegro": 5.8, "Wales": 4.5, "San Marino": 3.0,
}
COEF_REF = 30.0
# prefisso dello slug ESPN (es. "ukr.shakhtar_donetsk") → nazione
SLUG_CC = {"eng": "England", "ita": "Italy", "esp": "Spain", "ger": "Germany", "fra": "France", "por": "Portugal", "bel": "Belgium",
           "ned": "Netherlands", "tur": "Turkey", "pol": "Poland", "cze": "Czechia", "gre": "Greece", "nor": "Norway", "den": "Denmark",
           "cyp": "Cyprus", "sui": "Switzerland", "aut": "Austria", "hun": "Hungary", "sco": "Scotland", "swe": "Sweden",
           "cro": "Croatia", "rou": "Romania", "ukr": "Ukraine", "isr": "Israel", "aze": "Azerbaijan", "svn": "Slovenia", "slo": "Slovenia",
           "svk": "Slovakia", "bul": "Bulgaria", "srb": "Serbia", "rus": "Russia", "isl": "Iceland", "irl": "Ireland", "arm": "Armenia",
           "kos": "Kosovo", "bih": "Bosnia", "lva": "Latvia", "fin": "Finland", "kaz": "Kazakhstan", "lie": "Liechtenstein",
           "mda": "Moldova", "fro": "Faroe Islands", "alb": "Albania", "mkd": "North Macedonia", "blr": "Belarus", "ltu": "Lithuania",
           "and": "Andorra", "mlt": "Malta", "gib": "Gibraltar", "est": "Estonia", "nir": "Northern Ireland", "geo": "Georgia",
           "lux": "Luxembourg", "mne": "Montenegro", "wal": "Wales", "smr": "San Marino"}
COUNTRY_ALIAS = {"Türkiye": "Turkey", "Czech Republic": "Czechia", "Republic of Ireland": "Ireland",
                 "Bosnia and Herzegovina": "Bosnia", "Bosnia-Herzegovina": "Bosnia", "Macedonia": "North Macedonia"}
PRIOR_GRID = [(g, b) for g in (1.0, 0.9) for b in (0.0, 0.2, 0.35, 0.5, 0.7)]   # livello = g · (coef/30)^b
COUNTRY_MAX_REQ = 40
COUNTRY_NET = True   # spento dai dati di esempio


def _country(name: str | None) -> str | None:
    if not name:
        return None
    name = COUNTRY_ALIAS.get(name, name)
    return name if name in UEFA_COEF else None


def team_countries(cup_events: dict, ids: dict, status: dict) -> dict:
    """{nome squadra: nazione} per le squadre senza campionato. Prima lo slug ESPN della squadra
    (es. "cro.dinamo_zagreb"), poi lo stadio della scheda ESPN, poi lo stadio più frequente nelle partite in casa
    (Verifica fonti modo `nazione`). Cache permanente per id."""
    path = CACHE / "cups" / "countries.json"
    cache = store.load(path, {})
    venue = {}
    for evs in cup_events.values():
        for e in evs:
            c = _country(e.get("country"))
            if c and not e.get("neutral"):
                venue.setdefault(e["home"]["name"], []).append(c)
    out, n_req = {}, 0
    for name, tid in ids.items():
        c = cache.get(str(tid))
        if c is None and COUNTRY_NET and n_req < COUNTRY_MAX_REQ:
            n_req += 1
            c = ""
            js = None
            try:
                js = http.get_json(f"{espn.SITE}/soccer/all/teams/{tid}", delay=0.4, tries=1)
            except Exception:
                log.exception("Nazione %s", name)
            t = (js or {}).get("team") or {}
            pre = str(t.get("slug") or "").split(".")[0] if "." in str(t.get("slug") or "") else ""
            c = SLUG_CC.get(pre, "")
            if not c:
                try:
                    core = http.get_json(f"https://sports.core.api.espn.com/v2/sports/soccer/leagues/uefa.europa/teams/{tid}", delay=0.4, tries=1)
                    c = _country((((core or {}).get("venue") or {}).get("address") or {}).get("country")) or ""
                except Exception:
                    pass
            if js is not None:
                cache[str(tid)] = c
        if not c and venue.get(name):
            vs = venue[name]
            c = max(set(vs), key=vs.count)
        if c:
            out[name] = c
    store.save(path, cache)
    status["nazioni_squadre"] = f"{len(out)} su {len(ids)} ({n_req} richieste)"
    return out


def _levels(cup_only, countries, g, b) -> dict:
    return {t: g * min(1.15, (UEFA_COEF[countries[t]] / COEF_REF) ** b) if t in countries else g for t in cup_only}


def _prior_level(matches, cup_only, countries, since, is_test, today, status) -> tuple[float, float]:
    """Sceglie (g, b) con la log-loss sulle coppe: livello di partenza = g · (coefficiente della nazione / 30)^b."""
    path = CACHE / "cups" / "prior_level.json"
    old = store.load(path, {})
    if old.get("g") and old.get("date", "") >= (today - timedelta(days=7)).isoformat():
        status["livello_senza_campionato"] = old
        return old["g"], old["b"]
    res = {}
    for g, b in PRIOR_GRID:
        try:
            bt = S.backtest(matches, since, is_test=is_test, prior=_levels(cup_only, countries, g, b))
            res[f"{g}|{b}"] = bt["1x2"].get("logloss")
        except Exception:
            log.exception("Livello %s %s", g, b)
    ok = {k: v for k, v in res.items() if v is not None}
    if not ok:
        return 1.0, 0.0
    g, b = map(float, min(ok, key=ok.get).split("|"))
    out = {"g": g, "b": b, "date": today.isoformat(), "logloss": res, "squadre": len(cup_only),
           "con_nazione": sum(1 for t in cup_only if t in countries)}
    store.save(path, out)
    status["livello_senza_campionato"] = out
    return g, b


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
                "id": t.get("id"), "lk": (_player_base().get(str(t.get("id") or "")) or {}).get("league"),
                "alt": t.get("alt"), "logo": t.get("logo"), "fd": nm, "rating": ratings.table().get(nm)}
    th, ta = S.team_summary(matches, home, sf), S.team_summary(matches, away, sf)
    known = lambda nm: sum(1 for m in matches if nm in (m["home"], m["away"]))
    # giocatori: i ritmi di stagione nel loro campionato, con i gol attesi di questa partita di coppa
    base = _player_base()
    def players(side, lam):
        b = base.get(str(e[side].get("id") or ""))
        if not b or kind != "men":
            return []
        out = S.player_finalize(b["players"], lam, b["avg"])
        for p in out:
            u = photos.url_for(p["pid"])
            if u is not None:
                p["photo"] = u
        return out
    return {
        "id": f"calcio-{key}-{e['id']}", "sport": "soccer", "league": key, "league_name": name, "cup": kind,
        "date": e["date"], "venue": e.get("venue"),
        "home": team("home", home), "away": team("away", away),
        "markets": mk, "corners": None, "cards": None, "book": espn_book(e) or None,
        "form": {"home": th, "away": ta}, "h2h": S.h2h(matches, home, away), "players": {"home": players("home", lh), "away": players("away", la)},
        "low_data": known(home) < 15 or known(away) < 15,
        "trends": {"home": trends.soccer(th["last"], "home"), "away": trends.soccer(ta["last"], "away")},
        "reliability": bt["1x2"].get("grade"),
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
    }


_PB = None
def _player_base():
    global _PB
    if _PB is None:
        _PB = store.load(PLAYER_BASE, {}) or {}
    return _PB


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
    return [e for e in events if e["state"] in ("pre", "in")     # anche quelle in corso
            and datetime.fromisoformat(e["date"].replace("Z", "+00:00")) >= now - timedelta(hours=4)
            and date.fromisoformat(e["date"][:10]) <= today + timedelta(days=days)]


def build_men(today: date):
    status, index, reliability = {}, [], {}
    y = config.soccer_season_start_year(today)
    # 1) campionati europei
    pool, codes_of = [], {}
    codes = [lg["fd"] for lg in SOCCER_LEAGUES.values() if lg.get("kind") == "fd"] + list(EURO_LINK_FD)
    for code in codes:
        st = {}
        rows = _fd_history(code, y, st)
        pool += rows
        for r in rows:
            for t in (r["home"], r["away"]):
                codes_of.setdefault(t, set()).add(code)
        if not rows:
            status.setdefault("campionati_mancanti", []).append(code)
    since = date(y - 3, 1, 1).isoformat()
    for country, lname in EURO_LINK_FDNEW:
        path = CACHE / "cups" / f"link_{country}.json"
        rows = footballdata.new_league(country, lname, since)
        if rows:
            store.save(path, rows)
        else:
            rows = store.load(path, [])
            status.setdefault("campionati_mancanti", []).append(country)
        pool += rows
    matcher = Matcher([m["home"] for m in pool] + [m["away"] for m in pool], min_score=0.86)
    # Controllo del campionato: una squadra dei nostri campionati ha l'id ESPN nella base giocatori.
    # Senza questo «Inter D'Escaldes» (Andorra) veniva presa per l'Inter.
    main_codes = {lg["fd"] for lg in SOCCER_LEAGUES.values() if lg.get("kind") == "fd"}
    by_code = {}

    def code_matcher(code):
        if code not in by_code:
            by_code[code] = Matcher([t for t, cs in codes_of.items() if code in cs], min_score=0.72)
        return by_code[code]
    # 2) partite di coppa delle ultime due stagioni
    cup_events = {}
    for key, cup in CUPS.items():
        cup_events[key] = _cup_events(cup["espn"], date(y - 1, 6, 20), today + timedelta(days=config.DAYS_AHEAD["cups"]), today, status)
    unmatched = set()

    def nm(team):
        lk = (_player_base().get(str(team.get("id") or "")) or {}).get("league")
        code = (SOCCER_LEAGUES.get(lk) or {}).get("fd") if (SOCCER_LEAGUES.get(lk) or {}).get("kind") == "fd" else None
        if code:
            m = code_matcher(code).match(team["name"]) or matcher.match(team["name"])
        else:
            m = matcher.match(team["name"])
            cs = codes_of.get(m, set()) if m else set()
            if m and cs and cs <= main_codes and norm(m) != norm(team["name"]):
                x = f"{team['name']} ≠ {m}"
                if x not in status.setdefault("abbinamenti_scartati", []):
                    status["abbinamenti_scartati"].append(x)
                m = None
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
    # Squadre senza storico di campionato (Andorra, Malta, Kosovo...): partono sotto la media,
    # al livello scelto provando sulle partite di coppa già giocate (cache settimanale).
    league_teams = {t for m in pool for t in (m["home"], m["away"])}
    cup_only = {t for m in cup_matches for t in (m["home"], m["away"])} - league_teams
    is_cup = lambda m: m.get("comp") is not None
    ids = {}
    for evs in cup_events.values():
        for e in evs:
            for side in ("home", "away"):
                t = e[side]
                if t["name"] in cup_only and t.get("id"):
                    ids[t["name"]] = t["id"]
    try:
        countries = team_countries(cup_events, ids, status)
    except Exception:
        log.exception("Nazioni"); countries = {}
    g, b = _prior_level(matches, cup_only, countries, date(y - 1, 9, 1).isoformat(), is_cup, today, status)
    prior = _levels(cup_only, countries, g, b)
    ratings = S.fit(matches, today, prior=prior)
    if ratings is None:
        return [], {}, {**status, "errore": "storico insufficiente"}
    bt = S.backtest(matches, date(y - 1, 9, 1).isoformat(), is_test=is_cup, prior=prior)
    reliability["coppe"] = {"name": "Coppe europee", **bt}
    share = S.ht_share(pool)
    for key, cup in CUPS.items():
        n = 0
        for e in _upcoming(cup_events[key], today, config.DAYS_AHEAD["cups"]):
            d = _detail(key, cup["name"], e, nm(e["home"]), nm(e["away"]), matches, ratings, bt, share, "men")
            weather.attach([d], {e["id"]: e}, today)
            store.save(PUBLIC_DATA / "events" / f"{d['id']}.json", d)
            index.append(_index_entry(d))
            n += 1
        status[f"in_arrivo_{key}"] = n
        try:
            cup_page(key, cup, cup_events[key], ratings, nm, today, status)
        except Exception as ex:
            log.exception("Classifica %s", key)
            status[f"classifica_{key}"] = f"errore: {type(ex).__name__}"
    if unmatched:
        status["squadre_senza_campionato"] = sorted(unmatched)
    weather.save()
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


# ------------------------------------------------------------------ pagina della coppa: classifica, giornate, proiezione
LEAGUE_PHASE_MD = 8            # partite a testa nella fase a campionato (dal 2024-25)
SIMS = 10000


def cup_page(key: str, cup: dict, events: list[dict], ratings, nm, today: date, status: dict):
    """Scrive public/data/leagues/<coppa>.json: classifica della fase a campionato (ufficiale ESPN se c'è, altrimenti
    dai risultati), forma, giornate, numeri della competizione e una proiezione (ottavi diretti / playoff / fuori)
    simulando le partite che mancano col modello delle coppe."""
    import numpy as np
    from .build_soccer import rounds_of
    y = config.soccer_season_start_year(today)
    lp = [e for e in events if f"{y}-09-01" <= e["date"][:10] < f"{y + 1}-02-01"]
    if not lp:
        return 0
    teams, form = {}, {}
    for e in lp:
        for side in ("home", "away"):
            t = e[side]
            tid = str(t.get("id") or t["name"])
            if tid not in teams:
                teams[tid] = {"id": tid, "name": t["name"], "short": t.get("short") or t["name"], "abbr": t.get("abbr"),
                              "logo": t.get("logo"), "color": t.get("color"), "fd": nm(t),
                              "lk": (_player_base().get(tid) or {}).get("league"),
                              "p": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "pts": 0}
    done = [e for e in lp if e["completed"] and e["home"].get("score") is not None]
    for e in sorted(done, key=lambda e: e["date"]):
        h, a = str(e["home"].get("id") or e["home"]["name"]), str(e["away"].get("id") or e["away"]["name"])
        hg, ag = int(e["home"]["score"]), int(e["away"]["score"])
        for tid, gf, ga in ((h, hg, ag), (a, ag, hg)):
            T = teams[tid]
            T["p"] += 1; T["gf"] += gf; T["ga"] += ga
            res = "V" if gf > ga else ("N" if gf == ga else "P")
            T["w" if res == "V" else "d" if res == "N" else "l"] += 1
            T["pts"] += 3 if res == "V" else (1 if res == "N" else 0)
            form.setdefault(tid, []).insert(0, res)
    for T in teams.values():
        T["gd"] = T["gf"] - T["ga"]
        T["form"] = form.get(T["id"], [])[:5]
    table = sorted(teams.values(), key=lambda T: (-T["pts"], -T["gd"], -T["gf"], T["name"]))
    src = "risultati"
    try:   # classifica ufficiale (criteri di parità UEFA): stesse squadre, ordine e punti di ESPN
        groups = espn.group_standings("soccer", cup["espn"])
        rows = groups[0]["rows"] if len(groups) == 1 else []
        if len(rows) >= len(table) * 0.9:
            pos = {r["id"]: r for r in rows}
            for T in table:
                o = pos.get(T["id"])
                if o:
                    T.update({k: o[k] for k in ("pos", "p", "w", "d", "l", "gf", "ga", "gd", "pts")})
            table.sort(key=lambda T: T.get("pos") or 99)
            src = "ESPN"
    except Exception:
        log.exception("Classifica ufficiale %s", key)
    for i, T in enumerate(table, 1):
        T["pos"] = i
    # proiezione: partite che mancano (quelle già in calendario, le altre contro un avversario medio)
    left = [e for e in lp if not e["completed"]]
    n = len(table)
    ids = [T["id"] for T in table]
    ix = {t: i for i, t in enumerate(ids)}
    base_pts = np.array([T["pts"] for T in table], float)
    base_gd = np.array([T["gd"] for T in table], float)
    base_gf = np.array([T["gf"] for T in table], float)
    rng = np.random.default_rng(7)
    pts = np.repeat(base_pts[None, :], SIMS, 0); gd = np.repeat(base_gd[None, :], SIMS, 0); gf = np.repeat(base_gf[None, :], SIMS, 0)
    sched = {t: 0 for t in ids}

    def play(i, j, lh, la):
        g1, g2 = rng.poisson(lh, SIMS), rng.poisson(la, SIMS)
        for k, a, b in ((i, g1, g2), (j, g2, g1)):
            if k is None:
                continue
            pts[:, k] += np.where(a > b, 3, np.where(a == b, 1, 0)); gd[:, k] += a - b; gf[:, k] += a
    for e in left:
        h, a = str(e["home"].get("id") or e["home"]["name"]), str(e["away"].get("id") or e["away"]["name"])
        if h not in ix or a not in ix:
            continue
        lh, la = ratings.lambdas(teams[h]["fd"], teams[a]["fd"])
        play(ix[h], ix[a], lh, la)
        sched[h] += 1; sched[a] += 1
    avg = ratings.base
    for t in ids:      # partite non ancora in calendario: metà in casa e metà fuori contro una squadra media
        miss = LEAGUE_PHASE_MD - teams[t]["p"] - sched[t]
        for m in range(max(0, miss)):
            att, dfn = ratings._ad(teams[t]["fd"])
            if m % 2 == 0:
                play(ix[t], None, avg * ratings.home * att, avg * dfn)
            else:
                play(ix[t], None, avg * att, avg * ratings.home * dfn)
    proj = None
    if left or any(teams[t]["p"] < LEAGUE_PHASE_MD for t in ids):
        score = pts * 1e6 + gd * 1e3 + gf + rng.random(pts.shape)
        rank = (-score).argsort(1).argsort(1) + 1
        proj = True
        for i, T in enumerate(table):
            r = rank[:, i]
            T["sim"] = {"top8": round(float((r <= 8).mean()), 3), "po": round(float(((r > 8) & (r <= 24)).mean()), 3),
                        "out": round(float((r > 24).mean()), 3), "xpts": round(float(pts[:, i].mean()), 1)}
    # numeri della competizione
    tot = len(done)
    hg = [int(e["home"]["score"]) for e in done]; ag = [int(e["away"]["score"]) for e in done]
    stats = {}
    if tot:
        stats = {"matches": tot, "goals": round((sum(hg) + sum(ag)) / tot, 2), "home_w": round(sum(1 for x, y2 in zip(hg, ag) if x > y2) / tot, 3),
                 "draw": round(sum(1 for x, y2 in zip(hg, ag) if x == y2) / tot, 3), "over25": round(sum(1 for x, y2 in zip(hg, ag) if x + y2 > 2) / tot, 3),
                 "btts": round(sum(1 for x, y2 in zip(hg, ag) if x and y2) / tot, 3)}
        best = lambda f, rev=True: sorted(table, key=f, reverse=rev)[:3]
        stats["attack"] = [[T["short"], T["gf"]] for T in best(lambda T: T["gf"])]
        stats["defense"] = [[T["short"], T["ga"]] for T in best(lambda T: T["ga"], False) if T["p"]]
        stats["unbeaten"] = [T["short"] for T in table if T["p"] and not T["l"]][:6]
    for T in table:
        T.pop("fd", None)
    store.save(PUBLIC_DATA / "leagues" / f"{key}.json", {
        "key": key, "name": cup["name"], "sport": "soccer", "cup": True, "src": src, "proj": bool(proj),
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "table": table, "teams": {},
        "rounds": rounds_of(lp, date(y, 9, 1)), "stats": stats})
    status[f"classifica_{key}"] = f"{len(table)} squadre ({src})"
    return len(table)
