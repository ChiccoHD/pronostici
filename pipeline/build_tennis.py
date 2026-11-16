"""Tennis: storico e incontri in programma da ESPN (tabelloni completi dei tornei), Elo per superficie."""
import logging
from datetime import date, datetime, timedelta, timezone

from . import config, photos, store
from .config import CACHE, PUBLIC_DATA
from .sources import espn
from .models import tennis as T
from .models.common import Scorer

log = logging.getLogger("tennis")

HISTORY_DAYS = 730   # due anni di storico
SCAN_STEP = 4        # ogni torneo dura almeno una settimana: un giorno ogni 4 li prende tutti
RESCAN_DAYS = 12     # gli ultimi giorni si riscaricano sempre (risultati nuovi)

CLAY = ("roland garros", "french open", "monte carlo", "monte-carlo", "madrid", "rome", "roma", "internazionali",
        "barcelona", "hamburg", "bastad", "båstad", "gstaad", "umag", "kitzbuhel", "kitzbühel", "estoril",
        "marrakech", "houston", "buenos aires", "rio de janeiro", "rio open", "santiago", "cordoba", "córdoba",
        "lyon", "geneva", "munich", "bmw open", "bucharest", "iasi", "iași", "palermo", "prague", "parma",
        "rabat", "bogota", "bogotá", "charleston", "stuttgart porsche", "strasbourg", "rouen", "budapest",
        "lausanne", "warsaw", "bad homburg porsche", "sopo", "colsanitas", "directv open", "cluj", "gstaad")
GRASS = ("wimbledon", "queen", "halle", "s-hertogenbosch", "'s-hertogenbosch", "libema", "eastbourne",
         "mallorca", "newport", "berlin", "bad homburg", "nottingham", "birmingham", "stuttgart boss", "boss open")


def surface_of(tournament: str, location: str, d: str) -> str:
    t = f"{tournament} {location}".lower()
    if any(k in t for k in GRASS):
        return "Grass"
    if any(k in t for k in CLAY):
        return "Clay"
    month = int(d[5:7]) if d else 1
    if month in (4, 5):
        return "Clay"
    return "Hard"


def _history(tour: str, today: date, status: dict) -> list[dict]:
    path = CACHE / "tennis" / f"espn_{tour}.json"
    cache = store.load(path, {"scanned": [], "matches": {}})
    scanned = set(cache["scanned"])
    matches = cache["matches"]
    start = today - timedelta(days=HISTORY_DAYS)
    days = []
    d = start
    while d <= today:
        iso = d.isoformat()
        if iso not in scanned or d >= today - timedelta(days=RESCAN_DAYS):
            days.append(d)
        d += timedelta(days=SCAN_STEP)
    if today not in days:
        days.append(today)
    new = 0
    for d in days:
        evs = espn.scoreboard_day("tennis", tour, d)
        for m in espn.tennis_matches(evs or [], tour):
            surf = surface_of(m["tournament"], m["location"], (m["date"] or "")[:10])
            row = espn.tennis_result_row(m, tour, surf)
            if row and row["id"] not in matches:
                matches[row["id"]] = row
                new += 1
        if evs is not None:
            scanned.add(d.isoformat())
    cutoff = (today - timedelta(days=HISTORY_DAYS + 30)).isoformat()
    matches = {k: v for k, v in matches.items() if v["date"] >= cutoff}
    store.save(path, {"scanned": sorted(scanned), "matches": matches})
    status["storico"] = f"{len(matches)} incontri (+{new})"
    return sorted(matches.values(), key=lambda m: (m["date"], m["id"]))


