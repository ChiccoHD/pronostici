"""Jolpica-F1 (erede di Ergast): calendario, risultati, qualifiche e sprint della Formula 1, gratis e senza chiave.
Limiti: 4 richieste al secondo, 200 all'ora. Le stagioni concluse si scaricano una volta e restano in cache;
quella in corso si riscarica solo quando c'è un Gran Premio nuovo concluso."""
import logging

from .. import http, store
from ..config import CACHE

log = logging.getLogger("jolpica")
BASE = "https://api.jolpi.ca/ergast/f1"
DELAY = 1.2


def _get(path: str, params: dict | None = None):
    js = http.get_json(f"{BASE}/{path}", params, delay=DELAY)
    return (js or {}).get("MRData")


def _paged(path: str, key: str) -> list[dict] | None:
    """Tutte le pagine di un elenco di gare (results, qualifying, sprint), unendo le righe della stessa gara."""
    races, offset, total = {}, 0, None
    while total is None or offset < total:
        mr = _get(path, {"limit": 100, "offset": offset})
        if mr is None:
            return None
        total = int(mr.get("total") or 0)
        rt = mr.get("RaceTable") or {}
        for r in rt.get("Races") or []:
            k = int(r["round"])
            races.setdefault(k, {**{x: r.get(x) for x in ("season", "round", "raceName", "date", "time")},
                                 "circuit": (r.get("Circuit") or {}).get("circuitId"), key: []})[key] += r.get(key) or []
        offset += 100
        if total == 0:
            break
    return [races[k] for k in sorted(races)]


def schedule(year: int) -> list[dict]:
    mr = _get(f"{year}.json", {"limit": 100})
    out = []
    for r in ((mr or {}).get("RaceTable") or {}).get("Races") or []:
        c = r.get("Circuit") or {}
        loc = c.get("Location") or {}
        ses = {}
        for k, n in (("FirstPractice", "FP1"), ("SecondPractice", "FP2"), ("ThirdPractice", "FP3"),
                     ("SprintQualifying", "SQ"), ("Sprint", "Sprint"), ("Qualifying", "Q")):
            if r.get(k):
                ses[n] = f"{r[k]['date']}T{(r[k].get('time') or '12:00:00Z')[:5]}Z"
        ses["Race"] = f"{r['date']}T{(r.get('time') or '12:00:00Z')[:5]}Z"
        out.append({"season": year, "round": int(r["round"]), "name": r["raceName"], "circuit": c.get("circuitId"),
                    "circuit_name": c.get("circuitName"), "locality": loc.get("locality"), "country": loc.get("country"),
                    "lat": float(loc.get("lat") or 0), "lon": float(loc.get("long") or 0), "sessions": ses})
    return out


def _driver(d: dict) -> dict:
    return {"id": d.get("driverId"), "code": d.get("code"), "num": d.get("permanentNumber"),
            "name": f"{d.get('givenName', '')} {d.get('familyName', '')}".strip(), "nat": d.get("nationality")}


def _row_result(x: dict) -> dict:
    fl = x.get("FastestLap") or {}
    return {**_driver(x.get("Driver") or {}), "team": (x.get("Constructor") or {}).get("constructorId"),
            "team_name": (x.get("Constructor") or {}).get("name"), "pos": int(x["position"]), "grid": int(x.get("grid") or 0),
            "status": x.get("status"), "classified": (x.get("positionText") or "").isdigit(), "points": float(x.get("points") or 0),
            "laps": int(x.get("laps") or 0), "fl_rank": int(fl["rank"]) if fl.get("rank") else None}


def _row_quali(x: dict) -> dict:
    return {**_driver(x.get("Driver") or {}), "team": (x.get("Constructor") or {}).get("constructorId"), "pos": int(x["position"]),
            "q": [x.get("Q1"), x.get("Q2"), x.get("Q3")]}


def season(year: int, completed: bool, status: dict) -> dict:
    """Risultati, qualifiche e sprint di una stagione, dalla cache se c'è già tutto."""
    path = CACHE / "f1" / f"jolpica_{year}.json"
    old = store.load(path)
    if old and completed and old.get("races"):
        return old
    # quanti GP conclusi adesso? (una richiesta piccola)
    mr = _get(f"{year}/last/results.json")
    last = int((((mr or {}).get("RaceTable") or {}).get("round")) or 0)
    if old and old.get("_last") == last and not completed:
        return old
    res = _paged(f"{year}/results.json", "Results")
    qua = _paged(f"{year}/qualifying.json", "QualifyingResults")
    spr = _paged(f"{year}/sprint.json", "SprintResults")
    if res is None or qua is None:
        status[f"jolpica_{year}"] = "non raggiungibile, uso l'ultima copia"
        return old or {"races": []}
    qmap = {q["round"]: q for q in qua}
    smap = {s["round"]: s for s in (spr or [])}
    races = []
    for r in res:
        rd = r["round"]
        races.append({"season": year, "round": int(rd), "name": r["raceName"], "date": r["date"], "circuit": r["circuit"],
                      "results": [_row_result(x) for x in r["Results"]],
                      "quali": [_row_quali(x) for x in (qmap.get(rd) or {}).get("QualifyingResults", [])],
                      "sprint": [_row_result(x) for x in (smap.get(rd) or {}).get("SprintResults", [])]})
    data = {"season": year, "_last": last, "races": races}
    store.save(path, data)
    status[f"jolpica_{year}"] = f"{len(races)} gare"
    return data


def quali_for(year: int, rnd: int) -> list[dict]:
    """Qualifiche (e griglia sprint) di un GP non ancora corso: servono a ritoccare le stime dopo il sabato."""
    mr = _get(f"{year}/{rnd}/qualifying.json")
    races = ((mr or {}).get("RaceTable") or {}).get("Races") or []
    return [_row_quali(x) for x in (races[0].get("QualifyingResults") if races else [])]


def standings(year: int) -> dict:
    d = _get(f"{year}/driverStandings.json") or {}
    c = _get(f"{year}/constructorStandings.json") or {}
    dl = ((d.get("StandingsTable") or {}).get("StandingsLists") or [{}])[0].get("DriverStandings") or []
    cl = ((c.get("StandingsTable") or {}).get("StandingsLists") or [{}])[0].get("ConstructorStandings") or []
    return {"drivers": [{**_driver(x["Driver"]), "pos": int(x.get("position") or 0), "points": float(x["points"]), "wins": int(x["wins"]),
                         "team": (x.get("Constructors") or [{}])[-1].get("constructorId"), "team_name": (x.get("Constructors") or [{}])[-1].get("name")}
                        for x in dl],
            "teams": [{"id": x["Constructor"]["constructorId"], "name": x["Constructor"]["name"], "pos": int(x.get("position") or 0),
                       "points": float(x["points"]), "wins": int(x["wins"])} for x in cl]}
