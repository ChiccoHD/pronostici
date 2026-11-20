"""Verifica delle fonti: controlla cosa restituisce davvero ogni fonte e scrive report/fonti.md.
Uso: python -m pipeline.check_sources"""
import logging
import time
import os
from datetime import date, timedelta

from . import config, http
from .config import ROOT, SOCCER_LEAGUES
from .sources import espn, footballdata, understat

lines: list[str] = []


def out(s=""):
    print(s)
    lines.append(s)


def check(label, ok, detail=""):
    out(f"- {'✅' if ok else '❌'} **{label}** {detail}")
    return ok


def photos_check():
    """Prova delle fonti delle foto su qualche calciatore noto (e uno inventato)."""
    from .sources import thesportsdb, wikidata
    out("## Foto dei calciatori")
    test = [("Harry Kane", ["Bayern Munich"]), ("Michael Olise", ["Bayern Munich"]), ("Dayot Upamecano", ["Bayern Munich"]),
            ("Lautaro Martínez", ["Inter Milan", "Inter"]), ("Luis Díaz", ["Bayern Munich"]), ("Pedri", ["Barcelona"]),
            ("Kylian Mbappé", ["Real Madrid"]), ("Josip Stanisic", ["Bayern Munich"]), ("Kim Min-Jae", ["Bayern Munich"]),
            ("Lennart Karl", ["Bayern Munich"]), ("Tom Bischof", ["Bayern Munich"]), ("Nome Inventato Xyz", ["Nessuna"])]
    res = wikidata.footballer_photos(test)
    check("Wikidata: foto trovate", bool(res), f"({sum(1 for v in (res or {}).values() if v)} su {len(test)})")
    for n, _ in test:
        out(f"  - {n}: {(res or {}).get(n)}")
    url, ok = thesportsdb.player_photo("Harry Kane", ["Bayern Munich"])
    check("TheSportsDB: risponde", ok, f"({url})")


def live_check():
    """Com'è fatto il riepilogo ESPN di una partita appena giocata: cronaca (keyEvents) e statistiche."""
    import json
    from datetime import timedelta
    today = config.today()
    out("## Riepilogo partite (per la sezione Live)")
    for sport, league, label in (("soccer", "eng.1", "Premier"), ("soccer", "ita.1", "Serie A"), ("basketball", "nba", "NBA")):
        evs = espn.scoreboard(sport, league, today - timedelta(days=10), today)
        done = [p for p in (espn.parse_event(e) for e in evs) if p and p["completed"]]
        if not done:
            out(f"- {label}: nessuna partita conclusa")
            continue
        s = espn.summary(sport, league, done[-1]["id"]) or {}
        out(f"### {label} – partita {done[-1]['id']}")
        out(f"- chiavi: {', '.join(sorted(s.keys()))}")
        ke = s.get("keyEvents") or []
        out(f"- keyEvents: {len(ke)}; tipi: {sorted({(k.get('type') or {}).get('type', '?') for k in ke})}")
        for k in ke[:2] + [k for k in ke if k.get("scoringPlay")][:1] + [k for k in ke if "card" in str((k.get("type") or {}).get("type"))][:1] + [k for k in ke if "sub" in str((k.get("type") or {}).get("type"))][:1]:
            out("  - " + json.dumps(k, ensure_ascii=False)[:900])
        for t in (s.get("boxscore") or {}).get("teams", [])[:1]:
            out("- statistiche squadra: " + json.dumps([{x.get("name"): x.get("displayValue"), "label": x.get("label")} for x in t.get("statistics", [])], ensure_ascii=False)[:1500])
        pl = s.get("plays") or []
        out(f"- plays: {len(pl)}" + (" esempio: " + json.dumps(pl[-1], ensure_ascii=False)[:600] if pl else ""))
        cm = s.get("commentary") or []
        out(f"- commentary: {len(cm)}" + (" esempio: " + json.dumps(cm[-1], ensure_ascii=False)[:500] if cm else ""))
        lead = s.get("leaders") or []
        out(f"- leaders: " + json.dumps(lead, ensure_ascii=False)[:700])


def logos_check():
    """Loghi dei campionati come li dà ESPN nel calendario (chiave leagues)."""
    from . import http
    out("## Loghi dei campionati")
    codes = [("soccer", lg["espn"]) for lg in SOCCER_LEAGUES.values()] + [("soccer", c["espn"]) for c in config.CUPS.values()] \
        + [("soccer", c["espn"]) for c in config.WOMEN_CUPS.values()] + [("basketball", "nba"), ("tennis", "atp"), ("tennis", "wta")]
    for sport, code in codes:
        js = http.get_json(f"{espn.SITE}/{sport}/{code}/scoreboard") or {}
        lg = (js.get("leagues") or [{}])[0]
        logos = {",".join(l.get("rel", [])): l.get("href") for l in lg.get("logos", [])}
        out(f"- {code}: id {lg.get('id')} · {lg.get('name')} · {logos}")


