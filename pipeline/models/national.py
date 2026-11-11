"""Modello delle nazionali: forza d'attacco e difesa (Poisson con Dixon-Coles, come per i club),
adattato alle partite internazionali:
- il vantaggio di giocare in casa vale solo quando non si gioca in campo neutro;
- le partite pesano in base all'importanza (amichevoli meno, fasi finali di più) e all'età;
- le nazionali giocano poche partite, quindi si guarda indietro di diversi anni."""
import math
from collections import defaultdict
from datetime import date

import numpy as np

from .common import Scorer, devig
from .soccer import score_matrix, p1x2

# Scelti rifacendo le previsioni mese per mese: 2023-24 per scegliere, 2025-26 per controllare (vedi report/taratura.md)
HALF_LIFE_DAYS = 1200     # una partita di 3 anni fa pesa la metà di una di oggi
PRIOR = 0.3
YEARS_BACK = 12
NEW_TEAM = (0.7, 1.4)       # nazionale senza storico: probabilmente debole


def importance(tournament: str) -> float:
    t = (tournament or "").lower()
    if "friendly" in t or t == "amichevole":
        return 1.0      # pesarle meno peggiorava le previsioni: dicono comunque molto sulla forza
    if "qualification" in t or "nations league" in t:
        return 1.0
    if t in ("fifa world cup", "uefa euro", "copa américa", "copa america", "african cup of nations", "afc asian cup", "gold cup"):
        return 1.2
    return 0.8


class NatRatings:
    def __init__(self, teams, att, dfn, home, base):
        self.idx = {t: i for i, t in enumerate(teams)}
        self.att, self.dfn, self.home, self.base = att, dfn, home, base

    def _ad(self, team):
        i = self.idx.get(team)
        return (self.att[i], self.dfn[i]) if i is not None else NEW_TEAM

    def known(self, team) -> bool:
        return team in self.idx

    def lambdas(self, home: str, away: str, neutral: bool = False) -> tuple[float, float]:
        ah, dh = self._ad(home)
        aa, da = self._ad(away)
        h = 1.0 if neutral else self.home
        return self.base * h * ah * da, self.base * aa * dh


def fit(matches: list[dict], as_of: date, iters: int = 60, half_life=None, prior=None) -> NatRatings | None:
    """matches: date, home, away, hg, ag, neutral (bool), tournament."""
    half_life, prior = half_life or HALF_LIFE_DAYS, prior if prior is not None else PRIOR
    lo = date(as_of.year - YEARS_BACK, as_of.month, 1).isoformat()
    hist = [m for m in matches if lo <= m["date"] < as_of.isoformat()]
    if len(hist) < 200:
        return None
    teams = sorted({m["home"] for m in hist} | {m["away"] for m in hist})
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    hi = np.array([idx[m["home"]] for m in hist])
    ai = np.array([idx[m["away"]] for m in hist])
    yh = np.array([m["hg"] for m in hist], dtype=float)
    ya = np.array([m["ag"] for m in hist], dtype=float)
    hf = np.array([0.0 if m.get("neutral") else 1.0 for m in hist])     # 1 = si gioca davvero in casa
    age = np.array([(as_of - date.fromisoformat(m["date"])).days for m in hist], dtype=float)
    w = np.exp(-math.log(2) * age / half_life) * np.array([importance(m.get("tournament")) for m in hist])
    A, D, H = np.ones(n), np.ones(n), 1.3
    base = (w * (yh + ya)).sum() / (2 * w.sum())
    k = prior
    for _ in range(iters):
        hm = np.where(hf > 0, H, 1.0)
        num = np.bincount(hi, w * yh, n) + np.bincount(ai, w * ya, n) + k
        den = np.bincount(hi, w * base * hm * D[ai], n) + np.bincount(ai, w * base * D[hi], n) + k
        A = num / den
        num = np.bincount(ai, w * yh, n) + np.bincount(hi, w * ya, n) + k
        den = np.bincount(ai, w * base * hm * A[hi], n) + np.bincount(hi, w * base * A[ai], n) + k
        D = num / den
        sel = hf > 0
        H = (w * yh)[sel].sum() / (w * base * A[hi] * D[ai])[sel].sum()
        hm = np.where(hf > 0, H, 1.0)
        base = (w * (yh + ya)).sum() / (w * (hm * A[hi] * D[ai] + A[ai] * D[hi])).sum()
        ga, gd = math.exp(np.log(A).mean()), math.exp(np.log(D).mean())
        A, D, base = A / ga, D / gd, base * ga * gd
    return NatRatings(teams, A, D, H, base)


def backtest(matches: list[dict], from_date: str, is_test=None, **kw) -> dict:
    """Rifà le previsioni finestra per finestra (le nazionali giocano a gruppi di date) con i soli dati di prima."""
    s1x2, sou = Scorer(), Scorer()
    test = sorted([m for m in matches if m["date"] >= from_date and (is_test is None or is_test(m))], key=lambda m: m["date"])
    groups = defaultdict(list)
    for m in test:
        d = date.fromisoformat(m["date"])
        groups[(d.year, d.month)].append(m)
    for _, ms in sorted(groups.items()):
        first = min(date.fromisoformat(m["date"]) for m in ms)
        rt = fit(matches, first, iters=40, **kw)
        if rt is None:
            continue
        for m in ms:
            if not (rt.known(m["home"]) and rt.known(m["away"])):
                continue
            lh, la = rt.lambdas(m["home"], m["away"], m.get("neutral"))
            M = score_matrix(lh, la)
            y = 0 if m["hg"] > m["ag"] else (1 if m["hg"] == m["ag"] else 2)
            s1x2.add(list(p1x2(M)), y, devig(m.get("o1x2")))
            i, j = np.indices(M.shape)
            po = float(M[(i + j) > 2.5].sum())
            sou.add([po, 1 - po], 0 if m["hg"] + m["ag"] > 2.5 else 1, None)
    return {"1x2": s1x2.summary(), "ou25": sou.summary()}