def build(today: date):
    index, reliability, status_all = [], {}, {}
    now = datetime.now(timezone.utc)
    for tour in ("atp", "wta"):
        status = {}
        try:
            results = _history(tour, today, status)
            if len(results) < 200:
                status_all[tour] = {**status, "errore": "storico insufficiente"}
                continue
            sc = Scorer()
            elo = T.build_elo(results, scorer=sc, score_from=(today - timedelta(days=365)).isoformat())
            bt = sc.summary()
            reliability[tour] = {"name": tour.upper(), "win": bt}
            known = {m["w"] for m in results} | {m["l"] for m in results}

            seen, todo = set(), []
            for k in range(config.DAYS_AHEAD["tennis"] + 1):
                for m in espn.tennis_matches(espn.scoreboard("tennis", tour, today + timedelta(days=k)), tour):
                    if m["state"] in ("pre", "in") and m["id"] not in seen:   # anche gli incontri in corso
                        seen.add(m["id"])
                        todo.append(m)
            status["espn"] = f"{len(todo)} incontri in programma"
            profiles = {}
            for m in todo:
                a, b = m["players"]
                surface = surface_of(m["tournament"], m["location"], (m["date"] or "")[:10])
                pa = elo.prob(a["name"], b["name"], surface)
                mk = T.markets(pa, tour, surface, m["best_of"])
                pls = []
                for p in (a, b):
                    s = T.player_summary(results, p["name"], surface, today.isoformat()) if p["name"] in known \
                        else {"name": p["name"], "matches_known": 0}
                    s["display"] = p["name"]
                    s["rank"] = p.get("rank") or s.get("rank")
                    s["country"] = p.get("country")
                    s["cc"] = p.get("cc")
                    s["flag"] = p.get("flag")
                    s["pid"] = p.get("pid") or p.get("id") or None  # numero ESPN del giocatore: serve al sito per la foto
                    try:
                        ph = photos.tennis_photo(p["name"], s["pid"], today)
                        if ph is not None:
                            s["photo"] = ph
                    except Exception:
                        log.exception("Foto tennista %s", p["name"])
                    s["elo"] = round(elo.rating(p["name"], surface))
                    pls.append(s)
                    if p["name"] not in profiles:
                        pr = T.player_profile(results, p["name"], elo, today.isoformat())
                        profiles[p["name"]] = {**pr, "country": p.get("country"), "flag": p.get("flag"), "pid": s.get("pid"),
                                               "seed": p.get("rank"), **({"photo": s["photo"]} if "photo" in s else {})}
                detail = {
                    "id": f"tennis-{tour}-{m['id']}", "sport": "tennis", "league": tour,
                    "league_name": f"{tour.upper()} · {m['tournament']}", "tournament": m["tournament"],
                    "round": m.get("round"), "surface": surface, "date": m["date"], "time_valid": m.get("time_valid"),
                    "home": {"name": a["name"]}, "away": {"name": b["name"]},
                    "markets": mk, "players": {"home": pls[0], "away": pls[1]},
                    "h2h": T.h2h(results, a["name"], b["name"]),
                    "low_data": pls[0].get("matches_known", 0) < 15 or pls[1].get("matches_known", 0) < 15,
                    "reliability": bt.get("grade"), "updated": now.isoformat(timespec="minutes"),
                }
                store.save(PUBLIC_DATA / "events" / f"{detail['id']}.json", detail)
                tot = list(mk["totals"].items())
                index.append({"id": detail["id"], "sport": "tennis", "league": tour,
                              "league_name": detail["league_name"], "date": m["date"], "time_valid": m.get("time_valid"),
                              "home": a["name"], "away": b["name"], "main": mk["win"], "main_labels": ["1", "2"],
                              "home_short": a.get("cc"), "away_short": b.get("cc"),
                              "home_flag": a.get("flag"), "away_flag": b.get("flag"),
                              "book": None, "extra": {f"Over {k}": v for k, v in tot[3:4]}, "surface": surface})
            store.save(PUBLIC_DATA / "tennis" / f"{tour}.json", {"tour": tour, "updated": now.isoformat(timespec="minutes"),
                                                                 "players": profiles})
            status_all[tour] = status
        except Exception as ex:
            log.exception("Tennis %s", tour)
            status_all[tour] = {**status, "errore": f"{type(ex).__name__}: {ex}"}
    try:
        photos.save()
    except Exception:
        log.exception("Foto tennisti non salvate")
    return index, reliability, status_all
