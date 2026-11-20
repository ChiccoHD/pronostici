"""Tennis: storico e incontri in programma da ESPN (tabelloni completi dei tornei), Elo per superficie."""
import logging
import math
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


ROUND_ORDER = ["Qualifying", "Group Stage", "Round Robin", "Round 1", "Round of 128", "Round 2", "Round of 64", "Round 3", "Round of 32", "Round 4",
               "Round of 16", "Quarterfinal", "Quarterfinals", "Semifinal", "Semifinals", "Final"]


def _round_key(name: str) -> int:
    n = (name or "").strip()
    for i, k in enumerate(ROUND_ORDER):
        if n.lower() == k.lower():
            return i
    return 50 if "final" in n.lower() else 5


def _tournaments(tour, todo, results, elo, today, index) -> list[dict]:
    """Tabellone di ogni torneo in corso: turni giocati e in programma, chi è ancora in gara e la stima di chi vince il torneo.
    La stima non conosce l'ordine esatto del tabellone: per ogni giocatore moltiplica la probabilità media di battere
    gli altri rimasti, per il numero di turni che mancano (indicativa)."""
    out = []
    by_t = {}
    for m in todo:
        by_t.setdefault(m["tournament"], []).append(m)
    start = (today - timedelta(days=16)).isoformat()
    for name, ups in by_t.items():
        done = [r for r in results if r.get("tournament") == name and r["date"] >= start]
        surface = surface_of(name, ups[0].get("location"), (ups[0].get("date") or "")[:10])
        idx = {e["id"].split("-")[-1]: e for e in index if e["sport"] == "tennis" and e["league"] == tour}
        rounds = {}
        for r in done:
            rounds.setdefault(r.get("round") or "Turno", []).append({"w": r["w"], "l": r["l"], "sets": r.get("sets"), "d": r["date"]})
        for m in ups:
            a, b = m["players"]
            e = idx.get(str(m["id"]))
            rounds.setdefault(m.get("round") or "Turno", []).append({"a": a["name"], "b": b["name"], "d": m.get("date"),
                                                                     "id": e["id"] if e else None, "p": e["main"][0] if e else None})
        losers = {r["l"] for r in done}
        group = any("group" in (k or "").lower() or "robin" in (k or "").lower() for k in rounds)
        alive = sorted({p["name"] for m in ups for p in m["players"]} | ({r["w"] for r in done} - losers if not group else set()))
        if group:    # girone all'italiana: nessuno è eliminato finché non finisce il girone
            alive = sorted({p["name"] for m in ups for p in m["players"]} | {r["w"] for r in done} | {r["l"] for r in done})
        left = max(1, math.ceil(math.log2(max(2, len(alive))))) if not group else 3
        strength = {}
        for p in alive:
            others = [q for q in alive if q != p]
            avg = sum(elo.prob(p, q, surface) for q in others) / max(1, len(others))
            strength[p] = avg ** left
        tot = sum(strength.values()) or 1
        title = sorted(({"name": p, "p": round(v / tot, 4)} for p, v in strength.items()), key=lambda x: -x["p"])[:12]
        out.append({"tour": tour, "name": name, "surface": surface, "group": group,
                    "rounds": [{"name": k, "m": v} for k, v in sorted(rounds.items(), key=lambda kv: _round_key(kv[0]))],
                    "title": title, "alive": len(alive)})
    return out


def build(today: date):
    index, reliability, status_all = [], {}, {}
    tours_out = []
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
                              "book": None, "extra": {f"Over {k}": v for k, v in tot[3:4]}, "surface": surface,
                              "bo": m["best_of"]})
            store.save(PUBLIC_DATA / "tennis" / f"{tour}.json", {"tour": tour, "updated": now.isoformat(timespec="minutes"),
                                                                 "players": profiles})
            try:
                tours_out.extend(_tournaments(tour, todo, results, elo, today, index))
            except Exception:
                log.exception("Tabellone %s", tour)
            status_all[tour] = status
        except Exception as ex:
            log.exception("Tennis %s", tour)
            status_all[tour] = {**status, "errore": f"{type(ex).__name__}: {ex}"}
    try:
        store.save(PUBLIC_DATA / "tennis" / "tornei.json", {"updated": now.isoformat(timespec="minutes"), "tournaments": tours_out})
    except Exception:
        log.exception("Tabelloni non salvati")
    try:
        photos.save()
    except Exception:
        log.exception("Foto tennisti non salvate")
    return index, reliability, status_all
