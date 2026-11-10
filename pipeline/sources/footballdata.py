"""football-data.co.uk: risultati storici, statistiche di partita e quote (CSV gratuiti)."""
import csv
import io
import logging
from datetime import datetime

from .. import http

log = logging.getLogger("footballdata")
BASE = "https://www.football-data.co.uk"


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def _date(s: str):
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s.strip(), fmt).date().isoformat()
        except (ValueError, AttributeError):
            continue
    return None


def _read_csv(text: str) -> list[dict]:
    text = text.lstrip("﻿")
    rows = list(csv.DictReader(io.StringIO(text)))
    return [r for r in rows if r.get("HomeTeam")]


def _download(url: str) -> list[dict]:
    r = http.get(url, delay=1.0)
    if r is None:
        return []
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return _read_csv(r.content.decode(enc))
        except UnicodeDecodeError:
            continue
    return []


def _odds_triplet(r: dict, keys: list[tuple[str, str, str]]):
    for h, d, a in keys:
        oh, od, oa = _f(r.get(h)), _f(r.get(d)), _f(r.get(a))
        if oh and od and oa:
            return oh, od, oa
    return None


def _ou(r: dict):
    for o, u in (("Avg>2.5", "Avg<2.5"), ("B365>2.5", "B365<2.5"), ("P>2.5", "P<2.5"),
                 ("AvgC>2.5", "AvgC<2.5")):
        oo, uu = _f(r.get(o)), _f(r.get(u))
        if oo and uu:
            return oo, uu
    return None


def parse_row(r: dict) -> dict | None:
    d = _date(r.get("Date", ""))
    if not d:
        return None
    m = {
        "date": d,
        "time": r.get("Time") or None,
        "home": r["HomeTeam"].strip(),
        "away": r["AwayTeam"].strip(),
        "hg": _f(r.get("FTHG")), "ag": _f(r.get("FTAG")),
        "hhg": _f(r.get("HTHG")), "hag": _f(r.get("HTAG")),
        "hs": _f(r.get("HS")), "as": _f(r.get("AS")),
        "hst": _f(r.get("HST")), "ast": _f(r.get("AST")),
        "hc": _f(r.get("HC")), "ac": _f(r.get("AC")),
        "hy": _f(r.get("HY")), "ay": _f(r.get("AY")),
        "hr": _f(r.get("HR")), "ar": _f(r.get("AR")),
        "hf": _f(r.get("HF")), "af": _f(r.get("AF")),
    }
    hxg, axg = _f(r.get("HxG")), _f(r.get("AxG"))
    if hxg is not None and axg is not None:
        m["hxg"], m["axg"] = hxg, axg
    trip = _odds_triplet(r, [("AvgH", "AvgD", "AvgA"), ("B365H", "B365D", "B365A"),
                             ("PSH", "PSD", "PSA"), ("AvgCH", "AvgCD", "AvgCA")])
    if trip:
        m["o1x2"] = list(trip)
    ou = _ou(r)
    if ou:
        m["oou25"] = list(ou)
    return m


def season(league_code: str, season_code: str) -> list[dict]:
    """Tutte le partite (giocate) di una stagione."""
    rows = _download(f"{BASE}/mmz4281/{season_code}/{league_code}.csv")
    out = [parse_row(r) for r in rows]
    return [m for m in out if m and m["hg"] is not None and m["ag"] is not None]


def fixtures() -> list[dict]:
    """Prossime partite con quote (tutti i campionati in un file)."""
    rows = _download(f"{BASE}/fixtures.csv")
    out = []
    for r in rows:
        m = parse_row(r)
        if m:
            m["div"] = (r.get("Div") or "").strip().lstrip("﻿")
            out.append(m)
    return out


def new_league(country_file: str, league_name: str, since: str) -> list[dict]:
    """Campionati "extra" (un file per nazione con tutte le stagioni): risultati e quote di chiusura.
    country_file es. 'JPN', league_name es. 'J1'; since = data ISO minima."""
    rows = _download_raw(f"{BASE}/new/{country_file}.csv")
    out = []
    for r in rows:
        if (r.get("League") or "").strip() != league_name:
            continue
        d = _date(r.get("Date", ""))
        hg, ag = _f(r.get("HG")), _f(r.get("AG"))
        if not d or d < since or hg is None or ag is None:
            continue
        m = {"date": d, "time": r.get("Time") or None, "home": (r.get("Home") or "").strip(),
             "away": (r.get("Away") or "").strip(), "hg": hg, "ag": ag, "season": (r.get("Season") or "").strip()}
        trip = _odds_triplet(r, [("AvgCH", "AvgCD", "AvgCA"), ("PSCH", "PSCD", "PSCA"), ("B365CH", "B365CD", "B365CA")])
        if trip:
            m["o1x2"] = list(trip)
        out.append(m)
    out.sort(key=lambda m: m["date"])
    return out


def _download_raw(url: str) -> list[dict]:
    r = http.get(url, delay=1.0, timeout=60)
    if r is None:
        return []
    for enc in ("utf-8-sig", "latin-1"):
        try:
            text = r.content.decode(enc).lstrip("\ufeff")
            return [x for x in csv.DictReader(io.StringIO(text)) if x.get("Home")]
        except UnicodeDecodeError:
            continue
    return []
