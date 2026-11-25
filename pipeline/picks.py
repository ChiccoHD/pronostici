"""Classifica delle giocate più probabili, ricavata dalle schede delle partite in programma.
Scrive public/data/migliori.json, letto dalla sezione "Migliori" dell'app."""
from zoneinfo import ZoneInfo
from datetime import datetime, timezone

from . import store
from .config import PUBLIC_DATA

# Soglie minime perché una giocata sui giocatori NBA sia significativa (non "almeno 5 punti")
NBA_MIN_LINE = {"pts": 15, "reb": 6, "ast": 4, "tpm": 2, "pra": 25}
NBA_MIN_P = 0.55
NBA_CAT = {"pts": "Punti", "reb": "Rimbalzi", "ast": "Assist", "tpm": "Triple", "pra": "Punti + rimbalzi + assist"}
NBA_UNIT = {"pts": "punti", "reb": "rimbalzi", "ast": "assist", "tpm": "triple", "pra": "P+R+A"}
PER_CAT = 40
# Migliori si filtra per giorno: le prime 40 di tutta la settimana lasciavano fuori le partite di oggi (Inter, Atlético…)
# perché vincevano sempre quelle dei giorni dopo. Ora per ogni giorno (ora italiana) entrano anche le sue prime PER_DAY.
PER_DAY = 15
DAY_MIN_P = 0.5          # sotto il 50% non serve aggiungerla: non è una «migliore»
DAY_TZ = ZoneInfo("Europe/Rome")


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
    if m.get("dnb") is None and m.get("1x2"):
        x = m["1x2"]
        m = {**m, "dnb": {"home": x[0] / (x[0] + x[2]), "away": x[2] / (x[0] + x[2])}}
    for side, t in (("home", H), ("away", A)):
        bk = book[0] / (book[0] + book[2]) if book[0] and book[2] else None
        out.append({**base, **_team(t), "cat": "Draw No Bet", "label": f"DNB {t['short']}", "p": m["dnb"][side],
                    "book": (bk if side == "home" else 1 - bk) if bk is not None else None})
    ou_book = b.get("ou25")
    for line in ("1.5", "2.5", "3.5"):
        p = m["ou"][line]
        bk = ou_book if line == "2.5" and ou_book else None
        out.append({**base, "tag": "O/U", "cat": "Gol", "label": f"Over {line.replace('.', ',')}", "p": p, "book": bk[0] if bk else None})
        out.append({**base, "tag": "O/U", "cat": "Gol", "label": f"Under {line.replace('.', ',')}", "p": 1 - p, "book": bk[1] if bk else None})
    out.append({**base, "tag": "GG", "cat": "Gol", "label": "Goal, segnano entrambe", "p": m["btts"], "book": None})
    out.append({**base, "tag": "NG", "cat": "Gol", "label": "No Goal", "p": 1 - m["btts"], "book": None})
    # multigol: totale (fasce strette) e per squadra, stesse etichette della scheda della partita
    for k in ("1-3", "2-3", "2-4", "3-5"):
        if k in (m.get("multigol") or {}):
            out.append({**base, "tag": "MG", "cat": "Multigol", "label": f"Multigol {k}", "p": m["multigol"][k], "book": None})
    for side, T in (("home", H), ("away", A)):
        for k in ("0-1", "1-2", "1-3", "2-3"):
            p = ((m.get("multigol_team") or {}).get(side) or {}).get(k)
            if p is not None:
                out.append({**base, **_team(T), "cat": "Multigol", "label": f"Multigol {T['short']} {k}", "p": p, "book": None})
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


