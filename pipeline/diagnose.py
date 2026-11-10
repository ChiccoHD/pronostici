"""Diagnostica di rete: prova varianti di richiesta per ogni fonte e registra la risposta grezza.
Uso: python -m pipeline.diagnose  (scrive report/diagnostica.md)"""
import os
from datetime import timedelta

import requests

from . import config
from .config import ROOT

UA_BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
UA_APP = "Mozilla/5.0 (compatible; pronostici-personale/1.0)"


def probe(label, url, params=None, ua=UA_APP, extra=None):
    h = {"User-Agent": ua, "Accept": "application/json, text/html;q=0.9, */*;q=0.8"}
    h.update(extra or {})
    try:
        r = requests.get(url, params=params, headers=h, timeout=25, allow_redirects=True)
        body = r.content[:220]
        try:
            body = body.decode("utf-8", "replace")
        except Exception:
            body = repr(body)
        body = " ".join(body.split())
        hist = " → ".join(str(x.status_code) for x in r.history)
        return (f"| {label} | {r.status_code}{' (via ' + hist + ')' if hist else ''} | "
                f"{r.headers.get('content-type', '')[:40]} | {len(r.content)} | `{body[:160].replace('|', '/')}` | {r.url[:90]} |")
    except Exception as e:
        return f"| {label} | ERRORE | | | `{type(e).__name__}: {str(e)[:150]}` | {url[:90]} |"


def samples(t):
    """Salva risposte reali complete (compresse) per scrivere i lettori sui dati veri."""
    import gzip
    import re
    folder = ROOT / "report" / "campioni"
    folder.mkdir(parents=True, exist_ok=True)
    E = "https://site.api.espn.com/apis/site/v2/sports"
    h = {"User-Agent": UA_BROWSER, "Accept": "application/json, text/plain, */*"}
    got = []

    def keep(name, url, params=None, headers=None):
        try:
            r = requests.get(url, params=params, headers={**h, **(headers or {})}, timeout=30)
            with gzip.open(folder / f"{name}.gz", "wb") as f:
                f.write(r.content)
            got.append(f"- {name}: {r.status_code}, {len(r.content)} byte")
            return r
        except Exception as e:
            got.append(f"- {name}: ERRORE {e}")
            return None

    yday = (t - timedelta(days=1)).strftime("%Y%m%d")
    r = keep("espn_tennis_atp_ieri", f"{E}/tennis/atp/scoreboard", {"dates": yday})
    keep("espn_tennis_atp_oggi", f"{E}/tennis/atp/scoreboard", {"dates": t.strftime("%Y%m%d")})
    keep("espn_tennis_wta_ieri", f"{E}/tennis/wta/scoreboard", {"dates": yday})
    keep("espn_tennis_atp_giugno", f"{E}/tennis/atp/scoreboard", {"dates": f"{t.year}0703"})
    for back in range(1, 5):
        d = (t - timedelta(days=back)).strftime("%Y%m%d")
        r = keep(f"espn_seriea_{back}", f"{E}/soccer/ita.1/scoreboard", {"dates": d})
        try:
            evs = r.json().get("events", [])
        except Exception:
            evs = []
        if evs:
            keep("espn_seriea_summary", f"{E}/soccer/ita.1/summary", {"event": evs[0]["id"]})
            break
    r = keep("espn_nba_ieri", f"{E}/basketball/nba/scoreboard", {"dates": yday})
    try:
        evs = r.json().get("events", [])
        if evs:
            keep("espn_nba_summary_giocata", f"{E}/basketball/nba/summary", {"event": evs[0]["id"]})
    except Exception:
        pass
    r = keep("espn_nba_domani", f"{E}/basketball/nba/scoreboard", {"dates": (t + timedelta(days=1)).strftime("%Y%m%d")})
    try:
        evs = r.json().get("events", [])
        if evs:
            keep("espn_nba_summary_futura", f"{E}/basketball/nba/summary", {"event": evs[0]["id"]})
    except Exception:
        pass
    sy = config.soccer_season_start_year(t)
    xhr = {"X-Requested-With": "XMLHttpRequest", "Referer": f"https://understat.com/league/Serie_A/{sy}"}
    keep("understat_api_xhr", f"https://understat.com/getLeagueData/Serie_A/{sy}", headers=xhr)
    page = keep("understat_pagina", f"https://understat.com/league/Serie_A/{sy}")
    if page is not None:
        for js in re.findall(r'src="([^"]+\.js[^"]*)"', page.text)[:6]:
            url = js if js.startswith("http") else "https://understat.com" + ("" if js.startswith("/") else "/") + js
            keep("understat_js_" + re.sub(r"[^a-z0-9]", "_", js.lower())[-40:], url)
    keep("tennisdata_referer", f"http://www.tennis-data.co.uk/{t.year}/{t.year}.xlsx",
         headers={"Referer": "http://www.tennis-data.co.uk/alldata.php"})
    return got


