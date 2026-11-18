"""Taratura con l'archivio: se nelle partite già concluse il modello è stato troppo sicuro (o troppo prudente)
sul risultato principale, le percentuali dei prossimi incontri vengono ammorbidite (o rese più nette) per sport.

Metodo: "temperatura" sulla probabilità dell'esito principale (1X2 nel calcio, vincente in NBA e tennis),
scelta per minimizzare l'errore (log loss) sull'archivio e poi avvicinata a 1 in proporzione a quante partite ci sono
(con poche partite cambia pochissimo; serve almeno MIN_N per iniziare). Le quote dei bookmaker non entrano.
Si applica solo alle partite non ancora iniziate, una volta sola (campo "cal")."""
import json
import logging
import math
from datetime import datetime, timezone

from . import store
from .config import PUBLIC_DATA

log = logging.getLogger("taratura")
PATH = PUBLIC_DATA / "calibration.json"
MIN_N = 60          # partite chiuse minime per sport
PRIOR_N = 300       # quante partite "valgono" la fiducia iniziale nel modello
GRID = [0.70 + 0.02 * i for i in range(36)]   # 0,70 … 1,40


def _outcome(row: dict) -> int | None:
    rr = row.get("r") or []
    if len(rr) < 2 or rr[0] is None or rr[1] is None:
        return None
    h, a = rr[0], rr[1]
    if row["s"] == "soccer":
        return 0 if h > a else 1 if h == a else 2
    if row["s"] == "tennis" and len(rr) > 2 and rr[2] in (0, 1):
        return rr[2]
    if h == a:
        return None
    return 0 if h > a else 1


def _temper(p: list[float], t: float) -> list[float]:
    q = [max(x, 1e-6) ** (1 / t) for x in p]
    s = sum(q)
    return [x / s for x in q]


def _ll(pairs, t):
    return sum(-math.log(max(_temper(p, t)[y], 1e-9)) for p, y in pairs) / len(pairs)


def fit(rows: list[dict]) -> dict:
    out = {}
    for sport in ("soccer", "nba", "tennis"):
        pairs = []
        for row in rows:
            if row.get("s") != sport or not row.get("p"):
                continue
            y = _outcome(row)
            if y is not None and y < len(row["p"]):
                pairs.append((row["p"], y))
        n = len(pairs)
        if n < MIN_N:
            out[sport] = {"n": n, "t": 1.0, "nota": f"servono almeno {MIN_N} partite concluse"}
            continue
        best = min(GRID, key=lambda t: _ll(pairs, t))
        t_eff = 1 + (best - 1) * n / (n + PRIOR_N)
        out[sport] = {"n": n, "t_fit": round(best, 2), "t": round(t_eff, 3),
                      "logloss": round(_ll(pairs, 1.0), 4), "logloss_tarata": round(_ll(pairs, t_eff), 4)}
    return out


def _dc(x12):
    return {"1X": round(x12[0] + x12[1], 3), "X2": round(x12[1] + x12[2], 3), "12": round(x12[0] + x12[2], 3)}


def apply(events: list[dict], status: dict) -> None:
    rows = (store.load(PUBLIC_DATA / "archive.json", {"rows": []}) or {}).get("rows", [])
    cal = fit(rows)
    now = datetime.now(timezone.utc).isoformat()[:16]
    changed = 0
    for e in events:
        if e["sport"] not in ("soccer", "nba", "tennis"):
            continue
        c = cal.get(e["sport"] if e["sport"] in ("nba", "tennis") else "soccer")
        if not c or abs(c["t"] - 1) < 0.02 or e.get("cal") or e["date"] <= now or not e.get("main"):
            continue
        t = c["t"]
        path = PUBLIC_DATA / "events" / f"{e['id']}.json"
        d = store.load(path)
        if not d:
            continue
        mk = d.get("markets") or {}
        key = "1x2" if "1x2" in mk else "win" if "win" in mk else None
        if not key:
            continue
        new = [round(x, 3) for x in _temper(mk[key], t)]
        mk[key] = new
        if key == "1x2" and "dc" in mk:
            mk["dc"] = _dc(new)
        mk["cal"] = t
        d["markets"] = mk
        store.save(path, d)
        if len(e["main"]) == len(new):
            e["main"] = new
        e["cal"] = t
        changed += 1
    store.save(PATH, {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "sports": cal})
    status["taratura"] = {s: (f"x{v['t']:.2f} su {v['n']} partite" if v.get("t_fit") else v.get("nota")) for s, v in cal.items()}
    status["taratura"]["partite_ritoccate"] = changed