def f1(d):
    """Formula 1: vittoria, podio, punti, pole e sfide tra compagni di squadra."""
    out, D = [], d.get("drivers") or []
    M = d.get("market") or {}       # mercato di previsione (Polymarket): solo come confronto
    base = {**_base(d), "match": d["home"]["name"]}
    for x in D:
        b = {**base, "color": x.get("color"), "tag": x.get("code")}
        bk = lambda k: (M.get(k) or {}).get(x["id"])
        out.append({**b, "book": bk("win"), "cat": "Vincente F1", "label": f"{x['short']} vince il GP", "p": x["win"]})
        out.append({**b, "book": bk("podium"), "cat": "Podio F1", "label": f"{x['short']} sul podio", "p": x["podium"]})
        if x.get("top10", 0) < 0.97:
            out.append({**b, "book": None, "cat": "Punti F1", "label": f"{x['short']} nei primi 10", "p": x["top10"]})
        if not (d.get("gp") or {}).get("quali_done") and x.get("pole") is not None:
            # la pole si decide in qualifica: la giocata ha l'orario della qualifica, non della gara
            q_at = next((s["date"] for s in (d.get("gp") or {}).get("sessions") or [] if s.get("k") == "Q"), None)
            out.append({**b, **({"date": q_at} if q_at else {}), "book": bk("pole"), "cat": "Pole F1", "label": f"{x['short']} in pole", "p": x["pole"]})
    H = d.get("h2h") or []
    ix = {x["id"]: i for i, x in enumerate(D)}
    seen = set()
    for x in D:
        mate = next((y for y in D if y["team"] == x["team"] and y["id"] != x["id"]), None)
        if not mate or (mate["id"], x["id"]) in seen or not H:
            continue
        seen.add((x["id"], mate["id"]))
        p = H[ix[x["id"]]][ix[mate["id"]]]
        a, b2 = (x, mate) if p >= 0.5 else (mate, x)
        out.append({**base, "color": a.get("color"), "tag": a.get("code"), "book": _h2h_book(M, a["id"], b2["id"]), "cat": "Testa a testa F1",
                    "label": f"{a['short']} davanti a {b2['short']}", "p": max(p, 1 - p)})
    # sfide quotate dal mercato tra piloti di squadre diverse
    by = {x["id"]: x for x in D}
    for ia, ib, pa, _v in M.get("h2h") or []:
        if ia not in by or ib not in by or by[ia]["team"] == by[ib]["team"] or not H:
            continue
        p = H[ix[ia]][ix[ib]]
        a, b2 = (by[ia], by[ib]) if p >= 0.5 else (by[ib], by[ia])
        out.append({**base, "color": a.get("color"), "tag": a.get("code"), "book": _h2h_book(M, a["id"], b2["id"]), "cat": "Testa a testa F1",
                    "label": f"{a['short']} davanti a {b2['short']}", "p": max(p, 1 - p)})
    return out


def _h2h_book(M, a, b):
    for ia, ib, pa, _v in M.get("h2h") or []:
        if (ia, ib) == (a, b):
            return pa
        if (ia, ib) == (b, a):
            return round(1 - pa, 4)
    return None


ORDER = ["Esito 1X2", "Doppia chance", "Draw No Bet", "Gol", "Multigol", "Marcatori", "Angoli", "Vincente NBA", "Punti totali", "Punti", "Rimbalzi",
         "Assist", "Triple", "Punti + rimbalzi + assist", "Vincente tennis", "Game nel tennis",
         "Vincente F1", "Podio F1", "Punti F1", "Pole F1", "Testa a testa F1"]


def _day(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(DAY_TZ).date().isoformat()
    except (TypeError, ValueError):
        return ""


def build(event_ids: list[str]) -> dict:
    items, trend_items = [], []
    for eid in event_ids:
        d = store.load(PUBLIC_DATA / "events" / f"{eid}.json")
        if not d:
            continue
        for side in ("home", "away"):
            for t in ((d.get("trends") or {}).get(side) or [])[:2]:
                T = d[side]
                trend_items.append({**_base(d), "team": T.get("short") or T.get("name"), "logo": T.get("logo"), "color": T.get("color"),
                                    "text": t["t"], "kind": t["k"], "score": t["s"]})
        try:
            items += {"soccer": soccer, "nba": nba, "tennis": tennis, "f1": f1}[d["sport"]](d)
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
        allc = sorted(cats[c], key=lambda x: -x["p"])
        keep = {id(x) for x in allc[:PER_CAT]}
        per_day = {}
        for x in allc:
            day = _day(x.get("date"))
            if x["p"] >= DAY_MIN_P and per_day.get(day, 0) < PER_DAY:
                per_day[day] = per_day.get(day, 0) + 1
                keep.add(id(x))
        out.append({"name": c, "items": [x for x in allc if id(x) in keep]})
    # dove il modello è più ottimista dei bookmaker (l'altro lato dello stesso mercato sarebbe un doppione)
    gaps = sorted((it for it in items if it.get("edge") is not None and it["edge"] >= 0.03 and it.get("p") is not None),
                  key=lambda x: -x["edge"])[:60]
    trend_items.sort(key=lambda x: -x["score"])
    return {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "categories": out, "disagree": gaps,
            "trends": trend_items[:60]}


def write(event_ids: list[str]) -> None:
    store.save(PUBLIC_DATA / "migliori.json", build(event_ids))
