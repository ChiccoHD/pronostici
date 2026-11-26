"""Controllo del mese: rilegge l'archivio delle partite concluse e dice dove il modello va bene, dove è troppo sicuro
o troppo prudente e dove i bookmaker fanno meglio. Gira da solo il 1° di ogni mese (workflow «Controllo mensile»),
scrive `public/data/controllo.json` (pagina Info → Archivio) e `report/controllo.md` (per chi rivede il modello).
Non cambia niente da solo: segnala. Le correzioni automatiche restano quelle di calibrate.py."""
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from . import store
from .config import PUBLIC_DATA, ROOT

DAYS = 90            # periodo controllato
MIN_N = 40           # sotto questo numero di partite non si giudica
MIN_GAP = 0.05       # scarto minimo (5 punti) per segnalare


def _ll(p, y):
    p = min(max(p, 1e-4), 1 - 1e-4)
    return -math.log(p if y else 1 - p)


def _samples(rows):
    """(area, p prevista, uscita 0/1, p bookmaker o None, campionato) per ogni giocata controllabile."""
    for r in rows:
        s, p, res = r.get("s"), r.get("p"), r.get("r")
        if s == "f1" or not p or not res:
            continue
        h, a = res[0], res[1]
        b = r.get("b")
        if s == "soccer" and len(p) == 3:
            out = 0 if h > a else (1 if h == a else 2)
            for k, lab in enumerate(("1", "X", "2")):
                yield ("Calcio · esito " + lab, p[k], out == k, b[k] if b and len(b) == 3 else None, r.get("ln") or r.get("l"))
            if r.get("o") is not None:
                yield ("Calcio · Over 2,5", r["o"], h + a > 2.5, None, r.get("ln"))
            if r.get("g") is not None:
                yield ("Calcio · Goal", r["g"], h > 0 and a > 0, None, r.get("ln"))
        elif len(p) == 2:
            win = (res[2] == 0) if (s == "tennis" and len(res) > 2) else h > a
            name = {"nba": "NBA", "tennis": "Tennis"}.get(s, s)
            yield (f"{name} · vincente", p[0], win, b[0] if b and len(b) == 2 else None, r.get("ln") or r.get("l"))
            if r.get("t"):
                tot = r.get("tg") if r.get("tg") is not None else (h + a if s == "nba" else None)
                if tot is not None:
                    yield (f"{name} · Over totale", r["t"][1], tot > r["t"][0], None, r.get("ln"))


def _calib(xs):
    """Sulle giocate date sopra il 60%: percentuale media prevista contro quella uscita davvero."""
    hi = [(p, y) for p, y, *_ in xs if p >= 0.6] + [(1 - p, not y) for p, y, *_ in xs if p <= 0.4]
    if len(hi) < MIN_N:
        return None
    pm = sum(p for p, _ in hi) / len(hi)
    fr = sum(1 for _, y in hi if y) / len(hi)
    se = math.sqrt(max(pm * (1 - pm), 0.01) / len(hi))
    return {"n": len(hi), "pred": round(pm, 3), "real": round(fr, 3), "gap": round(fr - pm, 3), "sure": abs(fr - pm) > max(MIN_GAP, 2 * se)}


