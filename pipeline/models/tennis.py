"""Modello tennis: Elo generale e per superficie per la probabilità di vittoria; poi una
simulazione esatta punto-game-set (catena di Markov) per game totali, set, handicap e tie-break."""
import math
import zlib
from collections import defaultdict
from datetime import date, timedelta
from functools import lru_cache

from .common import r, devig, Scorer

SURF = {"Hard": "Hard", "Clay": "Clay", "Grass": "Grass", "Carpet": "Hard"}
# Punti vinti al servizio medi per circuito e superficie
P0 = {("atp", "Hard"): 0.645, ("atp", "Clay"): 0.625, ("atp", "Grass"): 0.665,
      ("wta", "Hard"): 0.565, ("wta", "Clay"): 0.555, ("wta", "Grass"): 0.575}


def k_factor(n):
    return 250 / ((n + 5) ** 0.4)


def expected(ra, rb):
    return 1 / (1 + 10 ** ((rb - ra) / 400))


class Elo:
    def __init__(self):
        self.r = defaultdict(lambda: 1500.0)
        self.n = defaultdict(int)
        self.rs = defaultdict(lambda: 1500.0)  # (player, surface)
        self.ns = defaultdict(int)
        self.last = {}

    def rating(self, p, surface):
        s = SURF.get(surface, "Hard")
        return 0.5 * self.r[p] + 0.5 * self.rs[(p, s)]

    def prob(self, a, b, surface):
        return expected(self.rating(a, surface), self.rating(b, surface))

    def update(self, w, l, surface, d):
        s = SURF.get(surface, "Hard")
        ew = expected(self.r[w], self.r[l])
        kw, kl = k_factor(self.n[w]), k_factor(self.n[l])
        self.r[w] += kw * (1 - ew)
        self.r[l] -= kl * (1 - ew)
        ews = expected(self.rs[(w, s)], self.rs[(l, s)])
        kws, kls = k_factor(self.ns[(w, s)]), k_factor(self.ns[(l, s)])
        self.rs[(w, s)] += kws * (1 - ews)
        self.rs[(l, s)] -= kls * (1 - ews)
        self.n[w] += 1; self.n[l] += 1; self.ns[(w, s)] += 1; self.ns[(l, s)] += 1
        self.last[w] = self.last[l] = d


def build_elo(matches, until: str | None = None, scorer: Scorer | None = None, score_from: str = "9999"):
    elo = Elo()
    for m in sorted(matches, key=lambda x: x["date"]):
        if until and m["date"] >= until:
            break
        if m["comment"] not in ("Completed", "Retired"):
            continue
        if scorer is not None and m["date"] >= score_from and m["comment"] == "Completed":
            p = elo.prob(m["w"], m["l"], m["surface"])
            # Orientamento casuale ma stabile per non sapere chi ha vinto
            flip = zlib.crc32((m["w"] + m["l"] + m["date"]).encode()) % 2 == 0
            book = devig([m["ow"], m["ol"]]) if m.get("ow") and m.get("ol") else None
            if flip:
                scorer.add([1 - p, p], 1, [book[1], book[0]] if book else None)
            else:
                scorer.add([p, 1 - p], 0, book)
        if m["comment"] == "Completed":
            elo.update(m["w"], m["l"], m["surface"], m["date"])
    return elo


# ------------------------------------------------------------------ catena di Markov

def p_hold(p):
    q = 1 - p
    deuce = p * p / (1 - 2 * p * q)
    return p ** 4 * (1 + 4 * q + 10 * q * q) + 20 * p ** 3 * q ** 3 * deuce


