"""Verifica delle fonti: controlla cosa restituisce davvero ogni fonte e scrive report/fonti.md.
Uso: python -m pipeline.check_sources"""
import logging
import os
from datetime import timedelta

from . import config
from .config import ROOT, SOCCER_LEAGUES
from .sources import espn, footballdata, understat, tennisdata

lines: list[str] = []


def out(s=""):
    print(s)
    lines.append(s)


def check(label, ok, detail=""):
    out(f"- {'✅' if ok else '❌'} **{label}** {detail}")
    return ok


def main():
    logging.basicConfig(level=logging.WARNING)
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
        xg = understat.league_matches(lg["understat"], sy)
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
        rows = tennisdata.year(tour, today.year)
        check(f"tennis-data {tour.upper()} {today.year}", bool(rows),
              f"({len(rows)} incontri; ultimo {rows[-1]['date'] if rows else '-'}; quote {sum(1 for x in rows if x.get('ow'))})")
        evs = espn.scoreboard("tennis", tour, today, today + timedelta(days=3))
        ms = espn.tennis_matches(evs)
        check(f"ESPN {tour.upper()}: incontri", bool(ms),
              f"({len(ms)} incontri, {sum(1 for m in ms if m['state'] == 'pre')} in programma; tornei: {', '.join(sorted({m['tournament'] for m in ms})[:4])})")

    path = ROOT / "report" / "fonti.md"
    path.parent.mkdir(exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