def research_check():
    """Prove per nuovi campionati e per il tennis (competizioni a squadre, statistiche)."""
    import json
    from datetime import timedelta, date as _date
    from . import http
    today = config.today()
    sy = config.soccer_season_start_year(today)
    out("## Nuovi campionati di calcio")
    for code, fd in (("ita.2", "I2"), ("eng.2", "E1"), ("ned.1", "N1"), ("tur.1", "T1"), ("sco.1", "SC0"), ("bel.1", "B1")):
        js = http.get_json(f"{espn.SITE}/soccer/{code}/scoreboard") or {}
        lg = (js.get("leagues") or [{}])[0]
        logos = {",".join(l.get("rel", [])): l.get("href") for l in lg.get("logos", [])}
        evs = espn.scoreboard("soccer", code, today - timedelta(days=10), today + timedelta(days=10))
        done = [p for p in (espn.parse_event(e) for e in evs) if p and p["completed"]]
        pl = espn.soccer_player_lines(espn.summary("soccer", code, done[-1]["id"]) or {}) if done else []
        rows = footballdata.season(fd, config.fd_season_code(sy))
        out(f"- {code}/{fd}: {lg.get('name')} · logo {logos.get('full,default')} · ESPN ±10gg {len(evs)} partite, tabellino {len(pl)} giocatori · football-data {len(rows)} partite, quote {sum(1 for m in rows if m.get('o1x2'))}, xG {sum(1 for m in rows if m.get('hxg') is not None)}")
    out("\n## Tennis: competizioni su ESPN")
    core = http.get_json("https://sports.core.api.espn.com/v2/sports/tennis/leagues", {"limit": 50}) or {}
    for it in (core.get("items") or [])[:30]:
        ref = it.get("$ref", "")
        lg = http.get_json(ref) or {}
        out(f"- {lg.get('slug')} · {lg.get('name')} · {lg.get('abbreviation')}")
    for slug in ("davis-cup", "billie-jean-king-cup", "united-cup", "itf", "atp-challenger", "challenger"):
        js = http.get_json(f"{espn.SITE}/tennis/{slug}/scoreboard")
        out(f"- prova /tennis/{slug}/scoreboard: {'risponde, ' + str(len((js or {}).get('events', []))) + ' eventi' if js else 'niente'}")
    # nomi degli eventi ATP nelle settimane di Davis / United Cup
    for d in (_date(today.year - 1 if today.month < 9 else today.year, 9, 12), _date(today.year, 1, 3), _date(today.year - 1, 11, 21)):
        evs = espn.scoreboard_day("tennis", "atp", d) or []
        out(f"- ATP {d}: {[e.get('name') for e in evs][:8]}")
    out("\n## Tennis: riepilogo di un incontro concluso")
    evs = espn.scoreboard("tennis", "atp", today - timedelta(days=3), today)
    ms = [m for m in espn.tennis_matches(evs, "atp") if m["state"] == "post"]
    if ms:
        m = ms[-1]
        ev_id = next((e.get("id") for e in evs if any(str(c.get("id")) == m["id"] for g in e.get("groupings", []) for c in g.get("competitions", []))), None)
        for url in (f"{espn.SITE}/tennis/atp/summary?event={m['id']}", f"{espn.SITE}/tennis/atp/summary?event={ev_id}&competition={m['id']}"):
            js = http.get_json(url)
            out(f"- {url}: {'chiavi ' + ', '.join(sorted(js.keys())) if js else 'niente'}")
            if js:
                out("  " + json.dumps(js, ensure_ascii=False)[:1500])
        for e in evs:
            for g in e.get("groupings", []):
                for c in g.get("competitions", []):
                    if str(c.get("id")) == m["id"]:
                        out("- competizione nel tabellone: chiavi " + ", ".join(sorted(c.keys())))
                        out("  concorrente: " + json.dumps(c.get("competitors", [{}])[0], ensure_ascii=False)[:1200])


def tennis_live_check():
    """Com'è fatto un incontro di tennis in corso sul tabellone ESPN (punti, servizio, set)."""
    import json
    from . import http
    for tour in ("atp", "wta"):
        js = http.get_json(f"{espn.SITE}/tennis/{tour}/scoreboard") or {}
        for ev in js.get("events", []):
            for g in ev.get("groupings", []):
                for c in g.get("competitions", []):
                    if (c.get("status") or {}).get("type", {}).get("state") == "in":
                        out(f"## {tour} in corso: {ev.get('name')}")
                        out(json.dumps(c, ensure_ascii=False)[:6000])
                        js2 = http.get_json(f"https://site.web.api.espn.com/apis/site/v2/sports/tennis/{tour}/summary", {"event": c.get("id")})
                        out("summary web: " + (", ".join(sorted(js2.keys())) if js2 else "niente"))
                        return
    out("nessun incontro in corso")


def cache_check():
    """Quanto sono vecchie le risposte ESPN: header di cache, con e senza un parametro che cambia ogni volta."""
    import time, requests
    urls = [("tennis atp", "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard"),
            ("tennis atp web", "https://site.web.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard"),
            ("calcio ita.1", "https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard"),
            ("nba", "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard")]
    keys = ("cache-control", "age", "expires", "x-cache", "last-modified", "date", "cf-cache-status", "x-akamai-staging")
    for label, u in urls:
        for bust in (False, True):
            url = u + (f"?_={int(time.time() * 1000)}" if bust else "")
            try:
                r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
                h = {k: r.headers.get(k) for k in keys if r.headers.get(k)}
                out(f"- {label}{' (parametro anti-cache)' if bust else ''}: HTTP {r.status_code} {h}")
            except Exception as e:
                out(f"- {label}: errore {e}")
            time.sleep(1)


