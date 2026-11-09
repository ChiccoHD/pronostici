"""Tennis: risultati ATP/WTA da tennis-data.co.uk (Elo), incontri in programma da ESPN."""
import logging
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from . import config, store
from .config import CACHE, PUBLIC_DATA
from .names import person_key
from .sources import espn, tennisdata
from .models import tennis as T
from .models.common import Scorer

log = logging.getLogger("tennis")

SLAMS = ("australian open", "roland garros", "french open", "wimbledon", "us open")
SURFACE_HINTS = {"roland garros": "Clay", "french open": "Clay", "wimbledon": "Grass", "queen": "Grass",
                 "halle": "Grass", "monte carlo": "Clay", "madrid": "Clay", "rome": "Clay",
                 "internazionali": "Clay", "barcelona": "Clay", "hamburg": "Clay", "finals": "Hard",
                 "australian open": "Hard", "us open": "Hard", "paris": "Hard", "vienna": "Hard",
                 "basel": "Hard", "stuttgart": "Grass", "eastbourne": "Grass", "s-hertogenbosch": "Grass"}


def _results(tour, today, status):
    out = []
    for y in (today.year - 2, today.year - 1, today.year):
        path = CACHE / "tennis" / f"{tour}_{y}.json"
        rows = store.load(path)
        if rows is None or y == today.year:
            fresh = tennisdata.year(tour, y)
            if fresh:
                store.save(path, fresh)
                rows = fresh
                status["tennis-data"] = "ok"
            elif rows is None:
                rows = []
        out.extend(rows)
    return sorted(out, key=lambda m: m["date"])


def _surface(tournament, results, today):
    words = [w for w in re.findall(r"[a-z]{4,}", (tournament or "").lower())
             if w not in ("open", "championships", "atp", "wta", "tour", "masters", "international", "presented")]
    recent = [m for m in results if m["date"] >= (today - timedelta(days=21)).isoformat()]
    for m in reversed(recent):
        hay = (m["tournament"] + " " + m["location"]).lower()
        if any(w in hay for w in words):
            return m["surface"]
    t = (tournament or "").lower()
    for k, v in SURFACE_HINTS.items():
        if k in t:
            return v
    return "Hard"


def _name_index(results):
    idx = defaultdict(set)
    last_only = defaultdict(set)
    for m in results[-6000:]:
        for n in (m["w"], m["l"]):
            k = person_key(n)
            idx[k].add(n)
            last_only[k.split(" ")[0]].add(n)
    return idx, last_only


def _match_name(name, idx, last_only):
    k = person_key(name)
    if len(idx.get(k, ())) == 1:
        return next(iter(idx[k]))
    for tok in reversed(name.split()):  # nomi asiatici o ordine diverso
        cand = last_only.get(re.sub(r"[^a-z]", "", tok.lower()))
        if cand and len(cand) == 1:
            return next(iter(cand))
    return None


def build(today: date):
    index, reliability, status_all = [], {}, {}
    now = datetime.now(timezone.utc)
    for tour in ("atp", "wta"):
        status = {}
        try:
            results = _results(tour, today, status)
            if not results:
                status_all[tour] = {**status, "errore": "nessun risultato disponibile"}
                continue
            sc = Scorer()
            score_from = (today - timedelta(days=365)).isoformat()
            elo = T.build_elo(results, scorer=sc, score_from=score_from)
            bt = sc.summary()
            reliability[tour] = {"name": tour.upper(), "win": bt}
            idx, last_only = _name_index(results)
            events = espn.scoreboard("tennis", tour, today, today + timedelta(days=config.DAYS_AHEAD["tennis"]))
            if not events:
                events = espn.scoreboard("tennis", tour, today)
            matches = espn.tennis_matches(events)
            status["espn"] = f"{len(matches)} incontri"
            todo = [m for m in matches if m["state"] == "pre"]
            unmatched = set()
            for m in todo:
                a_name, b_name = m["players"][0]["name"], m["players"][1]["name"]
                a, b = _match_name(a_name, idx, last_only), _match_name(b_name, idx, last_only)
                if not a:
                    unmatched.add(a_name)
                if not b:
                    unmatched.add(b_name)
                surface = _surface(m["tournament"], results, today)
                bo = 5 if tour == "atp" and any(s in (m["tournament"] or "").lower() for s in SLAMS) else 3
                pa = elo.prob(a or a_name, b or b_name, surface)
                mk = T.markets(pa, tour, surface, bo)
                pl_a = T.player_summary(results, a, surface, today.isoformat()) if a else {"name": a_name, "matches_known": 0}
                pl_b = T.player_summary(results, b, surface, today.isoformat()) if b else {"name": b_name, "matches_known": 0}
                pl_a["display"], pl_b["display"] = a_name, b_name
                pl_a["elo"] = round(elo.rating(a or a_name, surface))
                pl_b["elo"] = round(elo.rating(b or b_name, surface))
                detail = {
                    "id": f"tennis-{tour}-{m['id']}", "sport": "tennis", "league": tour,
                    "league_name": f"{tour.upper()} · {m['tournament']}", "tournament": m["tournament"],
                    "round": m.get("round"), "surface": surface, "date": m["date"],
                    "home": {"name": a_name}, "away": {"name": b_name},
                    "markets": mk, "players": {"home": pl_a, "away": pl_b},
                    "h2h": T.h2h(results, a, b) if a and b else {"n": 0},
                    "low_data": (pl_a.get("matches_known", 0) < 15 or pl_b.get("matches_known", 0) < 15),
                    "reliability": bt.get("grade"), "updated": now.isoformat(timespec="minutes"),
                }
                store.save(PUBLIC_DATA / "events" / f"{detail['id']}.json", detail)
                index.append({"id": detail["id"], "sport": "tennis", "league": tour,
                              "league_name": detail["league_name"], "date": m["date"],
                              "home": a_name, "away": b_name, "main": mk["win"], "main_labels": ["1", "2"],
                              "book": None, "extra": {f"Over {k}": v for k, v in list(mk["totals"].items())[3:4]},
                              "surface": surface})
            if unmatched:
                status["nomi_non_abbinati"] = sorted(unmatched)
            status["incontri_in_arrivo"] = len(todo)
            status_all[tour] = status
        except Exception as ex:
            log.exception("Tennis %s", tour)
            status_all[tour] = {**status, "errore": f"{type(ex).__name__}: {ex}"}
    return index, reliability, status_all