def p_tiebreak(pa, pb):
    """A serve il primo punto del tie-break."""
    @lru_cache(None)
    def f(a, b):
        if a >= 7 and a - b >= 2:
            return 1.0
        if b >= 7 and b - a >= 2:
            return 0.0
        if a == b and a >= 6:
            x, y = pa * (1 - pb), (1 - pa) * pb
            return x / (x + y)
        k = a + b
        a_serves = k == 0 or ((k - 1) // 2) % 2 == 1
        p = pa if a_serves else 1 - pb
        return p * f(a + 1, b) + (1 - p) * f(a, b + 1)
    return f(0, 0)


def set_dist(pa, pb, a_first):
    """Distribuzione dei punteggi di un set. Restituisce {(ga, gb): prob}."""
    ha, hb = p_hold(pa), p_hold(pb)
    tb_a_first = p_tiebreak(pa, pb)
    tb_b_first = 1 - p_tiebreak(pb, pa)
    dist = defaultdict(float)
    states = {(0, 0): 1.0}
    while states:
        nxt = defaultdict(float)
        for (ga, gb), pr in states.items():
            if (ga >= 6 or gb >= 6) and abs(ga - gb) >= 2 or ga == 7 or gb == 7:
                dist[(ga, gb)] += pr
                continue
            if ga == 6 and gb == 6:
                a_srv = a_first  # il 13° game lo serve chi ha servito il primo
                pw = tb_a_first if a_srv else tb_b_first
                dist[(7, 6)] += pr * pw
                dist[(6, 7)] += pr * (1 - pw)
                continue
            a_srv = ((ga + gb) % 2 == 0) == a_first
            pw = ha if a_srv else 1 - hb
            nxt[(ga + 1, gb)] += pr * pw
            nxt[(ga, gb + 1)] += pr * (1 - pw)
        states = nxt
    return dict(dist)


def fast_win(pa, pb, best_of=3):
    """Solo la probabilità di vincere l'incontro (più veloce, per la taratura)."""
    need = 2 if best_of == 3 else 3
    sd = {t: set_dist(pa, pb, t) for t in (True, False)}
    win_set = {t: sum(v for (a, b), v in sd[t].items() if a > b) for t in sd}
    keep = {t: sum(v for (a, b), v in sd[t].items() if (a + b) % 2 == 0) for t in sd}
    states = {(0, 0, True): 0.5, (0, 0, False): 0.5}
    total = 0.0
    while states:
        nxt = defaultdict(float)
        for (sa, sb, af), pr in states.items():
            if sa == need:
                total += pr
                continue
            if sb == need:
                continue
            # vittoria/sconfitta nel set e chi serve il successivo (approssimato come indipendente)
            for won in (True, False):
                pw = win_set[af] if won else 1 - win_set[af]
                for same in (True, False):
                    pk = keep[af] if same else 1 - keep[af]
                    nxt[(sa + won, sb + (not won), af if same else not af)] += pr * pw * pk
        states = nxt
    return total


def match_dist(pa, pb, best_of=3):
    need = 2 if best_of == 3 else 3
    sd = {True: set_dist(pa, pb, True), False: set_dist(pa, pb, False)}
    final = defaultdict(float)
    states = {(0, 0, True, 0, 0, False): 0.5, (0, 0, False, 0, 0, False): 0.5}
    while states:
        nxt = defaultdict(float)
        for (sa, sb, af, gA, gB, tb), pr in states.items():
            if sa == need or sb == need:
                final[(sa, sb, gA, gB, tb)] += pr
                continue
            for (ga, gb), ps in sd[af].items():
                n_af = af if (ga + gb) % 2 == 0 else not af
                key = (sa + (ga > gb), sb + (gb > ga), n_af, gA + ga, gB + gb, tb or (ga + gb == 13))
                nxt[key] += pr * ps
        states = nxt
    return final


def markets(p_match: float, tour: str, surface: str, best_of: int) -> dict:
    s = SURF.get(surface, "Hard")
    p0 = P0.get((tour, s), 0.62)
    lo, hi = -0.25, 0.25
    for _ in range(30):
        mid = (lo + hi) / 2
        pm = fast_win(p0 + mid, p0 - mid, best_of)
        if pm < p_match:
            lo = mid
        else:
            hi = mid
    d = (lo + hi) / 2
    pa, pb = p0 + d, p0 - d
    md = match_dist(pa, pb, best_of)
    win = sum(v for (sa, sb, *_), v in md.items() if sa > sb)
    sets = defaultdict(float)
    tot = defaultdict(float)
    diff = defaultdict(float)
    tb = 0.0
    for (sa, sb, gA, gB, t), v in md.items():
        sets[f"{sa}-{sb}"] += v
        tot[gA + gB] += v
        diff[gA - gB] += v
        tb += v * t
    exp_games = sum(k * v for k, v in tot.items())
    base = math.floor(exp_games) + 0.5
    totals = {f"{base + k:g}": r(sum(v for g, v in tot.items() if g > base + k)) for k in (-3, -2, -1, 0, 1, 2, 3)}
    hcp = {}
    for h in (-5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5):
        hcp[f"{h:+g}"] = r(sum(v for g, v in diff.items() if g + h > 0))
    deciding = sum(v for k, v in sets.items() if k in ("2-1", "1-2", "3-2", "2-3"))
    return {"win": [r(win), r(1 - win)], "serve_points": [r(pa), r(pb)],
            "hold": [r(p_hold(pa)), r(p_hold(pb))],
            "sets": {k: r(v) for k, v in sorted(sets.items(), key=lambda x: -x[1])},
            "exp_games": r(exp_games, 1), "totals": totals, "handicap": hcp,
            "tiebreak": r(tb), "deciding_set": r(deciding), "best_of": best_of}


# ------------------------------------------------------------------ statistiche giocatore

def player_summary(matches, name, surface, today_iso):
    ms = sorted([m for m in matches if name in (m["w"], m["l"]) and m["comment"] in ("Completed", "Retired")],
                key=lambda m: m["date"], reverse=True)
    year_from = today_iso[:4] + "-01-01"
    s = SURF.get(surface, "Hard")
    last = []
    for m in ms[:10]:
        won = m["w"] == name
        last.append({"date": m["date"], "opp": m["l"] if won else m["w"], "res": "V" if won else "P",
                     "score": " ".join(f"{a}-{b}" if won else f"{b}-{a}" for a, b in m["sets"]),
                     "tournament": m["tournament"], "surface": m["surface"], "round": m["round"]})
    def rec(sel):
        w = sum(1 for m in sel if m["w"] == name)
        return {"w": w, "l": len(sel) - w}
    year = [m for m in ms if m["date"] >= year_from]
    surf12 = [m for m in ms if SURF.get(m["surface"]) == s and m["date"] >= _minus_days(today_iso, 365)]
    sets_played = [st for m in ms[:30] for st in m["sets"]]
    tb_rate = sum(1 for a, b in sets_played if a + b == 13) / len(sets_played) if sets_played else None
    games = [sum(a + b for a, b in m["sets"]) for m in ms[:20] if m["bo"] == 3 and m["comment"] == "Completed"]
    rank = None
    for m in ms:
        rank = m["wr"] if m["w"] == name else m["lr"]
        if rank:
            break
    return {"name": name, "rank": int(rank) if rank else None, "last": last,
            "form10": {"seq": [x["res"] for x in last], "w": sum(x["res"] == "V" for x in last), "n": len(last)},
            "year": rec(year), "surface12m": rec(surf12),
            "tb_rate": r(tb_rate, 3) if tb_rate is not None else None,
            "avg_games_bo3": r(sum(games) / len(games), 1) if games else None,
            "matches_known": len(ms)}


def _minus_days(iso, n):
    return (date.fromisoformat(iso) - timedelta(days=n)).isoformat()


def h2h(matches, a, b):
    ms = sorted([m for m in matches if {m["w"], m["l"]} == {a, b} and m["comment"] in ("Completed", "Retired")],
                key=lambda m: m["date"], reverse=True)
    return {"n": len(ms), "a": sum(m["w"] == a for m in ms), "b": sum(m["w"] == b for m in ms),
            "games": [{"date": m["date"], "winner": m["w"], "tournament": m["tournament"],
                       "surface": m["surface"], "score": " ".join(f"{x}-{y}" for x, y in m["sets"])} for m in ms[:10]]}
