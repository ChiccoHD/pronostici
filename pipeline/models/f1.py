"""Formula 1: forza di pilota+macchina dai risultati recenti, simulazione Monte Carlo del Gran Premio.

- Punteggio di una gara: 1 al primo, 0 all'ultimo arrivato (solo i classificati); le qualifiche contano come
  seconda misura del passo. Media pesata con più peso alle gare recenti e meno alle stagioni prima del 2026
  (regolamento tecnico nuovo). Pochi dati → la stima si avvicina a quella della squadra.
- Gara simulata: passo = forza (eventualmente mescolata con la griglia, se le qualifiche sono già fatte, in base a quanto
  conta la partenza su quel circuito) + caso; ritiri con la probabilità della squadra e del circuito; pioggia = più caso.
- I parametri (scala e peso del passato) si scelgono sulle gare del 2026 già corse, prevedendo ognuna con i soli dati di prima.
"""
import math
from collections import defaultdict

import numpy as np

from .common import r

SIMS = 20000
OLD_SEASON_W = {2026: 1.0, 2025: 0.35, 2024: 0.18, 2023: 0.1}
QUALI_W = 0.45            # peso delle qualifiche nella forza di gara
PRIOR_K = 2.0             # quante "gare" vale la stima della squadra per chi ha pochi dati
DNF_BASE = 0.075
NOT_CLASSIFIED_PERF = ("Accident", "Collision", "Spun off", "Disqualified")


def _score(pos: int, n: int) -> float:
    return 1 - (pos - 1) / max(1, n - 1)


def _mech_dnf(status: str) -> bool:
    s = (status or "").lower()
    return not (s.startswith("finished") or s.startswith("+") or "lap" in s)


def ratings(races: list[dict], upto: tuple[int, int] | None = None, half_life: float = 8.0, old_w: dict | None = None):
    """Forza di ogni pilota (gara e qualifica) e della sua squadra, con i dati fino a (stagione, giro) escluso."""
    old_w = old_w or OLD_SEASON_W
    seq = [x for x in races if upto is None or (x["season"], x["round"]) < upto]
    seq.sort(key=lambda x: (x["season"], x["round"]))
    n = len(seq)
    acc = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])     # gara somma, peso, qualifica somma, peso
    team_acc = defaultdict(lambda: [0.0, 0.0])
    dnf = defaultdict(lambda: [0.0, 0.0])               # squadra: ritiri, gare (stagione più recente)
    last_team = {}
    cur_season = seq[-1]["season"] if seq else None
    for i, x in enumerate(seq):
        w = 0.5 ** ((n - 1 - i) / half_life) * old_w.get(x["season"], 0.05)
        cls = [y for y in x["results"] if y["classified"]]
        nc = len(cls)
        for y in x["results"]:
            last_team[y["id"]] = (y["team"], y.get("team_name"))
            if x["season"] == cur_season:
                dnf[y["team"]][1] += 1
                dnf[y["team"]][0] += 0 if y["classified"] else 1
            if y["classified"] and nc > 1:
                s = _score(cls.index(y) + 1, nc)
                acc[y["id"]][0] += w * s
                acc[y["id"]][1] += w
                team_acc[y["team"]][0] += w * s
                team_acc[y["team"]][1] += w
        q = x.get("quali") or []
        for y in q:
            s = _score(y["pos"], len(q))
            acc[y["id"]][2] += w * s
            acc[y["id"]][3] += w
    team = {t: (v[0] / v[1] if v[1] else 0.5) for t, v in team_acc.items()}
    out = {}
    for d, (rs, rw, qs, qw) in acc.items():
        t = last_team.get(d, (None, None))[0]
        prior = team.get(t, 0.4)
        race = (rs + PRIOR_K * prior * 0.1) / (rw + PRIOR_K * 0.1) if rw else prior
        quali = (qs + PRIOR_K * prior * 0.1) / (qw + PRIOR_K * 0.1) if qw else race
        out[d] = {"race": race, "quali": quali, "team": t, "weight": rw}
    dnf_rate = {t: (v[0] + DNF_BASE * 6) / (v[1] + 6) for t, v in dnf.items()}
    return out, team, dnf_rate


