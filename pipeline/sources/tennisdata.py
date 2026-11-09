"""tennis-data.co.uk: risultati ATP/WTA con punteggi, classifica, superficie e quote (gratuito)."""
import io
import logging
from datetime import date, datetime

from .. import http

log = logging.getLogger("tennisdata")
BASE = "http://www.tennis-data.co.uk"


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _rows_from_xlsx(content: bytes) -> list[dict]:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else "" for h in next(it)]
    return [dict(zip(header, row)) for row in it]


def year(tour: str, y: int) -> list[dict]:
    """tour = 'atp' | 'wta'. Restituisce le partite giocate dell'anno."""
    folder = f"{y}" if tour == "atp" else f"{y}w"
    r = None
    for ext in ("xlsx", "xls"):
        r = http.get(f"{BASE}/{folder}/{y}.{ext}", delay=1.0)
        if r is not None and r.content[:2] == b"PK":
            break
        r = None
    if r is None:
        return []
    try:
        rows = _rows_from_xlsx(r.content)
    except Exception as e:  # file corrotto o formato cambiato
        log.warning("tennis-data %s %s non leggibile: %s", tour, y, e)
        return []
    out = []
    for x in rows:
        if not x.get("Winner") or not x.get("Loser"):
            continue
        d = x.get("Date")
        if isinstance(d, datetime):
            d = d.date()
        if not isinstance(d, date):
            continue
        sets = []
        for i in range(1, 6):
            w, l = _f(x.get(f"W{i}")), _f(x.get(f"L{i}"))
            if w is None or l is None:
                break
            sets.append([int(w), int(l)])
        ow, ol = _f(x.get("AvgW")) or _f(x.get("B365W")) or _f(x.get("PSW")), \
            _f(x.get("AvgL")) or _f(x.get("B365L")) or _f(x.get("PSL"))
        out.append({
            "date": d.isoformat(), "tour": tour,
            "tournament": str(x.get("Tournament") or ""), "location": str(x.get("Location") or ""),
            "surface": str(x.get("Surface") or "Hard"), "court": str(x.get("Court") or ""),
            "round": str(x.get("Round") or ""), "bo": int(_f(x.get("Best of")) or 3),
            "w": str(x["Winner"]).strip(), "l": str(x["Loser"]).strip(),
            "wr": _f(x.get("WRank")), "lr": _f(x.get("LRank")),
            "sets": sets, "comment": str(x.get("Comment") or "Completed"),
            "ow": ow, "ol": ol,
        })
    return out
