"""Modello NBA: rating di attacco e difesa in punti (minimi quadrati pesati e regolarizzati),
fattore campo e back-to-back. Soglie giocatori da medie recenti, minuti attesi e avversario."""
import math
from collections import defaultdict
from datetime import date, timedelta

import numpy as np

from .common import norm_cdf, negbin_sf, r, Scorer

HALF_LIFE_DAYS = 60
LAST_SEASON_FACTOR = 0.35
RIDGE = 6.0
SIGMA_MARGIN = (11.0, 15.5)
SIGMA_TOTAL = (15.0, 22.0)

PROP_LINES = {
    "pts": [10, 15, 20, 25, 30, 35, 40],
    "reb": [4, 6, 8, 10, 12, 14],
    "ast": [2, 4, 6, 8, 10, 12],
    "tpm": [1, 2, 3, 4, 5, 6],
    "pra": [15, 20, 25, 30, 35, 40, 45, 50],
}


def rest_days(games: list[dict]) -> dict:
    """(game_id, team_id) -> giorni dall'ultima partita."""
    last = {}
    out = {}
    for g in sorted(games, key=lambda x: x["date"]):
        d = date.fromisoformat(g["date"][:10])
        for t in (g["home"], g["away"]):
            out[(g["id"], t)] = (d - last[t]).days if t in last else 9
            last[t] = d
    return out


class NbaModel:
    def __init__(self, teams, mu, h, o, d, b2b_own, b2b_opp, s_m, s_t):
        self.idx = {t: i for i, t in enumerate(teams)}
        self.mu, self.h, self.o, self.d = mu, h, o, d
        self.b2b_own, self.b2b_opp = b2b_own, b2b_opp
        self.s_m, self.s_t = s_m, s_t

    def _od(self, t):
        i = self.idx.get(t)
        return (self.o[i], self.d[i]) if i is not None else (0.0, 0.0)

    def expected(self, home, away, b2b_home=False, b2b_away=False):
        oh, dh = self._od(home)
        oa, da = self._od(away)
        hs = self.mu + self.h + oh - da + self.b2b_own * b2b_home + self.b2b_opp * b2b_away
        as_ = self.mu + oa - dh + self.b2b_own * b2b_away + self.b2b_opp * b2b_home
        return hs, as_

    def ratings(self):
        return {t: {"off": r(self.o[i], 2), "def": r(self.d[i], 2), "net": r(self.o[i] + self.d[i], 2)}
                for t, i in self.idx.items()}


def fit(games: list[dict], as_of: date, current_season_from: str) -> NbaModel | None:
    hist = [g for g in games if g["date"][:10] < as_of.isoformat() and g.get("hs") is not None]
    if len(hist) < 40:
        return None
    rest = rest_days(games)
    teams = sorted({g["home"] for g in hist} | {g["away"] for g in hist})
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    P = 4 + 2 * n  # mu, h, b2b_own, b2b_opp, o[n], d[n]
    rows, ys, ws = [], [], []
    for g in hist:
        age = (as_of - date.fromisoformat(g["date"][:10])).days
        w = math.exp(-math.log(2) * age / HALF_LIFE_DAYS)
        if g["date"][:10] < current_season_from:
            w *= LAST_SEASON_FACTOR
        hb = 1.0 if rest.get((g["id"], g["home"]), 9) == 1 else 0.0
        ab = 1.0 if rest.get((g["id"], g["away"]), 9) == 1 else 0.0
        hi, ai = idx[g["home"]], idx[g["away"]]
        x = np.zeros(P); x[0] = 1; x[1] = 1; x[2] = hb; x[3] = ab; x[4 + hi] = 1; x[4 + n + ai] = -1
        rows.append(x); ys.append(g["hs"]); ws.append(w)
        x = np.zeros(P); x[0] = 1; x[2] = ab; x[3] = hb; x[4 + ai] = 1; x[4 + n + hi] = -1
        rows.append(x); ys.append(g["as"]); ws.append(w)
    X, y, W = np.array(rows), np.array(ys, dtype=float), np.array(ws)
    reg = np.zeros(P); reg[2:4] = 2.0; reg[4:] = RIDGE
    A = X.T @ (X * W[:, None]) + np.diag(reg)
    beta = np.linalg.solve(A, X.T @ (W * y))
    resid = y - X @ beta
    rh, ra = resid[0::2], resid[1::2]
    wg = W[0::2]
    s_m = math.sqrt(np.average((rh - ra) ** 2, weights=wg))
    s_t = math.sqrt(np.average((rh + ra) ** 2, weights=wg))
    s_m = min(max(s_m, SIGMA_MARGIN[0]), SIGMA_MARGIN[1])
    s_t = min(max(s_t, SIGMA_TOTAL[0]), SIGMA_TOTAL[1])
    return NbaModel(teams, beta[0], beta[1], beta[4:4 + n], beta[4 + n:], beta[2], beta[3], s_m, s_t)


def _half(x):
    return math.floor(x) + 0.5


