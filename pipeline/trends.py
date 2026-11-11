"""Tendenze in corso: serie aperte e frequenze alte nelle ultime partite di una squadra.
Le partite arrivano dalla più recente; nel calcio hanno gf, ga, res, home; nell'NBA pf, pa, res, home."""


def _streak(games, cond) -> int:
    n = 0
    for g in games:
        if not cond(g):
            break
        n += 1
    return n


def _text(n, total, what):
    return f"{what} da {'almeno ' if n == total else ''}{n} partite"


def soccer(last: list[dict], venue: str | None = None, limit: int = 5) -> list[dict]:
    """venue "home"/"away": aggiunge le serie in casa o fuori; None: entrambe (pagina squadra)."""
    out = []
    gs = last or []
    if len(gs) < 4:
        return []

    def add(games, cond, label, minimum, kind, where=""):
        n = _streak(games, cond)
        if n >= minimum:
            out.append({"t": _text(n, len(games), label) + where, "n": n, "s": round(n / minimum, 2), "k": kind})
        return n

    win = add(gs, lambda g: g["res"] == "V", "Vince", 3, "pos")
    unb = _streak(gs, lambda g: g["res"] != "P")
    if unb >= 5 and unb > win + 1:
        out.append({"t": _text(unb, len(gs), "Imbattuta"), "n": unb, "s": round(unb / 5, 2), "k": "pos"})
    lose = add(gs, lambda g: g["res"] == "P", "Perde", 3, "neg")
    nowin = _streak(gs, lambda g: g["res"] != "V")
    if nowin >= 4 and nowin > lose + 1:
        out.append({"t": _text(nowin, len(gs), "Senza vittorie"), "n": nowin, "s": round(nowin / 4, 2), "k": "neg"})
    add(gs, lambda g: g["gf"] > 0, "Segna", 6, "pos")
    add(gs, lambda g: g["gf"] == 0, "Non segna", 3, "neg")
    add(gs, lambda g: g["ga"] == 0, "Non subisce gol", 3, "pos")
    add(gs, lambda g: g["ga"] > 0, "Subisce gol", 7, "neg")
    add(gs, lambda g: g["gf"] + g["ga"] > 2.5, "Over 2,5", 5, "gol")
    add(gs, lambda g: g["gf"] + g["ga"] < 2.5, "Under 2,5", 5, "gol")
    add(gs, lambda g: g["gf"] > 0 and g["ga"] > 0, "Goal (segnano entrambe)", 5, "gol")
    add(gs, lambda g: not (g["gf"] > 0 and g["ga"] > 0), "No Goal", 5, "gol")
    for side in (["home", "away"] if venue is None else [venue]):
        sub = [g for g in gs if g["home"] == (side == "home")]
        where = " in casa" if side == "home" else " fuori casa"
        if len(sub) >= 3:
            w = add(sub, lambda g: g["res"] == "V", "Vince", 3, "pos", where)
            nw = _streak(sub, lambda g: g["res"] != "V")
            if nw >= 4 and w == 0:
                out.append({"t": _text(nw, len(sub), "Senza vittorie") + where, "n": nw, "s": round(nw / 4, 2), "k": "neg"})
            add(sub, lambda g: g["res"] == "P", "Perde", 3, "neg", where)
    # frequenze alte nelle ultime 10
    last10 = gs[:10]
    if len(last10) >= 8:
        for cond, label in ((lambda g: g["gf"] + g["ga"] > 2.5, "Over 2,5"), (lambda g: g["gf"] + g["ga"] < 2.5, "Under 2,5"),
                            (lambda g: g["gf"] > 0 and g["ga"] > 0, "Goal")):
            k = sum(1 for g in last10 if cond(g))
            if k >= 8 and not any(o["t"].startswith(label + " da") and o["n"] >= k for o in out):
                out.append({"t": f"{label} in {k} delle ultime {len(last10)}", "n": k, "s": round(k / 8, 2), "k": "gol"})
    out.sort(key=lambda o: -o["s"])
    return out[:limit]


def nba(last: list[dict], venue: str | None = None, limit: int = 4) -> list[dict]:
    out = []
    gs = last or []
    if len(gs) < 4:
        return []

    def add(games, cond, label, minimum, kind, where="", run=False):
        n = _streak(games, cond)
        if n >= minimum:
            t = f"{label} nelle ultime {'' if n < len(games) else 'almeno '}{n}" if run else _text(n, len(games), label) + where
            out.append({"t": t, "n": n, "s": round(n / minimum, 2), "k": kind})

    add(gs, lambda g: g["res"] == "V", "Vince", 4, "pos")
    add(gs, lambda g: g["res"] == "P", "Perde", 4, "neg")
    add(gs, lambda g: g["pf"] >= 115, "Almeno 115 punti segnati", 4, "gol", run=True)
    add(gs, lambda g: g["pf"] + g["pa"] >= 230, "Almeno 230 punti totali", 4, "gol", run=True)
    add(gs, lambda g: g["pf"] + g["pa"] < 215, "Meno di 215 punti totali", 4, "gol", run=True)
    for side in (["home", "away"] if venue is None else [venue]):
        sub = [g for g in gs if g["home"] == (side == "home")]
        where = " in casa" if side == "home" else " fuori casa"
        if len(sub) >= 3:
            add(sub, lambda g: g["res"] == "V", "Vince", 4, "pos", where)
            add(sub, lambda g: g["res"] == "P", "Perde", 4, "neg", where)
    out.sort(key=lambda o: -o["s"])
    return out[:limit]
