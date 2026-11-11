"""Classifica delle giocate più probabili, ricavata dalle schede delle partite in programma.
Scrive public/data/migliori.json, letto dalla sezione "Migliori" dell'app."""
from datetime import datetime, timezone

from . import store
from .config import PUBLIC_DATA

# Soglie minime perché una giocata sui giocatori NBA sia significativa (non "almeno 5 punti")
NBA_MIN_LINE = {"pts": 15, "reb": 6, "ast": 4, "tpm": 2, "pra": 25}
NBA_MIN_P = 0.55
NBA_CAT = {"pts": "Punti", "reb": "Rimbalzi", "ast": "Assist", "tpm": "Triple", "pra": "Punti + rimbalzi + assist"}
NBA_UNIT = {"pts": "punti", "reb": "rimbalzi", "ast": "assist", "tpm": "triple", "pra": "P+R+A"}
PER_CAT = 40


def _f(v):
    return float(v) if v is not None else None


def _base(d):
    return {"event": d["id"], "sport": d["sport"], "league": d["league"], "league_name": d["league_name"],
            "date": d["date"], "time_valid": d.get("time_valid"),
            "match": f"{d['home']['name']} – {d['away']['name']}"}


def _team(t):
    return {"logo": t.get("logo") or t.get("flag"), "color": t.get("color"), "tag": t.get("abbr") or t.get("short")}


def soccer(d):
    out, m, b = [], d["markets"], d.get("book") or {}
    H, A, base = d["home"], d["away"], _base(d)
    book = b.get("1x2") or [None, None, None]
    for i, (lab, t) in enumerate(((f"{H['short']} vince", H), ("Pareggio", None), (f"{A['short']} vince", A))):
        out.append({**base, **(_team(t) if t else {"tag": "X"}), "cat": "Esito 1X2", "label": lab, "p": m["1x2"][i], "book": book[i]})
    for k, lab in (("1X", f"{H['short']} o pareggio"), ("X2", f"{A['short']} o pareggio")):
        out.append({**base, **_team(H if k == "1X" else A), "cat": "Doppia chance", "label": lab, "p": m["dc"][k], "book": None})
    ou_book = b.get("ou25")
    for line in ("1.5", "2.5", "3.5"):
        p = m["ou"][line]
        bk = ou_book if line == "2.5" and ou_book else None
        out.append({**base, "tag": "O/U", "cat": "Gol", "label": f"Over {line.replace('.', ',')}", "p": p, "book": bk[0] if bk else None})
        out.append({**base, "tag": "O/U", "cat": "Gol", "label": f"Under {line.replace('.', ',')}", "p": 1 - p, "book": bk[1] if bk else None})
    out.append({**base, "tag": "GG", "cat": "Gol", "label": "Goal, segnano entrambe", "p": m["btts"], "book": None})
    out.append({**base, "tag": "NG", "cat": "Gol", "label": "No Goal", "p": 1 - m["btts"], "book": None})
    for side, T in (("home", H), ("away", A)):
        for p in (d.get("players") or {}).get(side, [])[:6]:
            out.append({**base, **_team(T), "player": p["name"], "pid": p.get("pid"), **({"photo": p["photo"]} if "photo" in p else {}), "cat": "Marcatori",
                        "label": f"{p['name']} segna", "p": p["p_goal"], "book": None})
    if d.get("corners"):
        for line, p in d["corners"]["ou"].items():
            out.append({**base, "tag": "ANG", "cat": "Angoli", "label": f"Over {line.replace('.', ',')} angoli", "p": p, "book": None})
            out.append({**base, "tag": "ANG", "cat": "Angoli", "label": f"Under {line.replace('.', ',')} angoli", "p": 1 - p, "book": None})
    return out


