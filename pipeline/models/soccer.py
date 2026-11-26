"""Modello calcio: forza d'attacco e difesa di ogni squadra (Poisson con correzione Dixon-Coles),
pesando di più le partite recenti e usando gli xG quando disponibili."""
import math
from collections import defaultdict
from datetime import date

import numpy as np

from .common import poisson_pmf, negbin_sf, devig, r, Scorer

# Parametri scelti rifacendo le previsioni settimana per settimana su 12 campionati
# (stagione 2025-26 per scegliere, 2026-27 per controllare): vedi report/taratura.md
HALF_LIFE_DAYS = 200     # una partita di 200 giorni fa pesa la metà di una di oggi
PRIOR = 4.0              # quanto "tirare" verso la media le squadre con pochi dati
RHO = -0.11              # correzione per i punteggi bassi (0-0, 1-0, 0-1, 1-1)
W_XG = 0.67              # peso degli xG (i gol reali pesano 1)
W_SOT = 1.0              # peso dei tiri in porta, convertiti in gol con la media del campionato
XG_WEIGHT = W_XG / (1 + W_XG)   # (compatibilità: vecchio peso relativo degli xG)
NEW_TEAM = (0.85, 1.15)  # attacco/difesa iniziali per squadre senza storico (neopromosse)
KMAX = 10


class Ratings:
    def __init__(self, teams, att, dfn, home, base):
        self.idx = {t: i for i, t in enumerate(teams)}
        self.att, self.dfn, self.home, self.base = att, dfn, home, base

    def _ad(self, team):
        i = self.idx.get(team)
        return (self.att[i], self.dfn[i]) if i is not None else NEW_TEAM

    def lambdas(self, home: str, away: str) -> tuple[float, float]:
        ah, dh = self._ad(home)
        aa, da = self._ad(away)
        return self.base * self.home * ah * da, self.base * aa * dh

    def table(self) -> dict:
        return {t: {"att": r(self.att[i], 3), "def": r(self.dfn[i], 3)} for t, i in self.idx.items()}


def _target(m, conv=None):
    """Quanto ha "meritato" di segnare ogni squadra: gol reali, xG e tiri in porta (se ci sono), mescolati.
    I tiri in porta dicono quante occasioni vere crea una squadra anche quando non segna."""
    parts = [(1.0, m["hg"], m["ag"])]
    if m.get("hxg") is not None and m.get("axg") is not None:
        parts.append((W_XG, m["hxg"], m["axg"]))
    if conv and m.get("hst") is not None and m.get("ast") is not None:
        parts.append((W_SOT, m["hst"] * conv, m["ast"] * conv))
    tw = sum(p[0] for p in parts)
    return sum(p[0] * p[1] for p in parts) / tw, sum(p[0] * p[2] for p in parts) / tw


def sot_conversion(matches: list[dict]) -> float | None:
    """Gol per tiro in porta, in media (per trasformare i tiri in porta in gol)."""
    g = s = 0.0
    for m in matches:
        if m.get("hst") is not None and m.get("ast") is not None:
            g += m["hg"] + m["ag"]
            s += m["hst"] + m["ast"]
    return g / s if s > 50 else None


def fit(matches: list[dict], as_of: date, iters: int = 80, prior: dict | None = None) -> Ratings | None:
    """prior: {squadra: livello} per le squadre senza storico di campionato; il voto parte da lì
    (attacco = livello, difesa = 1/livello) invece che dalla media."""
    hist = [m for m in matches if m["date"] < as_of.isoformat()]
    if len(hist) < 30:
        return None
    teams = sorted({m["home"] for m in hist} | {m["away"] for m in hist})
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    hi = np.array([idx[m["home"]] for m in hist])
    ai = np.array([idx[m["away"]] for m in hist])
    conv = sot_conversion(hist)
    ys = np.array([_target(m, conv) for m in hist], dtype=float)
    yh, ya = ys[:, 0], ys[:, 1]
    age = np.array([(as_of - date.fromisoformat(m["date"])).days for m in hist], dtype=float)
    w = np.exp(-math.log(2) * age / HALF_LIFE_DAYS)

    A, D = np.ones(n), np.ones(n)
    H = 1.25
    base = (w * (yh + ya)).sum() / (2 * w.sum()) / math.sqrt(H)
    k = PRIOR
    lv = np.array([(prior or {}).get(t, 1.0) for t in teams])
    for _ in range(iters):
        num = np.bincount(hi, w * yh, n) + np.bincount(ai, w * ya, n) + k * lv
        den = np.bincount(hi, w * base * H * D[ai], n) + np.bincount(ai, w * base * D[hi], n) + k
        A = num / den
        num = np.bincount(ai, w * yh, n) + np.bincount(hi, w * ya, n) + k / lv
        den = np.bincount(ai, w * base * H * A[hi], n) + np.bincount(hi, w * base * A[ai], n) + k
        D = num / den
        H = (w * yh).sum() / (w * base * A[hi] * D[ai]).sum()
        base = (w * (yh + ya)).sum() / (w * (H * A[hi] * D[ai] + A[ai] * D[hi])).sum()
        ga, gd = math.exp(np.log(A).mean()), math.exp(np.log(D).mean())
        A, D, base = A / ga, D / gd, base * ga * gd
    return Ratings(teams, A, D, H, base)