def circuit_profile(races: list[dict], circuit: str) -> dict:
    """Quanto conta la griglia (correlazione partenza-arrivo), ritiri, vincitori e piloti migliori su quel circuito."""
    past = [x for x in races if x["circuit"] == circuit and x["results"]]
    corr, dnf_n, dnf_d = [], 0, 0
    for x in past:
        pairs = [(y["grid"], y["pos"]) for y in x["results"] if y["classified"] and y["grid"] > 0]
        if len(pairs) >= 6:
            g = np.array([p[0] for p in pairs], float)
            f = np.array([p[1] for p in pairs], float)
            corr.append(float(np.corrcoef(g, f)[0, 1]))
        dnf_n += sum(1 for y in x["results"] if not y["classified"])
        dnf_d += len(x["results"])
    k = len(corr)
    grid_w = (sum(corr) + 0.55 * 3) / (k + 3) if k else 0.55      # media avvicinata a quella tipica
    dnf_rate = (dnf_n + DNF_BASE * 60) / (dnf_d + 60) if dnf_d else DNF_BASE
    winners = [{"season": x["season"], "winner": x["results"][0]["name"], "team": x["results"][0].get("team_name"),
                "pole": next((q["name"] for q in x.get("quali") or [] if q["pos"] == 1), None),
                "from_grid": x["results"][0]["grid"]} for x in sorted(past, key=lambda x: -x["season"])]
    pole_wins = sum(1 for w in winners if w["from_grid"] == 1)
    return {"editions": len(past), "grid_weight": r(max(0.2, min(0.9, grid_w)), 3), "dnf_rate": r(dnf_rate, 3),
            "dnf_factor": r(dnf_rate / DNF_BASE, 3), "winners": winners[:6],
            "pole_win_rate": r(pole_wins / len(winners), 3) if winners else None}


def driver_circuit(races: list[dict], circuit: str, driver: str) -> dict | None:
    rows = [(x["season"], next((y for y in x["results"] if y["id"] == driver), None)) for x in races if x["circuit"] == circuit]
    rows = [(s, y) for s, y in rows if y]
    if not rows:
        return None
    fin = [y["pos"] for _, y in rows if y["classified"]]
    return {"starts": len(rows), "best": min(fin) if fin else None, "avg": r(sum(fin) / len(fin), 1) if fin else None,
            "wins": sum(1 for p in fin if p == 1), "podiums": sum(1 for p in fin if p <= 3),
            "last": [{"season": s, "pos": y["pos"] if y["classified"] else None, "status": y["status"]} for s, y in sorted(rows, key=lambda z: -z[0])[:4]]}


