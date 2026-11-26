"""Calcio: scarica i dati, aggiorna la cache, calcola le percentuali e scrive i file del sito."""
import logging
from datetime import date, datetime, timedelta, timezone

from . import config, photos, store, trends, weather
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


OLD_SEASONS = 7        # stagioni in più (oltre alle 3 del modello) solo per gli scontri diretti
OLD_PER_RUN = 2        # stagioni vecchie scaricate al massimo per giro (restano in cache per sempre)
_OLD: dict = {}


def _fd_old(code: str, start_year: int) -> list[dict]:
    """Scontri diretti: stagioni più vecchie (solo data, squadre e gol), scaricate poco alla volta."""
    out, budget = [], OLD_PER_RUN
    for y in range(start_year - 3 - OLD_SEASONS + 1, start_year - 2):
        sc = config.fd_season_code(y)
        path = CACHE / "soccer" / f"fdold_{code}_{sc}.json"
        rows = store.load(path)
        if rows is None and budget > 0:
            budget -= 1
            try:
                fresh = footballdata.season(code, sc)
            except Exception:
                fresh = None
            rows = [{"date": m["date"], "home": m["home"], "away": m["away"], "hg": m["hg"], "ag": m["ag"]} for m in fresh or []]
            store.save(path, rows)
        out.extend(rows or [])
    return out


def _fdnew_history(lg: dict, season_from: date, status: dict) -> list[dict]:
    country, name = lg["fdnew"]
    path = CACHE / "soccer" / f"fdnew_{country}_{name}.json"
    since = date(season_from.year - 3, 1, 1).isoformat()
    fresh = footballdata.new_league(country, name, since)
    if fresh:
        store.save(path, fresh)
        status["football-data"] = "ok"
        return fresh
    status["football-data"] = "non raggiungibile, uso l'ultima copia"
    return store.load(path, [])


def season_info(lg: dict, today: date) -> dict:
    """Inizio della stagione in corso, data da cui parte la verifica e anno per i file di cache."""
    if lg.get("season") == "cal":
        sf = config.calendar_season_from(today)
        return {"from": sf, "bt_from": date(sf.year - 1, 3, 1), "year": sf.year}
    y = config.soccer_season_start_year(today)
    return {"from": date(y, 7, 1), "bt_from": date(y - 1, 8, 1), "year": y}


def _espn_rows(events: list[dict], season: str) -> list[dict]:
    """Partite concluse ESPN nel formato dello storico di football-data (solo gol)."""
    out = []
    for e in events:
        h, a = e["home"].get("score"), e["away"].get("score")
        if e.get("completed") and h is not None and a is not None:
            out.append({"date": e["date"][:10], "time": e["date"][11:16], "home": e["home"]["name"],
                        "away": e["away"]["name"], "hg": float(h), "ag": float(a), "season": season})
    return out


_ESPN_SEASON: dict = {}


def _espn_history(lg: dict, si: dict, today: date, status: dict) -> list[dict]:
    """Campionati senza football-data (es. A-League): storico dai risultati ESPN.
    La stagione scorsa si scarica una volta sola (un giorno per richiesta) e resta in cache."""
    y = si["from"].year
    prev_from = date(y - 1, si["from"].month, si["from"].day)
    path = CACHE / "soccer" / f"espn_hist_{lg['espn']}_{y - 1}.json"
    prev = store.load(path)
    if prev is None:
        raw = espn.scoreboard_range("soccer", lg["espn"], prev_from, si["from"] - timedelta(days=1))
        evs = [p for p in (espn.parse_event(ev) for ev in raw) if p]
        prev = _espn_rows(evs, str(y - 1))
        if len(prev) >= 50:   # salvo solo se la stagione è arrivata davvero
            store.save(path, prev)
    cur_events = _espn_events(lg, si["from"], today, status)
    _ESPN_SEASON[lg["espn"]] = cur_events
    rows = prev + _espn_rows(cur_events, str(y))
    status["storico"] = f"ESPN, {len(prev)} partite stagione scorsa + {len(rows) - len(prev)} di questa"
    return sorted(rows, key=lambda m: m["date"])


def history(lg: dict, today: date, status: dict) -> list[dict]:
    si = season_info(lg, today)
    if lg.get("kind") == "espn":
        return _espn_history(lg, si, today, status)
    if lg.get("kind") == "fdnew":
        return _fdnew_history(lg, si["from"], status)
    return _fd_history(lg["fd"], si["year"], status)