def build(today=None) -> dict:
    today = today or datetime.now(timezone.utc)
    arch = store.load(PUBLIC_DATA / "archive.json", {"rows": []})
    lim = (today - timedelta(days=DAYS)).strftime("%Y-%m-%d")
    rows = [r for r in arch.get("rows", []) if r.get("d", "") >= lim]
    by = defaultdict(list)
    lg = defaultdict(list)
    for area, p, y, bk, league in _samples(rows):
        by[area].append((p, y, bk))
        if area.startswith("Calcio · esito") or "vincente" in area:
            lg[(area.split(" · ")[0], league)].append((p, y, bk))
    items, signals = [], []
    for area in sorted(by):
        xs = by[area]
        it = {"area": area, "n": len(xs)}
        c = _calib(xs)
        if c:
            it["cal"] = c
            if c["sure"]:
                who = "troppo sicuro" if c["gap"] < 0 else "troppo prudente"
                signals.append({"kind": "warn", "txt": f"{area}: il modello è {who}. Sulle giocate date al {round(c['pred'] * 100)}% in media ne sono uscite il {round(c['real'] * 100)}% ({c['n']} giocate)."})
        wb = [(p, y, bk) for p, y, bk in xs if bk is not None]
        if len(wb) >= MIN_N:
            lm = sum(_ll(p, y) for p, y, _ in wb) / len(wb)
            lb = sum(_ll(bk, y) for _, y, bk in wb) / len(wb)
            it["vs"] = {"n": len(wb), "model": round(lm, 4), "book": round(lb, 4)}
            if area.startswith("Calcio · esito"):
                pass                      # il confronto del calcio si fa sull'1X2 intero, più sotto
            elif lm > lb + 0.02:
                signals.append({"kind": "info", "txt": f"{area}: i bookmaker sono più precisi del modello ({len(wb)} partite): quando le percentuali sono lontane, dai più peso a loro."})
            elif lm < lb - 0.01:
                signals.append({"kind": "ok", "txt": f"{area}: il modello ha fatto meglio dei bookmaker ({len(wb)} partite)."})
        items.append(it)
    # calcio: 1X2 intero contro i bookmaker, partita per partita (log-loss a tre esiti)
    sm = [r for r in rows if r.get("s") == "soccer" and r.get("b") and len(r.get("p") or []) == 3 and r.get("r")]
    if len(sm) >= MIN_N:
        o = lambda r: 0 if r["r"][0] > r["r"][1] else (1 if r["r"][0] == r["r"][1] else 2)
        lm = sum(-math.log(max(r["p"][o(r)], 1e-4)) for r in sm) / len(sm)
        lb = sum(-math.log(max(r["b"][o(r)], 1e-4)) for r in sm) / len(sm)
        items.append({"area": "Calcio · 1X2 intero", "n": len(sm), "vs": {"n": len(sm), "model": round(lm, 4), "book": round(lb, 4)}})
        if lm > lb + 0.03:
            signals.append({"kind": "info", "txt": f"Calcio, 1X2: i bookmaker sono stati più precisi del modello ({len(sm)} partite). Quando le percentuali sono lontane, dai più peso a loro."})
        elif lm < lb:
            signals.append({"kind": "ok", "txt": f"Calcio, 1X2: il modello ha fatto meglio dei bookmaker ({len(sm)} partite)."})
    leagues = []
    for (sport, league), xs in lg.items():
        wb = [(p, y, bk) for p, y, bk in xs if bk is not None]
        games = len(wb) // 3 if sport == "Calcio" else len(wb)      # nel calcio 3 righe (1, X, 2) per partita
        if games >= 30:
            lm = sum(_ll(p, y) for p, y, _ in wb) / len(wb)
            lb = sum(_ll(bk, y) for _, y, bk in wb) / len(wb)
            leagues.append({"sport": sport, "league": league, "n": games, "model": round(lm, 4), "book": round(lb, 4)})
            if lm > lb + 0.04:
                signals.append({"kind": "info", "txt": f"{league}: qui il modello sbaglia più dei bookmaker ({games} partite). Usalo come secondo parere."})
    if not signals:
        signals.append({"kind": "ok", "txt": "Nessuno scarto da segnalare: dove ci sono abbastanza partite, il modello è tarato bene."})
    order = {"warn": 0, "info": 1, "ok": 2}
    signals.sort(key=lambda s: order[s["kind"]])
    return {"date": today.date().isoformat(), "days": DAYS, "rows": len(rows), "signals": signals, "items": items,
            "leagues": sorted(leagues, key=lambda x: x["model"] - x["book"], reverse=True)}


def write():
    rep = build()
    store.save(PUBLIC_DATA / "controllo.json", rep)
    md = [f"# Controllo del mese — {rep['date']}", "", f"Ultimi {rep['days']} giorni, {rep['rows']} partite in archivio.", "", "## Segnali", ""]
    md += [f"- {'⚠️' if s['kind'] == 'warn' else 'ℹ️' if s['kind'] == 'info' else '✅'} {s['txt']}" for s in rep["signals"]]
    md += ["", "## Per giocata", "", "| Giocata | Partite | Prevista (sopra 60%) | Uscita | Log-loss modello | Bookmaker |", "|---|---|---|---|---|---|"]
    for it in rep["items"]:
        c, v = it.get("cal") or {}, it.get("vs") or {}
        md.append(f"| {it['area']} | {it['n']} | {c.get('pred', '–')} | {c.get('real', '–')} | {v.get('model', '–')} | {v.get('book', '–')} |")
    (ROOT / "report").mkdir(exist_ok=True)
    (ROOT / "report" / "controllo.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps(rep["signals"], ensure_ascii=False, indent=1))


def maybe_write(status: dict):
    """Dal run: rifà il controllo al primo giro di ogni mese (o se manca)."""
    old = store.load(PUBLIC_DATA / "controllo.json", {}) or {}
    now = datetime.now(timezone.utc)
    if old.get("date", "")[:7] != now.strftime("%Y-%m"):
        write()
        status["controllo"] = {"ok": True, "data": now.date().isoformat()}


if __name__ == "__main__":
    write()