NATIONAL_CANDIDATES = ["uefa.nations", "fifa.friendly", "fifa.world", "uefa.euro", "uefa.euroq", "fifa.worldq.uefa",
                       "fifa.worldq.conmebol", "fifa.worldq.concacaf", "fifa.worldq.afc", "fifa.worldq.caf", "fifa.worldq.ofc",
                       "conmebol.america", "concacaf.nations.league", "concacaf.gold", "caf.nations", "caf.nations_qual",
                       "afc.asian.cup", "afc.cupq", "fifa.confederations", "fifa.worldq", "uefa.nations.w", "fifa.friendly.w"]


def national_check():
    """Competizioni delle nazionali su ESPN: calendario, partite dei prossimi giorni, nomi, loghi, quote, statistiche."""
    import json
    from datetime import date
    from . import http
    today = config.today()
    out("## Nazionali")
    names, sample_done = {}, None
    for code in NATIONAL_CANDIDATES:
        js = http.get_json(f"{espn.SITE}/soccer/{code}/scoreboard")
        if not js:
            check(code, False, "nessuna risposta")
            continue
        lg = (js.get("leagues") or [{}])[0]
        cal = lg.get("calendar") or []
        cal_dates = sorted({str(c if isinstance(c, str) else (c.get("startDate") or c.get("value") or ""))[:10] for c in cal})
        fut = [d for d in cal_dates if d >= today.isoformat()]
        logos = [l.get("href") for l in lg.get("logos", [])][:2]
        season = lg.get("season") or {}
        check(code, True, f"· id {lg.get('id')} · {lg.get('name')} · stagione {season.get('year')} {season.get('startDate','')[:10]}→{season.get('endDate','')[:10]} · "
              f"calendario {len(cal_dates)} date, prossime {fut[:8]} · loghi {logos} · eventi di default {len(js.get('events') or [])}")
        days = [date.fromisoformat(d) for d in fut if d <= (today + timedelta(days=14)).isoformat()][:8]
        evs = []
        for d in days:
            evs += espn.scoreboard_day("soccer", code, d) or []
        if not days:
            evs = js.get("events") or []
        parsed = [p for p in (espn.parse_event(e) for e in evs) if p]
        odds = sum(1 for e in evs if (e.get("competitions") or [{}])[0].get("odds"))
        neutral = sum(1 for e in evs if (e.get("competitions") or [{}])[0].get("neutralSite"))
        out(f"  - partite lette {len(parsed)} (con quote {odds}, campo neutro {neutral})")
        for p in parsed[:40]:
            out(f"    - {p['date']} {p['state']} {p['home']['name']} [{p['home'].get('abbr')}] – {p['away']['name']} [{p['away'].get('abbr')}] · logo {p['home'].get('logo')}")
            names[p["home"]["name"]] = names[p["away"]["name"]] = 1
        if sample_done is None:
            done = [p for p in parsed if p["completed"]]
            if done:
                s = espn.summary("soccer", code, done[-1]["id"]) or {}
                out(f"  - riepilogo {done[-1]['id']}: chiavi {sorted(s.keys())}; keyEvents {len(s.get('keyEvents') or [])}; "
                    f"rosters {len(s.get('rosters') or [])}; statistiche {[len(t.get('statistics', [])) for t in (s.get('boxscore') or {}).get('teams', [])]}")
                sample_done = code
    # passato recente (per i risultati non ancora nello storico)
    for code in ("uefa.nations", "fifa.friendly"):
        evs = espn.scoreboard("soccer", code, today - timedelta(days=40), today - timedelta(days=34))
        out(f"- {code} dal {today - timedelta(days=40)}: {len(evs)} partite, concluse {sum(1 for p in map(espn.parse_event, evs) if p and p['completed'])}")
    out(f"- nomi delle nazionali visti: {', '.join(sorted(names))}")


def ht_check(ids):
    """Fine primo tempo: cosa dice ESPN (stato del tabellone, keyEvents, commento) e a che ora."""
    from . import http
    out("## Fine primo tempo")
    sb = http.get_json(f"{espn.SITE}/soccer/uefa.nations/scoreboard") or {}
    for ev in sb.get("events", []):
        st = (ev.get("status") or {})
        out(f"- tabellone {ev.get('id')} {ev.get('name')}: {st.get('type', {}).get('name')} · {st.get('type', {}).get('shortDetail')} · periodo {st.get('period')} · orologio {st.get('displayClock')}")
    for i in ids:
        s = http.get_json(f"{espn.SITE}/soccer/uefa.nations/summary?event={i}") or {}
        out(f"### {i}: chiavi {sorted(s.keys())}")
        for k in (s.get("keyEvents") or []):
            out(f"  - key {k.get('type', {}).get('type')} · {k.get('type', {}).get('text')} · {k.get('clock', {}).get('displayValue')} · periodo {k.get('period', {}).get('number')} · wallclock {k.get('wallclock')} · {str(k.get('text'))[:80]}")
        com = s.get("commentary") or []
        out(f"  - commento: {len(com)} righe")
        for c in com:
            t = str(c.get("text", ""))
            if any(w in t.lower() for w in ("half", "kick", "end", "ends", "begins")):
                out(f"    - {c.get('time', {}).get('displayValue')} · {t[:100]} · {c.get('play', {}).get('wallclock')}")