def score_matrix(lh: float, la: float, rho: float = RHO) -> np.ndarray:
    M = np.outer(poisson_pmf(lh, KMAX), poisson_pmf(la, KMAX))
    # Dixon-Coles
    M[0, 0] *= max(1 - lh * la * rho, 0)
    M[0, 1] *= 1 + lh * rho
    M[1, 0] *= 1 + la * rho
    M[1, 1] *= max(1 - rho, 0)
    return M / M.sum()


def p1x2(M):
    return float(np.tril(M, -1).sum()), float(np.trace(M)), float(np.triu(M, 1).sum())


def markets(lh: float, la: float, ht_share: float = 0.45) -> dict:
    M = score_matrix(lh, la)
    ph, pd, pa = p1x2(M)
    i, j = np.indices(M.shape)
    tot = i + j
    out = {
        "xg": [r(lh, 2), r(la, 2)],
        "1x2": [r(ph), r(pd), r(pa)],
        "dc": {"1X": r(ph + pd), "X2": r(pd + pa), "12": r(ph + pa)},
        "dnb": {"home": r(ph / (ph + pa)), "away": r(pa / (ph + pa))},     # draw no bet: col pareggio si è rimborsati
        "ou": {f"{l}": r(M[tot > l].sum()) for l in (0.5, 1.5, 2.5, 3.5, 4.5, 5.5)},
        "btts": r(M[1:, 1:].sum()),
        "multigol": {f"{a}-{b}": r(M[(tot >= a) & (tot <= b)].sum())
                     for a, b in ((0, 1), (1, 2), (1, 3), (2, 3), (2, 4), (3, 5), (4, 6))},
        # multigol per squadra: gol di casa / dell'ospite in un intervallo
        "multigol_team": {
            "home": {f"{a}-{b}": r(M[(i >= a) & (i <= b)].sum()) for a, b in ((0, 1), (1, 2), (1, 3), (2, 3), (2, 4))},
            "away": {f"{a}-{b}": r(M[(j >= a) & (j <= b)].sum()) for a, b in ((0, 1), (1, 2), (1, 3), (2, 3), (2, 4))},
        },
        "team_ou": {
            "home": {f"{l}": r(M[i > l].sum()) for l in (0.5, 1.5, 2.5)},
            "away": {f"{l}": r(M[j > l].sum()) for l in (0.5, 1.5, 2.5)},
        },
        "clean_sheet": [r(M[:, 0].sum()), r(M[0, :].sum())],
    }
    over25, btts = tot > 2.5, (i > 0) & (j > 0)
    hw, dr, aw = i > j, i == j, i < j
    out["combo"] = {
        "1 + Over 2,5": r(M[hw & over25].sum()), "1 + Under 2,5": r(M[hw & ~over25].sum()),
        "X + Under 2,5": r(M[dr & ~over25].sum()), "X + Over 2,5": r(M[dr & over25].sum()),
        "2 + Over 2,5": r(M[aw & over25].sum()), "2 + Under 2,5": r(M[aw & ~over25].sum()),
        "1 + Goal": r(M[hw & btts].sum()), "2 + Goal": r(M[aw & btts].sum()),
        "Goal + Over 2,5": r(M[btts & over25].sum()), "No Goal + Under 2,5": r(M[~btts & ~over25].sum()),
    }
    flat = sorted(((M[a, b], a, b) for a in range(7) for b in range(7)), reverse=True)[:10]
    out["exact"] = [{"score": f"{a}-{b}", "p": r(p)} for p, a, b in flat]
    # Primo tempo: frazione dei gol segnati prima dell'intervallo
    Mh = score_matrix(lh * ht_share, la * ht_share, rho=0)
    h1, d1, a1 = p1x2(Mh)
    ih, jh = np.indices(Mh.shape)
    out["ht"] = {"1x2": [r(h1), r(d1), r(a1)],
                 "ou": {f"{l}": r(Mh[(ih + jh) > l].sum()) for l in (0.5, 1.5)}}
    return out


