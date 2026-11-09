"""Funzioni statistiche condivise e misure di affidabilità."""
import math

import numpy as np


def poisson_pmf(lam: float, kmax: int) -> np.ndarray:
    k = np.arange(kmax + 1)
    logp = -lam + k * math.log(max(lam, 1e-9)) - np.array([math.lgamma(i + 1) for i in k])
    return np.exp(logp)


def negbin_sf(mean: float, var: float, k: int) -> float:
    """P(X >= k) con binomiale negativa (o Poisson se la varianza non supera la media)."""
    if k <= 0:
        return 1.0
    mean = max(mean, 1e-6)
    if var <= mean * 1.05:
        pmf = poisson_pmf(mean, k - 1)
        return float(max(0.0, 1 - pmf.sum()))
    r = mean * mean / (var - mean)
    p = r / (r + mean)
    cdf, term = 0.0, p ** r
    for i in range(k):
        if i > 0:
            term *= (i - 1 + r) / i * (1 - p)
        cdf += term
    return float(min(1.0, max(0.0, 1 - cdf)))


def norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def devig(odds: list[float]) -> list[float] | None:
    """Quote decimali -> probabilità implicite senza margine del bookmaker."""
    if not odds or any(o is None or o <= 1 for o in odds):
        return None
    inv = [1 / o for o in odds]
    s = sum(inv)
    return [x / s for x in inv]


def r(x, nd=3):
    return None if x is None else round(float(x), nd)


class Scorer:
    """Raccoglie previsioni ed esiti per misurare l'affidabilità."""

    def __init__(self):
        self.model, self.book, self.out, self.calib = [], [], [], []

    def add(self, p_model: list[float], outcome: int, p_book: list[float] | None = None):
        self.model.append(p_model)
        self.out.append(outcome)
        self.book.append(p_book)
        for i, p in enumerate(p_model):
            self.calib.append((p, 1 if i == outcome else 0))

    @staticmethod
    def _brier(ps, ys):
        tot = 0.0
        for p, y in zip(ps, ys):
            tot += sum((pi - (1 if i == y else 0)) ** 2 for i, pi in enumerate(p))
        return tot / max(len(ps), 1)

    @staticmethod
    def _logloss(ps, ys):
        return -sum(math.log(max(p[y], 1e-6)) for p, y in zip(ps, ys)) / max(len(ps), 1)

    def summary(self) -> dict:
        n = len(self.out)
        if n == 0:
            return {"n": 0}
        res = {"n": n, "brier": r(self._brier(self.model, self.out), 4),
               "logloss": r(self._logloss(self.model, self.out), 4)}
        idx = [i for i, b in enumerate(self.book) if b]
        if len(idx) >= 30:
            pm = [self.model[i] for i in idx]
            pb = [self.book[i] for i in idx]
            ys = [self.out[i] for i in idx]
            res.update({"n_book": len(idx),
                        "brier_model_on_book": r(self._brier(pm, ys), 4),
                        "brier_book": r(self._brier(pb, ys), 4),
                        "logloss_model_on_book": r(self._logloss(pm, ys), 4),
                        "logloss_book": r(self._logloss(pb, ys), 4)})
        # Calibrazione: fasce del 10%
        bins = []
        for lo in range(0, 100, 10):
            sel = [(p, y) for p, y in self.calib if lo / 100 <= p < (lo + 10) / 100 or (lo == 90 and p == 1)]
            if len(sel) >= 15:
                bins.append({"from": lo, "to": lo + 10, "n": len(sel),
                             "pred": r(sum(p for p, _ in sel) / len(sel), 3),
                             "real": r(sum(y for _, y in sel) / len(sel), 3)})
        res["calibration"] = bins
        if bins:
            ece = sum(b["n"] * abs(b["pred"] - b["real"]) for b in bins) / sum(b["n"] for b in bins)
            res["calib_error"] = r(ece, 4)
        res["grade"] = grade(res)
        return res


def grade(s: dict) -> dict:
    """Giudizio leggibile: confronta il modello con le quote e controlla la calibrazione."""
    ce = s.get("calib_error")
    if s.get("n", 0) < 100:
        return {"label": "pochi dati", "level": 0,
                "text": "Servono più partite giocate per giudicare il modello."}
    if "logloss_book" in s:
        gap = (s["logloss_model_on_book"] - s["logloss_book"]) / s["logloss_book"]
        if gap <= 0.01 and (ce or 0) < 0.04:
            return {"label": "buona", "level": 3,
                    "text": "Precisione vicina a quella delle quote dei bookmaker e percentuali ben tarate."}
        if gap <= 0.04:
            return {"label": "discreta", "level": 2,
                    "text": "Un po' meno preciso delle quote: usalo come secondo parere, non come verità."}
        return {"label": "debole", "level": 1,
                "text": "Sensibilmente meno preciso delle quote: guarda soprattutto le statistiche."}
    if ce is not None and ce < 0.04:
        return {"label": "discreta", "level": 2, "text": "Percentuali ben tarate; nessun confronto con le quote disponibile."}
    return {"label": "da verificare", "level": 1, "text": "Percentuali poco tarate sulle partite passate."}