def injuries_check():
    """Infortuni: endpoint ESPN per NBA e calcio, e cosa c'è nel summary delle partite."""
    import json
    from . import http
    out("## Infortuni")
    for path in ("basketball/nba", "soccer/eng.1", "soccer/ita.1", "soccer/esp.1"):
        js = http.get_json(f"{espn.SITE}/{path}/injuries")
        if not js:
            check(f"{path}/injuries", False, "nessuna risposta"); continue
        teams = js.get("injuries") or []
        n = sum(len(t.get("injuries") or []) for t in teams)
        check(f"{path}/injuries", bool(teams), f"{len(teams)} squadre, {n} giocatori")
        if teams and teams[0].get("injuries"):
            out(f"  - esempio: {json.dumps(teams[0]['injuries'][0], ensure_ascii=False)[:700]}")
            out(f"  - squadra: {json.dumps({k: v for k, v in teams[0].items() if k != 'injuries'}, ensure_ascii=False)[:300]}")
    for path in ("basketball/nba", "soccer/eng.1", "soccer/ita.1"):
        sb = http.get_json(f"{espn.SITE}/{path}/scoreboard") or {}
        evs = [e for e in sb.get("events", []) if e.get("status", {}).get("type", {}).get("state") == "pre"] or sb.get("events", [])
        if not evs:
            out(f"- {path}: nessuna partita nel tabellone"); continue
        s = http.get_json(f"{espn.SITE}/{path}/summary?event={evs[0]['id']}") or {}
        inj = s.get("injuries")
        out(f"- summary {path} {evs[0]['id']}: chiavi {sorted(s.keys())}; injuries: {json.dumps(inj, ensure_ascii=False)[:600] if inj else 'nessuno'}")


def standings_check():
    """Classifiche a gironi delle nazionali (ESPN /apis/v2/.../standings): struttura grezza e lettura."""
    import json
    out("## Classifiche delle nazionali")
    for code in ("uefa.nations", "fifa.worldq.uefa", "concacaf.nations.league", "fifa.worldq.conmebol", "caf.nations_qual"):
        js = espn.standings_raw("soccer", code)
        if not js:
            check(code, False, "nessuna risposta")
            continue
        out(f"### {code}")
        out(f"- chiavi: {list(js.keys())}; season: {json.dumps(js.get('season'))[:200]}")
        ch = js.get("children") or []
        out(f"- children: {len(ch)}: {[c.get('name') for c in ch][:20]}")
        if ch:
            c0 = ch[0]
            out(f"- primo figlio: chiavi {list(c0.keys())}; figli {len(c0.get('children') or [])}")
            ents = (c0.get("standings") or {}).get("entries") or []
            if ents:
                e = ents[0]
                out(f"- entry: {json.dumps({k: v for k, v in e.items() if k != 'stats'}, ensure_ascii=False)[:600]}")
                out(f"- stats: {[(x.get('name'), x.get('value')) for x in e.get('stats') or []]}")
        gs = espn.group_standings("soccer", code)
        check(f"{code}: gironi letti", bool(gs), f"({len(gs)} gironi, {sum(len(g['rows']) for g in gs)} squadre)")
        for g in gs[:3]:
            out(f"  - {g['name']}: " + ", ".join(f"{r['pos']}. {r['name']} {r['pts']} ({r['p']}G, {r['gd']:+d})" for r in g["rows"]))


def xg_check():
    """Understat: risposta grezza delle due vie (API e pagina), per capire se blocca o se ha cambiato formato."""
    import requests
    out("## Understat")
    H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"}
    for url, extra in (("https://understat.com/getLeagueData/Serie_A/2025", {"X-Requested-With": "XMLHttpRequest", "Referer": "https://understat.com/league/Serie_A/2025"}),
                       ("https://understat.com/league/Serie_A/2025", {}), ("https://understat.com/", {})):
        for ua in ("pipeline", "browser"):
            try:
                hd = {**extra, **(H if ua == "browser" else {})}
                r = (requests.get(url, headers=hd, timeout=30) if ua == "browser" else http._session.get(url, headers=extra, timeout=30))
                body = r.text[:300].replace("\n", " ")
                out(f"- {url} [{ua}] → HTTP {r.status_code}, {len(r.content)} byte, tipo {r.headers.get('content-type')}, server {r.headers.get('server')}: `{body[:200]}`")
                if "datesData" in r.text:
                    out("  - contiene datesData")
            except Exception as e:
                out(f"- {url} [{ua}] → errore {type(e).__name__}: {e}")
            time.sleep(2)
    ux = understat.league_matches("Serie_A", 2025)
    check("Understat letto dal programma", bool(ux), f"({len(ux)} partite)")


def lineups_check():
    """Formazioni nel summary ESPN delle nazionali (partite giocate negli ultimi giorni)."""
    out("## Formazioni delle nazionali")
    today = date.today()
    for code in ("uefa.nations", "fifa.friendly", "caf.nations_qual", "concacaf.nations.league", "fifa.worldq.uefa"):
        evs = espn.scoreboard("soccer", code, today - timedelta(days=4), today + timedelta(days=1))
        parsed = [p for p in (espn.parse_event(e) for e in evs) if p]
        done = [p for p in parsed if p["completed"]][:3]
        if not done:
            out(f"- {code}: nessuna partita conclusa negli ultimi giorni ({len(parsed)} in calendario)")
            continue
        for p in done:
            summ = espn.summary("soccer", code, p["id"]) or {}
            ro = summ.get("rosters") or []
            st = [sum(1 for x in (t.get("roster") or []) if x.get("starter")) for t in ro]
            check(f"{code} {p.get('home_name') or p.get('home')} – {p.get('away_name') or p.get('away')}: formazioni", bool(ro) and all(n >= 11 for n in st),
                  f"(squadre {len(ro)}, titolari {st}, moduli {[t.get('formation') for t in ro]})")


