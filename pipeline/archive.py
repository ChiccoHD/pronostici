"""Archivio dei pronostici: ogni partita conclusa resta qui (180 giorni) con il pronostico di prima del via,
le quote e il risultato, per vedere nel tempo dove il modello va meglio (pagina Info → Archivio).
Formato compatto: una riga per partita, campi brevi."""
from datetime import datetime, timedelta, timezone

from . import store
from .config import PUBLIC_DATA

PATH = PUBLIC_DATA / "archive.json"
KEEP_DAYS = 180


def _row(e: dict) -> dict | None:
    f = e.get("final") or {}
    if f.get("void") or f.get("h") is None:
        return None
    r = {"id": e["id"], "d": e["date"][:16], "s": e["sport"], "l": e["league"], "ln": e.get("league_name", ""),
         "h": e["home"], "a": e["away"], "p": [round(x, 3) for x in e["main"]],
         "r": [f["h"], f["a"]] + ([f["w"]] if f.get("w") is not None else [])}
    if e.get("book"):
        r["b"] = [round(x, 3) for x in e["book"]]
    x = e.get("extra") or {}
    if x.get("Over 2,5") is not None:
        r["o"] = round(x["Over 2,5"], 3)
    if x.get("Goal") is not None:
        r["g"] = round(x["Goal"], 3)
    tot = next((k for k in x if k.startswith("Over ") and "." in k), None)
    if tot:
        r["t"] = [float(tot[5:]), round(x[tot], 3)]
        if f.get("games") is not None:
            r["tg"] = f["games"]
    return r


def update(events: list[dict], status: dict) -> None:
    data = store.load(PATH, {"rows": []}) or {"rows": []}
    rows = {r["id"]: r for r in data.get("rows", [])}
    added = 0
    for e in events:
        if e["id"] in rows:
            continue
        r = _row(e)
        if r:
            rows[e["id"]] = r
            added += 1
    lim = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).isoformat()[:16]
    out = sorted((r for r in rows.values() if r["d"] >= lim), key=lambda r: r["d"], reverse=True)
    store.save(PATH, {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "rows": out})
    status["archivio"] = {"partite": len(out), "nuove": added}