def markets(m: NbaModel, home, away, b2b_home, b2b_away, book: dict | None) -> dict:
    hs, as_ = m.expected(home, away, b2b_home, b2b_away)
    margin, total = hs - as_, hs + as_
    p_home = norm_cdf(margin / m.s_m)
    tl = book.get("total") if book and book.get("total") else _half(total)
    totals = {}
    for dl in (-10, -5, 0, 5, 10):
        L = tl + dl
        totals[f"{L:g}"] = r(1 - norm_cdf((L - total) / m.s_t))
    sp = book.get("spread") if book and book.get("spread") is not None else -_half(abs(margin)) * (1 if margin > 0 else -1)
    spreads = {}
    for ds in (-4, -2, 0, 2, 4):
        s = sp + ds
        spreads[f"{s:+g}"] = r(norm_cdf((margin + s) / m.s_m))  # casa copre l'handicap s
    st = math.sqrt(m.s_t ** 2 / 4 + m.s_m ** 2 / 4)  # deviazione del punteggio di una squadra
    team_tot = {}
    for side, mean in (("home", hs), ("away", as_)):
        b = _half(mean)
        team_tot[side] = {f"{b + k:g}": r(1 - norm_cdf((b + k - mean) / st)) for k in (-6, -3, 0, 3, 6)}
    bands = {}
    for lo, hi in ((1, 5), (6, 10), (11, 15), (16, 99)):
        lab = f"{lo}-{hi}" if hi < 99 else f"{lo}+"
        bands[f"casa {lab}"] = r(norm_cdf((hi + 0.5 - margin) / m.s_m) - norm_cdf((lo - 0.5 - margin) / m.s_m))
        bands[f"ospite {lab}"] = r(norm_cdf((-lo + 0.5 - margin) / m.s_m) - norm_cdf((-hi - 0.5 - margin) / m.s_m))
    return {"exp": [r(hs, 1), r(as_, 1)], "margin": r(margin, 1), "total": r(total, 1),
            "win": [r(p_home), r(1 - p_home)], "total_line": tl, "totals": totals,
            "spread_line": sp, "spreads": spreads, "team_totals": team_tot, "bands": bands,
            "sigma": [r(m.s_m, 1), r(m.s_t, 1)]}


# ----------------------------------------------------------------- statistiche squadra

def team_games(games, team):
    out = []
    for g in games:
        if g.get("hs") is None or team not in (g["home"], g["away"]):
            continue
        home = g["home"] == team
        pf, pa = (g["hs"], g["as"]) if home else (g["as"], g["hs"])
        out.append({"date": g["date"][:10], "home": home, "opp": g["away"] if home else g["home"],
                    "pf": pf, "pa": pa, "res": "V" if pf > pa else "P"})
    return sorted(out, key=lambda x: x["date"], reverse=True)


def form_block(gs, n):
    g = gs[:n]
    if not g:
        return {"n": 0}
    return {"n": len(g), "seq": [x["res"] for x in g], "w": sum(x["res"] == "V" for x in g),
            "l": sum(x["res"] == "P" for x in g),
            "pf": r(sum(x["pf"] for x in g) / len(g), 1), "pa": r(sum(x["pa"] for x in g) / len(g), 1),
            "total": r(sum(x["pf"] + x["pa"] for x in g) / len(g), 1)}


def team_summary(games, team, season_from):
    gs = team_games(games, team)
    season = [x for x in gs if x["date"] >= season_from]
    return {"last": gs[:15], "form5": form_block(gs, 5), "form10": form_block(gs, 10),
            "form15": form_block(gs, 15), "season": form_block(season, 200),
            "home_season": form_block([x for x in season if x["home"]], 200),
            "away_season": form_block([x for x in season if not x["home"]], 200)}


def h2h(games, a, b, n=10):
    gs = sorted([g for g in games if g.get("hs") is not None and {g["home"], g["away"]} == {a, b}],
                key=lambda g: g["date"], reverse=True)[:n]
    wa = sum(1 for g in gs if (g["home"] == a) == (g["hs"] > g["as"]))
    return {"n": len(gs), "a": wa, "b": len(gs) - wa,
            "avg_total": r(sum(g["hs"] + g["as"] for g in gs) / len(gs), 1) if gs else None,
            "games": [{"date": g["date"][:10], "home": g["home"], "away": g["away"], "hs": g["hs"], "as": g["as"]} for g in gs]}


def records(games, season_from):
    rec = defaultdict(lambda: [0, 0])
    for g in games:
        if g.get("hs") is None or g["date"][:10] < season_from:
            continue
        hw = g["hs"] > g["as"]
        rec[g["home"]][0 if hw else 1] += 1
        rec[g["away"]][1 if hw else 0] += 1
    return {t: {"w": v[0], "l": v[1]} for t, v in rec.items()}


# ----------------------------------------------------------------- giocatori

def _avg(xs):
    return sum(xs) / len(xs) if xs else 0.0