def f1_check():
    """Formula 1: Jolpica (storico), OpenF1 (gomme, meteo, giri), Open-Meteo (previsioni), ESPN racing (diretta e quote)."""
    import json
    J = "https://api.jolpi.ca/ergast/f1"
    out("## F1 — Jolpica")
    for path in ("2026.json", "2026/last/results.json", "2026/last/qualifying.json", "2026/driverStandings.json", "2026/constructorStandings.json",
                 "2026/last/sprint.json", "2025/1/pitstops.json?limit=5", "2025/1/laps/1.json", "circuits.json?limit=3"):
        js = http.get_json(f"{J}/{path}", delay=1.0)
        mr = (js or {}).get("MRData") or {}
        tbl = next((v for k, v in mr.items() if k.endswith("Table")), None)
        check(f"Jolpica {path}", bool(js), f"(totale {mr.get('total')}) {json.dumps(tbl, ensure_ascii=False)[:600] if tbl else ''}")
    out("## F1 — OpenF1")
    O = "https://api.openf1.org/v1"
    meet = http.get_json(f"{O}/meetings", {"year": 2026}, delay=1.5) or []
    check("OpenF1 meetings 2026", bool(meet), f"({len(meet)}) ultimo: {json.dumps(meet[-1], ensure_ascii=False)[:400] if meet else ''}")
    ses = http.get_json(f"{O}/sessions", {"year": 2026}, delay=1.5) or []
    races = [s for s in ses if s.get("session_name") == "Race" and s.get("date_end", "") < date.today().isoformat()]
    check("OpenF1 sessions 2026", bool(ses), f"({len(ses)}; gare concluse {len(races)}) es: {json.dumps(races[-1] if races else ses[:1], ensure_ascii=False)[:400]}")
    if races:
        sk = races[-1]["session_key"]
        for ep in ("stints", "weather", "pit", "laps", "position", "race_control", "drivers", "session_result", "starting_grid"):
            js = http.get_json(f"{O}/{ep}", {"session_key": sk}, delay=2.0)
            check(f"OpenF1 {ep}", bool(js), f"({len(js or [])} righe) {json.dumps((js or [None])[0], ensure_ascii=False)[:300]}")
    out("## F1 — Open-Meteo")
    w = http.get_json("https://api.open-meteo.com/v1/forecast", {"latitude": 36.11, "longitude": -115.17, "hourly": "temperature_2m,precipitation_probability,precipitation,wind_speed_10m",
                                                                  "forecast_days": 7, "timezone": "UTC"}, delay=1.0)
    check("Open-Meteo previsioni (Las Vegas)", bool(w and w.get("hourly")), f"{json.dumps((w or {}).get('hourly', {}), ensure_ascii=False)[:300]}")
    out("## F1 — ESPN racing")
    sb = http.get_json("https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard", delay=1.0)
    evs = (sb or {}).get("events") or []
    check("ESPN F1 scoreboard", bool(evs), f"({len(evs)} eventi) {json.dumps(evs[0], ensure_ascii=False)[:1500] if evs else json.dumps(sb, ensure_ascii=False)[:300]}")
    if evs:
        comps = evs[0].get("competitions") or []
        out(f"- sessioni nell'evento: {[(c.get('type', {}).get('abbreviation'), c.get('date'), c.get('status', {}).get('type', {}).get('name')) for c in comps]}")
        c0 = comps[-1] if comps else {}
        out(f"- concorrenti gara (primi 2): {json.dumps((c0.get('competitors') or [])[:2], ensure_ascii=False)[:900]}")
        out(f"- quote: {json.dumps(c0.get('odds'), ensure_ascii=False)[:400]}")
        summ = http.get_json("https://site.api.espn.com/apis/site/v2/sports/racing/f1/summary", {"event": evs[0].get("id")}, delay=1.0)
        out(f"- summary chiavi: {list((summ or {}).keys())}")


def _png_stats(b: bytes) -> str:
    """Quanto è visibile un PNG: pixel non trasparenti e loro luminosità media (senza librerie)."""
    import struct, zlib
    pos, idat, w = 8, b"", 0
    while pos < len(b):
        n, t = struct.unpack(">I4s", b[pos:pos + 8])
        data = b[pos + 8:pos + 8 + n]
        if t == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", data[:10])
        elif t == b"IDAT":
            idat += data
        pos += 12 + n
    if depth != 8 or ctype not in (2, 6):
        return f"formato {depth}/{ctype}"
    bpp = 4 if ctype == 6 else 3
    raw, stride, prev, px = zlib.decompress(idat), w * bpp, bytearray(w * bpp), []
    i = 0
    for _ in range(h):
        f, line = raw[i], bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            up, c = prev[x], prev[x - bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + up) & 255
            elif f == 3: line[x] = (line[x] + (a + up) // 2) & 255
            elif f == 4:
                p = a + up - c; pa, pb, pc = abs(p - a), abs(p - up), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else up if pb <= pc else c)) & 255
        px += [line[j:j + bpp] for j in range(0, stride, bpp)]
        prev = line
    vis = [p for p in px if bpp == 3 or p[3] > 40]
    lum = sum(0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2] for p in vis) / max(1, len(vis))
    return f"{w}x{h}, visibili {len(vis)}/{len(px)}, luminosità media {lum:.0f}/255"