def main():
    t = config.today()
    d = t.strftime("%Y%m%d")
    rng = f"{(t - timedelta(days=3)).strftime('%Y%m%d')}-{(t + timedelta(days=3)).strftime('%Y%m%d')}"
    sy = config.soccer_season_start_year(t)
    E = "https://site.api.espn.com/apis/site/v2/sports"
    rows = [
        ("ESPN NBA senza parametri", f"{E}/basketball/nba/scoreboard", None, UA_APP),
        ("ESPN NBA data singola", f"{E}/basketball/nba/scoreboard", {"dates": d}, UA_APP),
        ("ESPN NBA intervallo + limit", f"{E}/basketball/nba/scoreboard", {"dates": rng, "limit": 1000}, UA_APP),
        ("ESPN NBA intervallo, UA browser", f"{E}/basketball/nba/scoreboard", {"dates": rng}, UA_BROWSER),
        ("ESPN Serie A senza parametri", f"{E}/soccer/ita.1/scoreboard", None, UA_APP),
        ("ESPN Serie A intervallo", f"{E}/soccer/ita.1/scoreboard", {"dates": rng}, UA_BROWSER),
        ("ESPN tennis ATP", f"{E}/tennis/atp/scoreboard", None, UA_BROWSER),
        ("ESPN core API NBA", "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events", {"dates": d}, UA_BROWSER),
        ("ESPN cdn NBA", "https://cdn.espn.com/core/nba/scoreboard", {"xhr": 1}, UA_BROWSER),
        ("Understat pagina", f"https://understat.com/league/Serie_A/{sy}", None, UA_BROWSER),
        ("Understat API", f"https://understat.com/getLeagueData/Serie_A/{sy}", None, UA_BROWSER),
        ("tennis-data http xlsx", f"http://www.tennis-data.co.uk/{t.year}/{t.year}.xlsx", None, UA_BROWSER),
        ("tennis-data https xlsx", f"https://www.tennis-data.co.uk/{t.year}/{t.year}.xlsx", None, UA_BROWSER),
        ("tennis-data indice", "http://www.tennis-data.co.uk/alldata.php", None, UA_BROWSER),
        ("tennis-data anno precedente", f"http://www.tennis-data.co.uk/{t.year - 1}/{t.year - 1}.xlsx", None, UA_BROWSER),
        ("Sackmann ATP (GitHub)", f"https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_{t.year}.csv", None, UA_APP),
        ("Sackmann ATP anno prec.", f"https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_{t.year - 1}.csv", None, UA_APP),
        ("NBA cdn calendario", "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json", None, UA_BROWSER),
        ("NBA cdn scoreboard oggi", "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json", None, UA_BROWSER),
        ("football-data fixtures", "https://www.football-data.co.uk/fixtures.csv", None, UA_APP),
        ("ClubElo classifica oggi", f"http://api.clubelo.com/{t.isoformat()}", None, UA_APP),
        ("ClubElo partite in arrivo", "http://api.clubelo.com/Fixtures", None, UA_APP),
        ("football-data Portogallo", f"https://www.football-data.co.uk/mmz4281/{config.fd_season_code(sy)}/P1.csv", None, UA_APP),
        ("football-data Giappone", "https://www.football-data.co.uk/new/JPN.csv", None, UA_APP),
        ("football-data MLS", "https://www.football-data.co.uk/new/USA.csv", None, UA_APP),
        ("football-data Norvegia", "https://www.football-data.co.uk/new/NOR.csv", None, UA_APP),
        ("ESPN Champions League", f"{E}/soccer/uefa.champions/scoreboard", {"dates": d}, UA_APP),
        ("ESPN Europa League", f"{E}/soccer/uefa.europa/scoreboard", None, UA_APP),
        ("ESPN Conference League", f"{E}/soccer/uefa.europa.conf/scoreboard", None, UA_APP),
        ("ESPN Champions femminile", f"{E}/soccer/uefa.wchampions/scoreboard", None, UA_APP),
        ("ESPN Portogallo", f"{E}/soccer/por.1/scoreboard", None, UA_APP),
        ("ESPN Giappone", f"{E}/soccer/jpn.1/scoreboard", None, UA_APP),
        ("ESPN MLS", f"{E}/soccer/usa.1/scoreboard", None, UA_APP),
        ("ESPN Norvegia", f"{E}/soccer/nor.1/scoreboard", None, UA_APP),
    ]
    out = [f"# Diagnostica rete — {t.isoformat()}", "",
           "| Prova | Stato | Tipo | Byte | Inizio risposta | URL finale |", "|---|---|---|---|---|---|"]
    for label, url, params, ua in rows:
        line = probe(label, url, params, ua)
        print(line)
        out.append(line)
    if os.environ.get("CAMPIONI"):
        out += ["", "## Campioni salvati in report/campioni", *samples(t)]
    path = ROOT / "report" / "diagnostica.md"
    path.parent.mkdir(exist_ok=True)
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    s = os.environ.get("GITHUB_STEP_SUMMARY")
    if s:
        with open(s, "a", encoding="utf-8") as f:
            f.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