def _attach_xg(matches: list[dict], league: dict, start_year: int, matcher: Matcher, status: dict):
    have = sum(1 for m in matches if m.get("hxg") is not None)
    if have:
        status["xg"] = f"football-data, {have} partite"
    if not league.get("understat") or have > len(matches) * 0.6:
        return have
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
        # Understat risponde con una pagina generica ai server di GitHub (verificato con Verifica fonti, modo xg):
        # gli xG della stagione in corso arrivano comunque da football-data, manca solo la stagione scorsa
        status.setdefault("understat", "non raggiungibile: xG della stagione da football-data, stagione scorsa solo gol" if have else "non raggiungibile (si usano solo i gol)")
        return have
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
                if m.get("hxg") is None:
                    m["hxg"], m["axg"] = x["hxg"], x["axg"]
                    n += 1
                break
    return have + n


def espn_book(e: dict) -> dict:
    """Quote ESPN (DraftKings) per una partita in arrivo, senza margine."""
    o = e.get("odds") or {}
    book = {}
    if o.get("p_draw") is not None:
        book["1x2"] = [r(o["p_home"]), r(o["p_draw"]), r(o["p_away"])]
    if o.get("total") == 2.5 and o.get("p_over") is not None:
        book["ou25"] = [r(o["p_over"]), r(o["p_under"])]
    if book:
        book["provider"] = o.get("provider")
    return book


def espn_events(league: dict, season_from: date, today: date, status: dict, days_ahead: int | None = None) -> list[dict]:
    return _espn_events(league, season_from, today, status, days_ahead)


def _espn_events(league: dict, season_from: date, today: date, status: dict, days_ahead: int | None = None) -> list[dict]:
    path = CACHE / "soccer" / f"espn_events_{league['espn']}_{season_from.year}.json"
    cached = {e["id"]: e for e in store.load(path, [])}
    start = season_from
    done = [e for e in cached.values() if e["completed"]]
    if done:
        start = max(season_from, date.fromisoformat(max(e["date"][:10] for e in done)) - timedelta(days=4))
    ahead = days_ahead if days_ahead is not None else config.DAYS_AHEAD["soccer"]
    fresh = espn.scoreboard_range("soccer", league["espn"], start, today + timedelta(days=ahead))
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
    fixtures = footballdata.fixtures()
    index, reliability, status_all = [], {}, {}
    for key, lg in SOCCER_LEAGUES.items():
        status = {}
        try:
            si = season_info(lg, today)
            season_from, start_year = si["from"], si["year"]
            matches = history(lg, today, status)
            try:
                _OLD[key] = _fd_old(lg["fd"], season_info(lg, today)["year"]) if lg.get("fd") and lg.get("kind", "fd") == "fd" else []
            except Exception:
                log.exception("Scontri diretti vecchi %s", key)
                _OLD[key] = []
            if not matches:
                status_all[key] = {**status, "errore": "nessuno storico disponibile"}
                continue
            matcher = Matcher([m["home"] for m in matches] + [m["away"] for m in matches])
            n_xg = _attach_xg(matches, lg, start_year, matcher, status)
            status["xg_partite"] = n_xg
            events = _ESPN_SEASON.pop(lg["espn"], None) or _espn_events(lg, season_from, today, status)
            lines = _espn_players(lg, start_year, events, status)

            ratings = S.fit(matches, today)
            if ratings is None:
                status_all[key] = {**status, "errore": "storico insufficiente"}
                continue
            share = S.ht_share(matches)
            table = S.standings(matches, season_from.isoformat())
            pos = {t["team"]: t for t in table}
            bt = S.backtest(matches, si["bt_from"].isoformat())
            reliability[key] = {"name": lg["name"], **bt}

            now = datetime.now(timezone.utc)
            # anche quelle in corso: la scheda deve restare apribile durante la partita
            upcoming = [e for e in events if e["state"] in ("pre", "in")
                        and datetime.fromisoformat(e["date"].replace("Z", "+00:00")) >= now - timedelta(hours=4)
                        and date.fromisoformat(e["date"][:10]) <= today + timedelta(days=config.DAYS_AHEAD["soccer"])]
            unmatched = set()
            foto, details = {}, []
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
                details.append(detail)
            try:  # le foto non devono mai bloccare le partite
                photos.attach_many(details, today, foto)
            except Exception:
                log.exception("Foto %s", key)
            nw = weather.attach(details, {e["id"]: e for e in events}, today)
            if nw:
                status["meteo"] = f"{nw} partite"
            for detail in details:
                store.save(PUBLIC_DATA / "events" / f"{detail['id']}.json", detail)
                index.append(_index_entry(detail))
            try:  # classifica e schede squadra: un errore qui non tocca le partite
                league_page(key, lg, matches, events, matcher, lines, completed_by_team, season_from, table, ratings)
            except Exception:
                log.exception("Pagina campionato %s", key)
            if unmatched:
                status["nomi_non_abbinati"] = sorted(unmatched)
            status["partite_in_arrivo"] = len(upcoming)
            if foto:
                status["foto_giocatori"] = ", ".join(f"{k} {v}" for k, v in foto.items())
                photos.save()
            status_all[key] = status
        except Exception as ex:  # un campionato che fallisce non blocca gli altri
            log.exception("Errore %s", key)
            status_all[key] = {**status, "errore": f"{type(ex).__name__}: {ex}"}
    weather.save()
    return index, reliability, status_all


