"""Come può finire il campionato e le prossime partite di ogni squadra.

- `simulate`: gioca 10.000 volte le partite che mancano (andata e ritorno: ogni coppia casa/fuori non ancora giocata in
  stagione) col modello del campionato e conta quante volte ogni squadra vince il titolo, finisce nelle zone europee o
  retrocede. Solo per i campionati a girone doppio semplice (niente MLS, Argentina, Scozia, Belgio, A-League).
- `next5`: le prossime 5 partite di ogni squadra in tutte le competizioni (calendario ESPN già scaricato per il
  turnover, `data/cache/soccer/rotation.json`), con la difficoltà dal modello quando l'avversario è dello stesso campionato.
Sono stime: dipendono dal modello e dal calendario, non dai criteri di parità ufficiali."""
from datetime import datetime, timezone

import numpy as np

from . import store
from .config import CACHE
from .models import soccer as S

SIMS = 10000
SKIP = {"mls", "argentina", "scozia", "belgio", "a-league"}   # play-off o fasi finali: la sola stagione regolare non basta
# zone: (etichetta, ultima posizione) dall'alto; "rel" = quante retrocedono (dirette)
ZONES = {
    "serie-a": {"top": [("Scudetto", 1), ("Champions", 4)], "rel": 3},
    "premier-league": {"top": [("Titolo", 1), ("Champions", 4)], "rel": 3},
    "la-liga": {"top": [("Titolo", 1), ("Champions", 4)], "rel": 3},
    "bundesliga": {"top": [("Titolo", 1), ("Champions", 4)], "rel": 2},
    "ligue-1": {"top": [("Titolo", 1), ("Champions", 3)], "rel": 2},
    "serie-b": {"top": [("Primo posto", 1), ("Promozione diretta", 2)], "rel": 3},
    "championship": {"top": [("Primo posto", 1), ("Promozione diretta", 2)], "rel": 3},
    "eredivisie": {"top": [("Titolo", 1), ("Champions", 2)], "rel": 2},
    "super-lig": {"top": [("Titolo", 1), ("Champions", 2)], "rel": 4},
    "primeira-liga": {"top": [("Titolo", 1), ("Champions", 2)], "rel": 2},
    "eliteserien": {"top": [("Titolo", 1), ("Europa", 3)], "rel": 2},
    "j1": {"top": [("Titolo", 1), ("Champions asiatica", 3)], "rel": 3},
    "brasileirao": {"top": [("Titolo", 1), ("Libertadores", 4)], "rel": 4},
}


def simulate(key: str, table: list[dict], matches: list[dict], season_from: str, ratings):
    """table: righe con fd, pts, gd, gf. Restituisce {fd: {title, top, rel, xpts, xpos}} e le etichette, o None."""
    z = ZONES.get(key)
    if key in SKIP or not z or len(table) < 8:
        return None
    teams = [r["fd"] for r in table]
    n = len(teams)
    ix = {t: i for i, t in enumerate(teams)}
    played = {(m["home"], m["away"]) for m in matches if m["date"] >= season_from and m["home"] in ix and m["away"] in ix}
    if max(r["p"] for r in table) > 2 * (n - 1):
        return None                              # formato diverso dall'andata e ritorno
    left = [(h, a) for h in teams for a in teams if h != a and (h, a) not in played]
    if not left:
        return None
    rng = np.random.default_rng(11)
    pts = np.tile(np.array([r["pts"] for r in table], float), (SIMS, 1))
    gd = np.tile(np.array([r["gd"] for r in table], float), (SIMS, 1))
    gf = np.tile(np.array([r["gf"] for r in table], float), (SIMS, 1))
    for h, a in left:
        lh, la = ratings.lambdas(h, a)
        g1, g2 = rng.poisson(lh, SIMS), rng.poisson(la, SIMS)
        i, j = ix[h], ix[a]
        pts[:, i] += np.where(g1 > g2, 3, np.where(g1 == g2, 1, 0)); pts[:, j] += np.where(g2 > g1, 3, np.where(g1 == g2, 1, 0))
        gd[:, i] += g1 - g2; gd[:, j] += g2 - g1; gf[:, i] += g1; gf[:, j] += g2
    score = pts * 1e6 + gd * 1e3 + gf + rng.random(pts.shape)
    rank = (-score).argsort(1).argsort(1) + 1
    (l1, c1), (l2, c2) = z["top"]
    out = {}
    for t, i in ix.items():
        r = rank[:, i]
        out[t] = {"title": round(float((r <= c1).mean()), 3), "top": round(float((r <= c2).mean()), 3),
                  "rel": round(float((r > n - z["rel"]).mean()), 3), "xpts": round(float(pts[:, i].mean()), 1),
                  "xpos": round(float(r.mean()), 1)}
    return {"teams": out, "labels": [l1, l2, "Retrocessione"], "cut": [c1, c2, n - z["rel"]], "left": len(left)}


# ------------------------------------------------------------------ prossime 5
COMP_SHORT = {"uefa.champions": "Champions", "uefa.europa": "Europa L.", "uefa.europa.conf": "Conference", "ita.coppa_italia": "Coppa Italia",
              "esp.copa_del_rey": "Copa del Rey", "eng.fa": "FA Cup", "eng.league_cup": "Carabao", "ger.dfb_pokal": "Coppa",
              "fra.coupe_de_france": "Coppa", "conmebol.libertadores": "Libertadores", "conmebol.sudamericana": "Sudamericana",
              "bra.copa_do_brazil": "Coppa", "arg.copa": "Coppa", "fifa.cwc": "Mondiale club"}


def next5(teams_info: dict, league_code: str, ratings):
    """teams_info: {id ESPN: {abbr, short, fd}}. Restituisce {id: [[data, avversario, casa?, competizione, p_vittoria|None, sigla]]}."""
    mem = store.load(CACHE / "soccer" / "rotation.json", {}) or {}
    by_abbr = {(v.get("abbr") or "").upper(): v for v in teams_info.values() if v.get("abbr")}
    now = datetime.now(timezone.utc).isoformat()
    out = {}
    for tid, me in teams_info.items():
        evs = (mem.get(str(tid)) or {}).get("e") or []
        rows = []
        for e in sorted(evs, key=lambda x: x["d"] or ""):
            if not e.get("d") or e["d"] < now[:16]:
                continue
            nm = e.get("n") or ""
            if " @ " not in nm:
                continue
            away_ab, home_ab = [x.strip().upper() for x in nm.split(" @ ", 1)]
            ab = (me.get("abbr") or "").upper()
            home = home_ab == ab
            opp_ab = away_ab if home else home_ab
            opp = by_abbr.get(opp_ab)
            same = e.get("lg") == league_code
            p = None
            if same and opp and me.get("fd") and opp.get("fd"):
                try:
                    lh, la = ratings.lambdas(me["fd"], opp["fd"]) if home else ratings.lambdas(opp["fd"], me["fd"])
                    p1, _, p2 = S.p1x2(S.score_matrix(lh, la))
                    p = round(float(p1 if home else p2), 3)
                except Exception:
                    p = None
            lgc = e.get("lg") or ""
            comp = "" if same else COMP_SHORT.get(lgc) or ("Supercoppa" if "super" in lgc else "Coppa")
            rows.append([e["d"], (opp or {}).get("short") or opp_ab, home, comp, p, opp_ab])
            if len(rows) == 5:
                break
        if rows:
            out[str(tid)] = rows
    return out