def f1_extra_check():
    """F1: mercati di previsione gratuiti (Polymarket, Kalshi) per vincitore e testa a testa; giri e settori OpenF1; Jolpica 2018."""
    import json
    out("## Logo Serie B (ESPN)")
    js = http.get_json("https://site.api.espn.com/apis/site/v2/sports/soccer/ita.2/scoreboard", delay=1.0) or {}
    lg = (js.get("leagues") or [{}])[0]
    check("Serie B logos", bool(lg.get("logos")), f"id={lg.get('id')} {[(l.get('href'), l.get('rel')) for l in lg.get('logos') or []]}")
    import requests
    for u in ("https://a.espncdn.com/i/leaguelogos/soccer/500/99.png", "https://a.espncdn.com/i/leaguelogos/soccer/500/3931.png",
              "https://a.espncdn.com/i/leaguelogos/soccer/500-dark/99.png", "https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/99.png&w=80&h=80"):
        try:
            r = requests.get(u, timeout=20)
            out(f"- {u}: {r.status_code} {r.headers.get('content-type')} {len(r.content)} byte")
        except Exception as e:
            out(f"- {u}: errore {e}")
    try:
        r = requests.get("https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/99.png&w=80&h=80", timeout=20)
        out(f"- colori del logo 99: {_png_stats(r.content)}")
        r = requests.get("https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/12.png&w=80&h=80", timeout=20)
        out(f"- colori del logo 12 (Serie A, per confronto): {_png_stats(r.content)}")
    except Exception as e:
        out(f"- colori del logo: errore {e}")
    for t in ("Serie B", "Serie B (Italy)"):
        js = http.get_json("https://en.wikipedia.org/w/api.php", {"action": "query", "titles": t, "prop": "pageimages", "piprop": "original", "format": "json"}, delay=1.0) or {}
        out(f"- Wikipedia {t}: {[p.get('original', {}).get('source') for p in (js.get('query') or {}).get('pages', {}).values()]}")
    out("## F1 — Polymarket, tutti i mercati aperti")
    G = "https://gamma-api.polymarket.com"
    allev = []
    for off in (0, 100, 200):
        js = http.get_json(f"{G}/events", {"tag_slug": "f1", "closed": "false", "limit": 100, "offset": off}, delay=1.5)
        if not isinstance(js, list):
            break
        allev += js
        if len(js) < 100:
            break
    for e in allev:
        mk = e.get("markets") or []
        vol = sum(float(m.get("volume") or 0) for m in mk)
        out(f"- {e.get('title')} | fine {str(e.get('endDate'))[:10]} | {len(mk)} mercati | volume {vol:.0f} | es: {(mk[0].get('question') if mk else '')}")
    for path, par in (("public-search", {"q": "Las Vegas Grand Prix"}), ("public-search", {"q": "F1 head to head"}), ("public-search", {"q": "Leclerc Hamilton"}),
                      ("events", {"closed": "false", "limit": 50, "tag_slug": "f1"}), ("events", {"closed": "false", "limit": 50, "tag_slug": "formula1"}),
                      ("events", {"closed": "false", "limit": 50, "tag_slug": "formula-1"})):
        js = http.get_json(f"{G}/{path}", par, delay=1.5)
        evs = js.get("events") if isinstance(js, dict) else js
        evs = evs or []
        check(f"Polymarket {path} {par}", bool(evs), f"({len(evs)}) " + " | ".join(f"{e.get('title')} [{len(e.get('markets') or [])} mercati, chiuso={e.get('closed')}]" for e in evs[:12]))
        for e in evs[:2]:
            for m in (e.get("markets") or [])[:3]:
                out(f"  - {m.get('question')} esiti={m.get('outcomes')} prezzi={m.get('outcomePrices')} volume={m.get('volume')} slug={m.get('slug')}")
    out("## F1 — Kalshi")
    K = "https://api.elections.kalshi.com/trade-api/v2"
    js = http.get_json(f"{K}/series", {"category": "Sports"}, delay=1.5) or {}
    ser = [s for s in js.get("series") or [] if any(w in (s.get("title") or "").lower() for w in ("f1", "formula", "grand prix"))
           or (s.get("ticker") or "").startswith("KXF1")]
    check("Kalshi serie F1", bool(ser), " | ".join(f"{s.get('ticker')}: {s.get('title')}" for s in ser[:40]))
    for s in ser[:14]:
        ev = http.get_json(f"{K}/events", {"series_ticker": s["ticker"], "status": "open", "with_nested_markets": "true"}, delay=1.5) or {}
        for e in (ev.get("events") or [])[:2]:
            out(f"  - {s['ticker']} {e.get('title')}: " + "; ".join(f"{m.get('yes_sub_title') or m.get('subtitle')}={m.get('last_price')}/{m.get('yes_ask')}" for m in (e.get("markets") or [])[:6]))
    out("## F1 — OpenF1 giri e settori")
    O = "https://api.openf1.org/v1"
    ses = http.get_json(f"{O}/sessions", {"year": 2026}, delay=1.5) or []
    done = [s for s in ses if s.get("date_end", "") < date.today().isoformat()]
    last = ses[-8:]
    out(f"- ultime sessioni 2026: {[(s.get('session_key'), s.get('location'), s.get('session_name'), s.get('date_start')) for s in last]}")
    if done:
        q = next((s for s in reversed(done) if s.get("session_name") == "Qualifying"), done[-1])
        laps = http.get_json(f"{O}/laps", {"session_key": q["session_key"]}, delay=2.0) or []
        check(f"OpenF1 laps {q.get('location')} {q.get('session_name')}", bool(laps), f"({len(laps)} righe) {json.dumps(laps[:1], ensure_ascii=False)[:600]}")
        cd = http.get_json(f"{O}/car_data", {"session_key": q["session_key"], "driver_number": 1, "speed>=": 330}, delay=2.0) or []
        check("OpenF1 car_data (velocità >= 330)", bool(cd), f"({len(cd)} righe)")
    out("## F1 — Las Vegas, Prove libere 1 (11413)")
    rc = http.get_json(f"{O}/race_control", {"session_key": 11413}, delay=2.0) or []
    for m in rc[-25:]:
        out(f"  - {str(m.get('date'))[11:19]} {m.get('category')} {m.get('flag')} {m.get('message')}")
    lp = http.get_json(f"{O}/laps", {"session_key": 11413}, delay=2.0) or []
    out(f"- giri: {len(lp)}, con tempo: {sum(1 for l in lp if l.get('lap_duration'))}")
    out("## F1 — Jolpica stagioni vecchie")
    for y in (2018, 2021):
        js = http.get_json(f"https://api.jolpi.ca/ergast/f1/{y}/qualifying.json", {"limit": 5}, delay=1.2)
        check(f"Jolpica {y} qualifiche", bool(js), f"totale {((js or {}).get('MRData') or {}).get('total')}")