def count_market(mean_home: float, mean_away: float, lines, disp: float = 1.25) -> dict:
    """Angoli o cartellini: somma delle due squadre con una binomiale negativa."""
    mt = mean_home + mean_away
    var = mt * disp
    return {"exp": [r(mean_home, 2), r(mean_away, 2), r(mt, 2)],
            "ou": {f"{l}": r(negbin_sf(mt, var, int(math.floor(l)) + 1)) for l in lines}}


# --------------------------------------------------------------- statistiche descrittive

def _res(gf, ga):
    return "V" if gf > ga else ("N" if gf == ga else "P")


def team_games(matches: list[dict], team: str) -> list[dict]:
    """Partite giocate da una squadra, dalla più recente."""
    out = []
    for m in matches:
        if m["home"] == team or m["away"] == team:
            home = m["home"] == team
            g = {
                "date": m["date"], "home": home, "opp": m["away"] if home else m["home"],
                "gf": m["hg"] if home else m["ag"], "ga": m["ag"] if home else m["hg"],
            }
            for key_f, key_a, name in (("hc", "ac", "corners"), ("hy", "ay", "yellow"),
                                       ("hs", "as", "shots"), ("hst", "ast", "sot"),
                                       ("hxg", "axg", "xg"), ("hr", "ar", "red"), ("hf", "af", "fouls")):
                vf, va = m.get(key_f), m.get(key_a)
                if vf is not None and va is not None:
                    g[name + "_f"], g[name + "_a"] = (vf, va) if home else (va, vf)
            g["res"] = _res(g["gf"], g["ga"])
            out.append(g)
    return sorted(out, key=lambda x: x["date"], reverse=True)


def _avg(games, key):
    vals = [g[key] for g in games if g.get(key) is not None]
    return r(sum(vals) / len(vals), 2) if vals else None


def form_block(games: list[dict], n: int) -> dict:
    g = games[:n]
    if not g:
        return {"n": 0}
    pts = sum(3 if x["res"] == "V" else 1 if x["res"] == "N" else 0 for x in g)
    tot = [x["gf"] + x["ga"] for x in g]
    return {
        "n": len(g),
        "seq": [x["res"] for x in g],
        "w": sum(x["res"] == "V" for x in g), "d": sum(x["res"] == "N" for x in g),
        "l": sum(x["res"] == "P" for x in g), "pts": pts,
        "gf": _avg(g, "gf"), "ga": _avg(g, "ga"),
        "over25": r(sum(t > 2.5 for t in tot) / len(g), 2),
        "btts": r(sum(x["gf"] > 0 and x["ga"] > 0 for x in g) / len(g), 2),
        "clean": r(sum(x["ga"] == 0 for x in g) / len(g), 2),
        "fail": r(sum(x["gf"] == 0 for x in g) / len(g), 2),
        "corners_f": _avg(g, "corners_f"), "corners_a": _avg(g, "corners_a"),
        "yellow_f": _avg(g, "yellow_f"), "shots_f": _avg(g, "shots_f"), "sot_f": _avg(g, "sot_f"),
        "xg_f": _avg(g, "xg_f"), "xg_a": _avg(g, "xg_a"),
    }


def team_summary(matches: list[dict], team: str, season_from: str) -> dict:
    games = team_games(matches, team)
    season = [g for g in games if g["date"] >= season_from]
    return {
        "last": [{"date": g["date"], "opp": g["opp"], "home": g["home"], "gf": int(g["gf"]),
                  "ga": int(g["ga"]), "res": g["res"]} for g in games[:15]],
        "form5": form_block(games, 5), "form10": form_block(games, 10), "form15": form_block(games, 15),
        "home_season": form_block([g for g in season if g["home"]], 50),
        "away_season": form_block([g for g in season if not g["home"]], 50),
        "season": form_block(season, 50),
    }