def player_block(rows, n):
    g = rows[:n]
    if not g:
        return None
    f = lambda k: r(_avg([x.get(k, 0) or 0 for x in g]), 1)
    fga, fgm = sum(x.get("fga", 0) for x in g), sum(x.get("fgm", 0) for x in g)
    tpa, tpm = sum(x.get("tpa", 0) for x in g), sum(x.get("tpm", 0) for x in g)
    return {"n": len(g), "min": f("min"), "pts": f("pts"), "reb": f("reb"), "ast": f("ast"),
            "tpm": f("tpm"), "stl": f("stl"), "blk": f("blk"), "tov": f("tov"),
            "fga": f("fga"), "fg_pct": r(fgm / fga, 3) if fga else None,
            "tp_pct": r(tpm / tpa, 3) if tpa else None}


def player_props(lines, team_id, team_game_ids, pts_factor, injuries_by_pid) -> list[dict]:
    by_p = defaultdict(list)
    for x in lines:
        if x["team"] == team_id:
            by_p[x["pid"]].append(x)
    recent5 = set(team_game_ids[:5])
    out = []
    for pid, rows in by_p.items():
        rows.sort(key=lambda x: x["date"], reverse=True)
        if not any(x["event"] in recent5 for x in rows):
            continue
        inj = injuries_by_pid.get(pid)
        status = (inj or {}).get("status") or ""
        out_flag = status.lower() in ("out", "fuori")
        last5 = rows[:5]
        wts = [0.85 ** i for i in range(len(last5))]
        min_proj = sum(w * x["min"] for w, x in zip(wts, last5)) / sum(wts)
        if min_proj < 12:
            continue
        r15 = rows[:15]
        tot_min = sum(x["min"] for x in r15) or 1
        props = {}
        for stat, factor in (("pts", pts_factor), ("reb", 1.0), ("ast", math.sqrt(pts_factor)),
                             ("tpm", pts_factor), ("pra", pts_factor)):
            vals = [(x.get("pts", 0) + x.get("reb", 0) + x.get("ast", 0)) if stat == "pra" else x.get(stat, 0) for x in r15]
            per_min = sum(vals) / tot_min
            mean = per_min * min_proj * factor
            if len(vals) >= 5:
                mv = _avg(vals)
                var = sum((v - mv) ** 2 for v in vals) / (len(vals) - 1)
                var *= (mean / mv) ** 2 if mv > 0 else 1
            else:
                var = mean * 1.6
            var = max(var, mean * 1.05)
            probs = {}
            for L in PROP_LINES[stat]:
                p = negbin_sf(mean, var, L)
                if 0.04 <= p <= 0.96:
                    probs[str(L)] = r(p)
            props[stat] = {"mean": r(mean, 1), "p": probs}
        out.append({"pid": pid, "name": rows[0]["name"], "pos": rows[0].get("pos"),
                    "status": status or None, "out": out_flag, "min_proj": r(min_proj, 1),
                    "avg5": player_block(rows, 5), "avg10": player_block(rows, 10),
                    "avg15": player_block(rows, 15), "season": player_block(rows, 200),
                    "props": {} if out_flag else props})
    out.sort(key=lambda p: -(p["min_proj"] or 0))
    return out[:13]


# ----------------------------------------------------------------- verifica affidabilità

def backtest(games, from_date, current_season_from):
    sc = Scorer()
    sc_ou = Scorer()
    test = sorted([g for g in games if g.get("hs") is not None and g["date"][:10] >= from_date],
                  key=lambda g: g["date"])
    if not test:
        return {"win": sc.summary(), "total": sc_ou.summary()}
    rest = rest_days(games)
    start = date.fromisoformat(test[0]["date"][:10])
    end = date.fromisoformat(test[-1]["date"][:10])
    d = start
    while d <= end:
        nxt = d + timedelta(days=3)
        block = [g for g in test if d.isoformat() <= g["date"][:10] < nxt.isoformat()]
        if block:
            season_from = current_season_from if d.isoformat() >= current_season_from else "0000"
            mdl = fit(games, d, season_from)
            if mdl:
                for g in block:
                    hb = rest.get((g["id"], g["home"]), 9) == 1
                    ab = rest.get((g["id"], g["away"]), 9) == 1
                    hs, as_ = mdl.expected(g["home"], g["away"], hb, ab)
                    p = norm_cdf((hs - as_) / mdl.s_m)
                    book = g.get("odds") or {}
                    pb = [book["p_home"], book["p_away"]] if book.get("p_home") else None
                    sc.add([p, 1 - p], 0 if g["hs"] > g["as"] else 1, pb)
                    if book.get("total"):
                        po = 1 - norm_cdf((book["total"] - (hs + as_)) / mdl.s_t)
                        if g["hs"] + g["as"] != book["total"]:
                            sc_ou.add([po, 1 - po], 0 if g["hs"] + g["as"] > book["total"] else 1, [0.5, 0.5])
        d = nxt
    return {"win": sc.summary(), "total": sc_ou.summary()}