def simulate(entrants: list[dict], R: dict, team: dict, dnf_rate: dict, prof: dict, scale: float,
             grid: dict | None = None, rain: float = 0.0, sims: int = SIMS, seed: int = 7, with_h2h: bool = True) -> dict:
    """entrants: [{"id","team"}]; grid: {id: posizione in griglia} se le qualifiche sono fatte; rain: probabilità di pioggia in gara."""
    rng = np.random.default_rng(seed)
    n = len(entrants)
    ids = [e["id"] for e in entrants]
    race = np.array([R.get(i, {}).get("race", team.get(e["team"], 0.35)) * (1 - QUALI_W) + R.get(i, {}).get("quali", team.get(e["team"], 0.35)) * QUALI_W
                     for i, e in zip(ids, entrants)])
    quali = np.array([R.get(i, {}).get("quali", team.get(e["team"], 0.35)) for i, e in zip(ids, entrants)])
    mu = (race - 0.5) * scale
    if grid:
        gw = prof.get("grid_weight", 0.55)
        gs = np.array([_score(grid[i], n) if grid.get(i) else race[k] for k, i in enumerate(ids)])
        mu = (1 - gw * 0.6) * mu + gw * 0.6 * (gs - 0.5) * scale
    noise = 1.0 + 0.6 * rain
    perf = mu[None, :] + rng.standard_normal((sims, n)) * noise
    p_dnf = np.array([min(0.45, dnf_rate.get(e["team"], DNF_BASE) * prof.get("dnf_factor", 1.0) * (1 + 0.35 * rain)) for e in entrants])
    out_mask = rng.random((sims, n)) < p_dnf[None, :]
    perf = np.where(out_mask, -1e9 + perf, perf)
    order = np.argsort(-perf, axis=1)
    rank = np.empty_like(order)
    rows = np.arange(sims)[:, None]
    rank[rows, order] = np.arange(n)[None, :]
    rank = np.where(out_mask, n + 5, rank)               # ritirato = dietro a tutti
    # qualifica (pole) e giro più veloce: stessi ingredienti, più caso
    qperf = ((quali - 0.5) * scale)[None, :] + rng.standard_normal((sims, n)) * (0.85 + 0.4 * rain)
    pole = np.bincount(np.argmax(qperf, axis=1), minlength=n) / sims
    flp = np.where(out_mask, -1e9, mu[None, :] + rng.standard_normal((sims, n)) * 2.2)
    fl = np.bincount(np.argmax(flp, axis=1), minlength=n) / sims
    res = []
    for k, i in enumerate(ids):
        rk = rank[:, k]
        fin = rk[rk < n]
        res.append({"id": i, "win": float((rk == 0).mean()), "podium": float((rk < 3).mean()), "top6": float((rk < 6).mean()),
                    "top10": float((rk < 10).mean()), "top8": float((rk < 8).mean()), "dnf": float(out_mask[:, k].mean()), "pole": float(pole[k]), "fl": float(fl[k]),
                    "exp_pos": float(fin.mean() + 1) if len(fin) else None})
    # testa a testa: i davanti a j (un ritiro è dietro; due ritiri = metà ciascuno)
    h2h = np.zeros((n, n))
    for a in (range(n) if with_h2h else []):
        ra = rank[:, a]
        for b in range(a + 1, n):
            rb = rank[:, b]
            both = (ra >= n) & (rb >= n)
            p = ((ra < rb) & ~both).mean() + 0.5 * both.mean()
            h2h[a, b], h2h[b, a] = p, 1 - p
    teams = defaultdict(float)
    for e, x in zip(entrants, res):
        teams[e["team"]] += x["win"]
    return {"drivers": res, "h2h": h2h, "team_win": dict(teams)}


def backtest(races: list[dict], seasons=(2026,)) -> dict:
    """Ogni GP di quelle stagioni previsto con i soli dati di prima: sceglie la scala e misura l'errore."""
    tests = [x for x in races if x["season"] in seasons and len(x["results"]) >= 10]
    tests.sort(key=lambda x: (x["season"], x["round"]))
    tests = tests[3:]                                      # le prime gare servono da base
    best = None
    for scale in (2.0, 3.0, 4.0, 5.0, 6.5, 8.0):
        for hl in (5.0, 8.0, 14.0):
            ll = br = 0.0
            for x in tests:
                R, team, dnf = ratings(races, (x["season"], x["round"]), half_life=hl)
                ent = [{"id": y["id"], "team": y["team"]} for y in x["results"]]
                sim = simulate(ent, R, team, dnf, {"grid_weight": 0.55, "dnf_factor": 1.0}, scale, sims=3000, with_h2h=False)
                win = {d["id"]: d["win"] for d in sim["drivers"]}
                pod = {d["id"]: d["podium"] for d in sim["drivers"]}
                w = x["results"][0]["id"]
                ll += -math.log(max(win.get(w, 0.001), 0.001))
                top3 = {y["id"] for y in x["results"][:3]}
                br += sum((pod[i] - (1 if i in top3 else 0)) ** 2 for i in pod) / len(pod)
            n = max(1, len(tests))
            cand = (ll / n, br / n, scale, hl)
            if best is None or cand[0] < best[0]:
                best = cand
    if best is None:
        return {"n": 0, "scale": 4.0, "half_life": 8.0}
    n_ent = 22
    return {"n": len(tests), "scale": best[2], "half_life": best[3], "logloss_winner": r(best[0], 3),
            "logloss_uniform": r(math.log(n_ent), 3), "brier_podium": r(best[1], 4)}
