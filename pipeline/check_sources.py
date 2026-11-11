"""Verifica delle fonti: controlla cosa restituisce davvero ogni fonte e scrive report/fonti.md.
Uso: python -m pipeline.check_sources"""
import logging
import os
from datetime import timedelta

from . import config
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


def main():
    import sys
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