def _event_detail(key, lg, e, home, away, matches, ratings, share, pos, lines, completed_by_team,
                  fixtures, matcher, today, season_from, bt):
    lh, la = ratings.lambdas(home, away)
    mk = S.markets(lh, la, share)
    corners = S.side_counts(matches, today, home, away, "hc", "ac", "corners_f", "corners_a")
    cards = S.side_counts(matches, today, home, away, "hy", "ay", "yellow_f", "yellow_a")
    book = {}
    f = _book_from_fixtures(fixtures, lg["fd"], matcher, e["date"][:10], home, away) if lg.get("fd") else None
    if f:
        p = devig(f.get("o1x2"))
        if p:
            book["1x2"] = [r(x) for x in p]
            book["odds_1x2"] = f["o1x2"]
        p = devig(f.get("oou25"))
        if p:
            book["ou25"] = [r(x) for x in p]
            book["odds_ou25"] = f["oou25"]
        if book:
            book["provider"] = "media bookmaker"
    if not book:
        book = espn_book(e)
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
        return {"name": t["name"], "short": t["short"], "abbr": t.get("abbr"), "color": t.get("color"), "alt": t.get("alt"), "logo": t.get("logo"), "fd": name,
                "id": t.get("id"), "lk": key,
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
        "h2h": S.h2h(_OLD.get(key, []) + matches, home, away),
        "players": players,
        "trends": {"home": trends.soccer(th["last"], "home"), "away": trends.soccer(ta["last"], "away")},
        "reliability": bt["1x2"].get("grade"),
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
    }


def _index_entry(d):
    mk = d["markets"]
    return {"id": d["id"], "sport": "soccer", "league": d["league"], "league_name": d["league_name"],
            "date": d["date"], "home": d["home"]["name"], "away": d["away"]["name"],
            "home_short": d["home"].get("abbr") or d["home"]["short"], "away_short": d["away"].get("abbr") or d["away"]["short"],
            "home_color": d["home"].get("color"), "away_color": d["away"].get("color"), "home_alt": d["home"].get("alt"), "away_alt": d["away"].get("alt"),
            "home_logo": d["home"].get("logo"), "away_logo": d["away"].get("logo"),
            "main": mk["1x2"], "main_labels": ["1", "X", "2"],
            "book": (d.get("book") or {}).get("1x2"),
            "extra": {"Over 2,5": mk["ou"]["2.5"], "Goal": mk["btts"]},
            "xg": mk["xg"]}


# ---------------------------------------------------------------- classifica e schede squadra

PLAYER_BASE = CACHE / "soccer" / "player_base.json"


def _public_player(p: dict) -> dict:
    out = {k: v for k, v in p.items() if not k.startswith("_")}
    u = photos.url_for(p["pid"])
    if u:
        out["photo"] = u
    return out


def rounds_of(events: list[dict], season_from) -> list[dict]:
    """Giornate dal calendario ESPN della stagione. ESPN non dà il numero della giornata: ogni partita va nella prima
    giornata in cui nessuna delle due squadre ha già giocato (così anche i recuperi tornano nella giornata giusta)."""
    sf = season_from.isoformat()
    used: dict[str, set] = {}
    out: dict[int, list] = {}
    for e in sorted(events, key=lambda e: e["date"]):
        if e["date"][:10] < sf or e.get("status") in ("Canceled", "Postponed") and not e.get("completed"):
            continue
        h, a = str(e["home"].get("id") or e["home"]["name"]), str(e["away"].get("id") or e["away"]["name"])
        uh, ua = used.setdefault(h, set()), used.setdefault(a, set())
        k = 1
        while k in uh or k in ua:
            k += 1
        uh.add(k); ua.add(k)
        done = e.get("completed")
        out.setdefault(k, []).append([e["date"], h, a, int(e["home"]["score"]) if done and e["home"].get("score") is not None else None,
                                      int(e["away"]["score"]) if done and e["away"].get("score") is not None else None, e["id"],
                                      e["home"].get("short") or e["home"]["name"], e["away"].get("short") or e["away"]["name"]])
    return [{"n": k, "m": out[k]} for k in sorted(out)]