def h2h(matches: list[dict], a: str, b: str, n: int = 10) -> dict:
    ms = sorted([m for m in matches if {m["home"], m["away"]} == {a, b}], key=lambda m: m["date"], reverse=True)[:n]
    wa = sum(1 for m in ms if (m["home"] == a and m["hg"] > m["ag"]) or (m["away"] == a and m["ag"] > m["hg"]))
    wb = sum(1 for m in ms if (m["home"] == b and m["hg"] > m["ag"]) or (m["away"] == b and m["ag"] > m["hg"]))
    return {
        "n": len(ms), "a": wa, "d": len(ms) - wa - wb, "b": wb,
        "over25": r(sum(m["hg"] + m["ag"] > 2.5 for m in ms) / len(ms), 2) if ms else None,
        "btts": r(sum(m["hg"] > 0 and m["ag"] > 0 for m in ms) / len(ms), 2) if ms else None,
        "games": [{"date": m["date"], "home": m["home"], "away": m["away"],
                   "hg": int(m["hg"]), "ag": int(m["ag"])} for m in ms],
    }


def standings(matches: list[dict], season_from: str) -> list[dict]:
    tab = defaultdict(lambda: {"p": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0, "pts": 0})
    for m in matches:
        if m["date"] < season_from:
            continue
        for team, gf, ga in ((m["home"], m["hg"], m["ag"]), (m["away"], m["ag"], m["hg"])):
            t = tab[team]
            t["p"] += 1
            t["gf"] += int(gf)
            t["ga"] += int(ga)
            if gf > ga:
                t["w"] += 1
                t["pts"] += 3
            elif gf == ga:
                t["d"] += 1
                t["pts"] += 1
            else:
                t["l"] += 1
    rows = [{"team": k, **v, "gd": v["gf"] - v["ga"]} for k, v in tab.items()]
    rows.sort(key=lambda x: (-x["pts"], -x["gd"], -x["gf"], x["team"]))
    for i, x in enumerate(rows, 1):
        x["pos"] = i
    return rows


def count_rates(matches: list[dict], as_of: date, team: str, key_f: str, key_a: str, n: int = 12):
    """Media pesata di un conteggio (angoli, cartellini) fatto e subito da una squadra."""
    games = [g for g in team_games([m for m in matches if m["date"] < as_of.isoformat()], team)
             if g.get(key_f) is not None][:n]
    if len(games) < 3:
        return None, None
    wts = [0.92 ** i for i in range(len(games))]
    f = sum(w * g[key_f] for w, g in zip(wts, games)) / sum(wts)
    a = sum(w * g[key_a] for w, g in zip(wts, games)) / sum(wts)
    return f, a


def league_avg(matches: list[dict], key_h: str, key_a: str):
    vals = [(m[key_h], m[key_a]) for m in matches[-400:] if m.get(key_h) is not None and m.get(key_a) is not None]
    if not vals:
        return None, None
    return sum(v[0] for v in vals) / len(vals), sum(v[1] for v in vals) / len(vals)


def side_counts(matches, as_of, home, away, kh, ka, gf_name, ga_name):
    """Attesi per squadra = media lega * (forza fatta) * (concessa dall'avversario)."""
    lh, la = league_avg(matches, kh, ka)
    if lh is None:
        return None
    hf, ha = count_rates(matches, as_of, home, gf_name, ga_name)
    af, aa = count_rates(matches, as_of, away, gf_name, ga_name)
    lm = (lh + la) / 2
    if hf is None or af is None:
        return lh, la
    eh = lh * (hf / lm) ** 0.75 * (aa / lm) ** 0.5
    ea = la * (af / lm) ** 0.75 * (ha / lm) ** 0.5
    return eh, ea


def ht_share(matches: list[dict]) -> float:
    rows = [m for m in matches[-600:] if m.get("hhg") is not None]
    ft = sum(m["hg"] + m["ag"] for m in rows)
    ht = sum(m["hhg"] + m["hag"] for m in rows)
    return ht / ft if ft > 50 else 0.45


# --------------------------------------------------------------- giocatori

def player_markets(lines: list[dict], team_id: str, lam_team: float, team_avg_goals: float,
                   last_event_ids: list[str]) -> list[dict]:
    """Probabilità per giocatore: segna, assist, almeno un tiro in porta, ammonizione.
    lines = righe ESPN della stagione per la squadra; last_event_ids = ultime partite della squadra."""
    return player_finalize(player_base(lines, team_id, last_event_ids), lam_team, team_avg_goals)