def f1_practice_test():
    """Prova sui GP 2026: il passo delle prove libere migliora la previsione della gara? Confronta pesi diversi."""
    import json, math
    from .sources import jolpica, openf1
    from .models import f1 as F
    out("## F1 — prove libere nel pronostico (GP 2026)")
    st = {}
    races = []
    for y in (2023, 2024, 2025, 2026):
        races += [x for x in jolpica.season(y, completed=True, status=st)["races"] if x["results"]]
    bt = json.load(open(config.CACHE / "f1" / "backtest.json")) if (config.CACHE / "f1" / "backtest.json").exists() else {}
    scale, hl = (bt.get("result") or bt).get("scale", 8.0), (bt.get("result") or bt).get("half_life", 5.0)
    ses = openf1.sessions(2026) or []
    budget = [140]
    tests = sorted([x for x in races if x["season"] == 2026], key=lambda x: x["round"])[3:]
    data = []
    for x in tests:
        rd = x["date"]
        loc = None
        near = [s for s in ses if s.get("session_name") in ("Practice 1", "Practice 2", "Practice 3")
                and abs((date.fromisoformat(s["date_start"][:10]) - date.fromisoformat(rd)).days) <= 4]
        rows = []
        code = {y.get("code"): y["id"] for y in x["results"]}
        for s in near:
            js = openf1.laps_summary(s["session_key"], budget, keep=True)
            if js:
                rows.append([{**r, "id": code.get(r.get("code"))} for r in js["rows"]])
        pace = F.practice_pace(rows)
        if pace:
            data.append((x, pace))
    out(f"- GP con le prove: {len(data)} su {len(tests)} (richieste OpenF1 rimaste {budget[0]})")
    if len(data) < 6:
        out("- troppo pochi GP per decidere")
        return
    res = {}
    for w in (0.0, 0.15, 0.3, 0.5, 0.75, 1.0):
        ll = br = 0.0
        for x, pace in data:
            R, team, dnf = F.ratings(races, (x["season"], x["round"]), half_life=hl)
            R = F.practice_adjust(R, pace, w)
            ent = [{"id": y["id"], "team": y["team"]} for y in x["results"]]
            sim = F.simulate(ent, R, team, dnf, {"grid_weight": 0.55, "dnf_factor": 1.0}, scale, sims=4000, with_h2h=False)
            win = {d["id"]: d["win"] for d in sim["drivers"]}
            pod = {d["id"]: d["podium"] for d in sim["drivers"]}
            ll += -math.log(max(win.get(x["results"][0]["id"], 0.001), 0.001))
            top3 = {y["id"] for y in x["results"][:3]}
            br += sum((pod[i] - (1 if i in top3 else 0)) ** 2 for i in pod) / len(pod)
        res[w] = (ll / len(data), br / len(data))
        out(f"- peso {w}: log-loss vincitore {ll / len(data):.3f}, Brier podio {br / len(data):.4f}")
    best = min(res, key=lambda w: res[w][0] + 20 * res[w][1])
    out(f"- **migliore: peso {best}** (senza prove: {res[0.0][0]:.3f} / {res[0.0][1]:.4f})")