def league_page(key, lg, matches, events, matcher, lines, completed_by_team, season_from, table, ratings=None):
    """Scrive public/data/leagues/<campionato>.json (classifica e squadre) e i ritmi dei giocatori per le coppe."""
    sf = season_from.isoformat()
    espn_of = {}                      # nome football-data -> dati ESPN della squadra
    for e in events:
        for side in ("home", "away"):
            t = e[side]
            fd = matcher.match(t["name"])
            if fd and t.get("id"):
                espn_of[fd] = {k: t.get(k) for k in ("id", "name", "short", "abbr", "color", "alt", "logo")}
    base_cache = store.load(PLAYER_BASE, {})
    rows, teams = [], {}
    # foto per tutte le rose, non solo per chi gioca nei prossimi giorni (es. durante le soste)
    bases = {}
    for row in table:
        info = espn_of.get(row["team"], {})
        tid = str(info.get("id") or "")
        if tid:
            bases[tid] = S.player_base(lines, tid, completed_by_team.get(tid, []))
    try:
        pseudo = [{"home": {**espn_of.get(row["team"], {}), "fd": row["team"]},
                   "players": {"home": bases.get(str(espn_of.get(row["team"], {}).get("id") or ""), [])}} for row in table]
        photos.attach_many(pseudo, config.today(), {})
        photos.save()
    except Exception:
        log.exception("Foto delle rose %s", key)
    for row in table:
        info = espn_of.get(row["team"], {})
        summ = S.team_summary(matches, row["team"], sf)
        tid = str(info.get("id") or "")
        rows.append({**{k: row[k] for k in ("pos", "p", "w", "d", "l", "gf", "ga", "gd", "pts")}, "fd": row["team"],
                     "id": tid, "name": info.get("name") or row["team"], "short": info.get("short") or row["team"],
                     "logo": info.get("logo"), "color": info.get("color"), "form": summ["form5"].get("seq", [])})
        if not tid:
            continue
        base = bases.get(tid) or []
        base_cache[tid] = {"avg": summ["season"].get("gf") or 1.3, "players": base, "league": key}
        players = sorted((_public_player(p) for p in base), key=lambda p: (-(p["tot"]["g"] + p["tot"]["a"]), -p["apps"]))
        teams[tid] = {**info, "fd": row["team"], "pos": row["pos"], "pts": row["pts"],
                      "last": summ["last"][:10], "form5": summ["form5"], "form10": summ["form10"],
                      "season": summ["season"], "home_season": summ["home_season"], "away_season": summ["away_season"],
                      "players": players, "trends": trends.soccer(summ["last"])}
    store.save(PLAYER_BASE, base_cache)
    extra = {}
    if ratings is not None:
        from . import season_sim
        try:   # come può finire: titolo, zone europee, retrocessione
            sim = season_sim.simulate(key, rows, matches, sf, ratings)
            if sim:
                for r in rows:
                    r["sim"] = sim["teams"].get(r["fd"])
                extra["sim"] = {"labels": sim["labels"], "cut": sim["cut"], "left": sim["left"]}
        except Exception:
            log.exception("Simulazione %s", key)
        try:   # prossime 5 partite con la difficoltà
            info = {tid: {"abbr": t.get("abbr"), "short": t.get("short"), "fd": t.get("fd")} for tid, t in teams.items()}
            nx = season_sim.next5(info, lg.get("espn", ""), ratings)
            for tid, lst in nx.items():
                teams[tid]["next5"] = lst
        except Exception:
            log.exception("Prossime 5 %s", key)
    store.save(PUBLIC_DATA / "leagues" / f"{key}.json", {
        "key": key, "name": lg["name"], "sport": "soccer", "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "table": rows, "teams": teams, "rounds": _safe_rounds(events, season_from), **extra})


def _safe_rounds(events, season_from):
    try:
        return rounds_of(events, season_from)
    except Exception:
        log.exception("Giornate")
        return []