def player_base(lines: list[dict], team_id: str, last_event_ids: list[str]) -> list[dict]:
    """Ritmi di stagione dei giocatori di una squadra, indipendenti dall'avversario (servono anche alle coppe)."""
    by_p = defaultdict(list)
    for x in lines:
        if x["team"] == team_id:
            by_p[x["pid"]].append(x)
    recent = set(last_event_ids[:5])
    out = []
    for pid, rows in by_p.items():
        starts = sum(1 for x in rows if x["start"])
        subs = sum(1 for x in rows if x.get("sub"))
        eq = starts + 0.35 * subs
        if eq < 1:
            continue
        rec = [x for x in rows if x["event"] in recent]
        involvement = (sum(1 for x in rec if x["start"]) + 0.35 * sum(1 for x in rec if x.get("sub"))) / max(len(recent), 1)
        if involvement < 0.2:
            continue
        tot = {k: sum(x.get(k, 0) or 0 for x in rows) for k in ("g", "a", "sh", "sot", "yc", "rc", "fc")}
        def rate(k, prior, kk=3.0):
            return (tot[k] + prior * kk) / (eq + kk)
        out.append({
            "pid": pid, "name": rows[-1]["name"], "pos": rows[-1].get("pos"),
            "apps": len(rows), "starts": starts, "involvement": r(involvement, 2),
            "tot": {k: int(v) for k, v in tot.items()},
            "_g": rate("g", 0.05) * involvement, "_a": rate("a", 0.04) * involvement,
            "_sot": rate("sot", 0.3) * involvement, "_sh": rate("sh", 0.8) * involvement,
            "_yc": rate("yc", 0.12) * involvement,
        })
    return out


def player_finalize(base: list[dict], lam_team: float, team_avg_goals: float) -> list[dict]:
    """Dai ritmi di stagione alle probabilità per questa partita (gol attesi della squadra)."""
    out = [dict(p) for p in base]
    if not out:
        return []
    scale = lam_team / max(team_avg_goals, 0.3)
    sum_g = sum(p["_g"] for p in out) * scale
    norm_g = min(1.0, lam_team * 0.95 / sum_g) if sum_g > 0 else 1.0
    sum_a = sum(p["_a"] for p in out) * scale
    norm_a = min(1.0, lam_team * 0.75 / sum_a) if sum_a > 0 else 1.0
    for p in out:
        p["p_goal"] = r(1 - math.exp(-p["_g"] * scale * norm_g))
        p["p_assist"] = r(1 - math.exp(-p["_a"] * scale * norm_a))
        p["p_goal_or_assist"] = r(1 - math.exp(-(p["_g"] * scale * norm_g + p["_a"] * scale * norm_a)))
        p["p_sot"] = r(1 - math.exp(-p["_sot"] * scale ** 0.7))
        p["p_shot"] = r(1 - math.exp(-p["_sh"] * scale ** 0.5))
        p["p_card"] = r(1 - math.exp(-p["_yc"]))
        for k in ("_g", "_a", "_sot", "_sh", "_yc"):
            p.pop(k)
    out.sort(key=lambda p: -(p["p_goal"] or 0))
    return out[:18]


# --------------------------------------------------------------- verifica affidabilità

def backtest(matches: list[dict], from_date: str, is_test=None, prior: dict | None = None) -> dict:
    """Rifà le previsioni settimana per settimana usando solo i dati disponibili prima.
    is_test: funzione che sceglie quali partite verificare (tutte se None)."""
    s1x2, sou = Scorer(), Scorer()
    test = sorted([m for m in matches if m["date"] >= from_date and (is_test is None or is_test(m))], key=lambda m: m["date"])
    weeks = defaultdict(list)
    for m in test:
        d = date.fromisoformat(m["date"])
        weeks[d.isocalendar()[:2]].append(m)
    for _, ms in sorted(weeks.items()):
        first = min(date.fromisoformat(m["date"]) for m in ms)
        rt = fit(matches, first, iters=40, prior=prior)
        if rt is None:
            continue
        for m in ms:
            lh, la = rt.lambdas(m["home"], m["away"])
            M = score_matrix(lh, la)
            p = list(p1x2(M))
            y = 0 if m["hg"] > m["ag"] else (1 if m["hg"] == m["ag"] else 2)
            s1x2.add(p, y, devig(m.get("o1x2")))
            i, j = np.indices(M.shape)
            po = float(M[(i + j) > 2.5].sum())
            book = devig(m.get("oou25"))
            sou.add([po, 1 - po], 0 if m["hg"] + m["ag"] > 2.5 else 1, book)
    return {"1x2": s1x2.summary(), "ou25": sou.summary()}