def main():
    import sys
    if "f1pratica" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        f1_practice_test()
        _write()
        return
    if "f1extra" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        f1_extra_check()
        _write()
        return
    if "f1" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        f1_check()
        _write()
        return
    if "formazioni" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        lineups_check()
        _write()
        return
    if "xg" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        xg_check()
        _write()
        return
    if "classifiche" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        standings_check()
        _write()
        return
    if "infortuni" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        injuries_check()
        _write()
        return
    if "ht" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        ht_check(["401861146", "401861145"])
        _write()
        return
    if "nazionali" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        national_check()
        _write()
        return
    if "cache" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        cache_check()
        _write()
        return
    if "tennislive" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        tennis_live_check()
        _write()
        return
    if "ricerca" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        research_check()
        _write()
        return
    if "loghi" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        logos_check()
        _write()
        return
    if "live" in sys.argv[1:]:
        logging.basicConfig(level=logging.WARNING)
        live_check()
        _write()
        return
    logging.basicConfig(level=logging.WARNING)
    if "foto" in sys.argv[1:]:
        photos_check()
        _write()
        return
    today = config.today()
    sy = config.soccer_season_start_year(today)
    out(f"# Verifica fonti — {today.isoformat()}\n")

    out("## Calcio")
    fx = footballdata.fixtures()
    check("football-data: prossime partite con quote", bool(fx), f"({len(fx)} righe)")
    for key, lg in SOCCER_LEAGUES.items():
        out(f"\n### {lg['name']}")
        rows = footballdata.season(lg["fd"], config.fd_season_code(sy))
        has_odds = sum(1 for m in rows if m.get("o1x2"))
        has_stats = sum(1 for m in rows if m.get("hc") is not None)
        check("football-data: risultati stagione", bool(rows),
              f"({len(rows)} partite, quote {has_odds}, angoli/tiri {has_stats})")
        xg = understat.league_matches(lg["understat"], sy) if lg.get("understat") else []
        check("Understat: xG per partita", bool(xg), f"({len(xg)} partite)")
        evs = espn.scoreboard("soccer", lg["espn"], today - timedelta(days=10), today + timedelta(days=10))
        parsed = [p for p in (espn.parse_event(e) for e in evs) if p]
        check("ESPN: calendario ±10 giorni", bool(parsed), f"({len(parsed)} partite)")
        done = [p for p in parsed if p["completed"]]
        if done:
            summ = espn.summary("soccer", lg["espn"], done[-1]["id"]) or {}
            pl = espn.soccer_player_lines(summ)
            ts = espn.soccer_team_stats(summ)
            check("ESPN: tabellino giocatori", bool(pl),
                  f"({len(pl)} giocatori; es. {pl[0]['name'] if pl else '-'}: gol {pl[0]['g'] if pl else '-'}, tiri {pl[0]['sh'] if pl else '-'})")
            keys = sorted({k for t in ts.values() for k in t})[:14]
            check("ESPN: statistiche squadra", bool(ts), f"({', '.join(keys)})")
            if summ and not pl:
                out(f"  - chiavi del riepilogo: {', '.join(sorted(summ.keys()))}")
                ro = (summ.get('rosters') or [{}])[0].get('roster') or [{}]
                out(f"  - esempio voce rosa: {str(ro[0])[:400]}")

    out("\n## NBA")
    evs = espn.scoreboard("basketball", "nba", today - timedelta(days=3), today + timedelta(days=3))
    parsed = [p for p in (espn.parse_event(e) for e in evs) if p]
    check("ESPN: calendario ±3 giorni", bool(parsed), f"({len(parsed)} partite)")
    with_odds = [p for p in parsed if (p.get("odds") or {}).get("p_home")]
    check("ESPN: quote nel calendario", bool(with_odds), f"({len(with_odds)} con quote)")
    done = [p for p in parsed if p["completed"]]
    pre = [p for p in parsed if p["state"] == "pre"]
    if done:
        summ = espn.summary("basketball", "nba", done[-1]["id"]) or {}
        pl = espn.nba_player_lines(summ)
        ex = pl[0] if pl else {}
        check("ESPN: tabellino giocatori", bool(pl),
              f"({len(pl)} giocatori; es. {ex.get('name')}: {ex.get('pts')} pt, {ex.get('reb')} rimb, {ex.get('ast')} ast, {ex.get('min')} min)")
    if pre:
        summ = espn.summary("basketball", "nba", pre[0]["id"]) or {}
        inj = espn.injuries(summ)
        pc = espn.pickcenter_odds(summ)
        check("ESPN: infortuni partita in arrivo", bool(inj), f"({sum(len(v) for v in inj.values())} giocatori)")
        check("ESPN: quote partita in arrivo", bool(pc), f"({pc})")

    out("\n## Tennis")
    for tour in ("atp", "wta"):
        evs = espn.scoreboard("tennis", tour, today, today + timedelta(days=3))
        ms = espn.tennis_matches(evs, tour)
        check(f"ESPN {tour.upper()}: incontri", bool(ms),
              f"({len(ms)} incontri, {sum(1 for m in ms if m['state'] == 'pre')} in programma; tornei: {', '.join(sorted({m['tournament'] for m in ms})[:4])})")
        old = espn.tennis_matches(espn.scoreboard("tennis", tour, today - timedelta(days=200)), tour)
        rows = [r for r in (espn.tennis_result_row(m, tour, "Hard") for m in old) if r]
        check(f"ESPN {tour.upper()}: storico (200 giorni fa)", bool(rows), f"({len(rows)} incontri conclusi)")

    out("")
    photos_check()
    _write()


def _write():
    path = ROOT / "report" / "fonti.md"
    path.parent.mkdir(exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