def nba(d):
    out, m, b = [], d["markets"], d.get("book") or {}
    H, A, base = d["home"], d["away"], _base(d)
    pb = [b.get("p_home"), b.get("p_away")] if b.get("p_home") else [None, None]
    for i, T in enumerate((H, A)):
        out.append({**base, **_team(T), "cat": "Vincente NBA", "label": f"{T.get('short') or T['name']} vince", "p": m["win"][i], "book": pb[i]})
    tl = m["total_line"]
    pt = m["totals"].get(f"{tl:g}")
    if pt is not None:
        out.append({**base, "tag": "TOT", "cat": "Punti totali", "label": f"Over {tl:g} punti".replace(".", ","), "p": pt, "book": 0.5 if b.get("total") else None})
        out.append({**base, "tag": "TOT", "cat": "Punti totali", "label": f"Under {tl:g} punti".replace(".", ","), "p": 1 - pt, "book": 0.5 if b.get("total") else None})
    for side, T in (("home", H), ("away", A)):
        for p in (d.get("players") or {}).get(side, []):
            if p.get("out"):
                continue
            for stat, v in (p.get("props") or {}).items():
                best = None
                for line, pr in v["p"].items():
                    L = int(line)
                    if L >= NBA_MIN_LINE[stat] and pr >= NBA_MIN_P and (best is None or L > best[0]):
                        best = (L, pr)
                if best:
                    out.append({**base, **_team(T), "player": p["name"], "pid": p.get("pid"), "pos": p.get("pos"), "cat": NBA_CAT[stat],
                                "label": f"{p['name']} almeno {best[0]} {NBA_UNIT[stat]}", "p": best[1], "book": None,
                                "mean": v["mean"]})
    return out


def tennis(d):
    out, m = [], d["markets"]
    H, A, base = d["home"], d["away"], _base(d)
    P = d.get("players") or {}
    for i, (T, side) in enumerate(((H, "home"), (A, "away"))):
        info = P.get(side, {})
        out.append({**base, "logo": info.get("flag"), "tag": (info.get("cc") or "").upper(), "cat": "Vincente tennis",
                    "label": f"{T['name']} vince", "p": m["win"][i], "book": None, "low": d.get("low_data")})
    totals = list(m["totals"].items())
    if totals:
        line, p = totals[len(totals) // 2]
        out.append({**base, "tag": "GAME", "cat": "Game nel tennis", "label": f"Over {line.replace('.', ',')} game", "p": p, "book": None})
        out.append({**base, "tag": "GAME", "cat": "Game nel tennis", "label": f"Under {line.replace('.', ',')} game", "p": 1 - p, "book": None})
    return out


ORDER = ["Esito 1X2", "Doppia chance", "Gol", "Marcatori", "Angoli", "Vincente NBA", "Punti totali", "Punti", "Rimbalzi",
         "Assist", "Triple", "Punti + rimbalzi + assist", "Vincente tennis", "Game nel tennis"]


def build(event_ids: list[str]) -> dict:
    items = []
    for eid in event_ids:
        d = store.load(PUBLIC_DATA / "events" / f"{eid}.json")
        if not d:
            continue
        try:
            items += {"soccer": soccer, "nba": nba, "tennis": tennis}[d["sport"]](d)
        except (KeyError, TypeError, ValueError):
            continue
    cats = {}
    for it in items:
        if it.get("p") is None:
            continue
        it["p"] = round(_f(it["p"]), 3)
        if it.get("book") is not None:
            it["book"] = round(_f(it["book"]), 3)
            it["edge"] = round(it["p"] - it["book"], 3)
        cats.setdefault(it["cat"], []).append(it)
    out = []
    for c in sorted(cats, key=lambda c: ORDER.index(c) if c in ORDER else 99):
        lst = sorted(cats[c], key=lambda x: -x["p"])[:PER_CAT]
        out.append({"name": c, "items": lst})
    # dove il modello è più ottimista dei bookmaker (l'altro lato dello stesso mercato sarebbe un doppione)
    gaps = sorted((it for it in items if it.get("edge") is not None and it["edge"] >= 0.03 and it.get("p") is not None),
                  key=lambda x: -x["edge"])[:60]
    return {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "categories": out, "disagree": gaps}


def write(event_ids: list[str]) -> None:
    store.save(PUBLIC_DATA / "migliori.json", build(event_ids))
