"""Formula 1: Gran Premi dei prossimi giorni con probabilità per pilota, testa a testa, gomme e strategia,
meteo, circuito e classifiche. Fonti gratuite: Jolpica (risultati), OpenF1 (gomme, soste, safety car, colori),
Open-Meteo (previsioni), ESPN (diretta, dal telefono)."""
import logging
import statistics
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from . import store
from .config import CACHE, PUBLIC_DATA
from .models import f1 as F
from .models.common import r
from .sources import jolpica, openf1, openmeteo

log = logging.getLogger("f1")
SEASONS_BACK = 3          # 2023-2025 più quella in corso
AHEAD_DAYS = 21           # GP in elenco: quelli dei prossimi 21 giorni
KEEP_DAYS = 3
OPENF1_BUDGET = 48        # richieste a OpenF1 per giro (il resto al giro dopo: la cache resta)

GP_IT = {"Australian": "d'Australia", "Chinese": "di Cina", "Japanese": "del Giappone", "Bahrain": "del Bahrein", "Saudi Arabian": "d'Arabia Saudita",
         "Miami": "di Miami", "Emilia Romagna": "dell'Emilia-Romagna", "Monaco": "di Monaco", "Spanish": "di Spagna", "Barcelona-Catalunya": "di Barcellona",
         "Canadian": "del Canada", "Austrian": "d'Austria", "British": "di Gran Bretagna", "Belgian": "del Belgio", "Hungarian": "d'Ungheria",
         "Dutch": "d'Olanda", "Italian": "d'Italia", "Madrid": "di Madrid", "Azerbaijan": "dell'Azerbaigian", "Singapore": "di Singapore",
         "United States": "degli Stati Uniti", "Mexico City": "di Città del Messico", "São Paulo": "di San Paolo", "Brazilian": "del Brasile",
         "Las Vegas": "di Las Vegas", "Qatar": "del Qatar", "Abu Dhabi": "di Abu Dhabi"}
COUNTRY_IT = {"Australia": "Australia", "China": "Cina", "Japan": "Giappone", "Bahrain": "Bahrein", "Saudi Arabia": "Arabia Saudita", "USA": "Stati Uniti",
              "United States": "Stati Uniti", "Italy": "Italia", "Monaco": "Monaco", "Spain": "Spagna", "Canada": "Canada", "Austria": "Austria", "UK": "Regno Unito",
              "Belgium": "Belgio", "Hungary": "Ungheria", "Netherlands": "Olanda", "Azerbaijan": "Azerbaigian", "Singapore": "Singapore", "Mexico": "Messico",
              "Brazil": "Brasile", "Qatar": "Qatar", "UAE": "Emirati Arabi", "United Arab Emirates": "Emirati Arabi"}
FLAG = {"Australia": "🇦🇺", "China": "🇨🇳", "Japan": "🇯🇵", "Bahrain": "🇧🇭", "Saudi Arabia": "🇸🇦", "USA": "🇺🇸", "United States": "🇺🇸", "Italy": "🇮🇹",
        "Monaco": "🇲🇨", "Spain": "🇪🇸", "Canada": "🇨🇦", "Austria": "🇦🇹", "UK": "🇬🇧", "Belgium": "🇧🇪", "Hungary": "🇭🇺", "Netherlands": "🇳🇱",
        "Azerbaijan": "🇦🇿", "Singapore": "🇸🇬", "Mexico": "🇲🇽", "Brazil": "🇧🇷", "Qatar": "🇶🇦", "UAE": "🇦🇪", "United Arab Emirates": "🇦🇪"}
NAT_FLAG = {"British": "🇬🇧", "Dutch": "🇳🇱", "Monegasque": "🇲🇨", "Spanish": "🇪🇸", "Mexican": "🇲🇽", "Australian": "🇦🇺", "German": "🇩🇪", "French": "🇫🇷",
            "Italian": "🇮🇹", "Canadian": "🇨🇦", "Finnish": "🇫🇮", "Japanese": "🇯🇵", "Chinese": "🇨🇳", "Thai": "🇹🇭", "Danish": "🇩🇰", "American": "🇺🇸",
            "New Zealander": "🇳🇿", "Argentine": "🇦🇷", "Argentinian": "🇦🇷", "Brazilian": "🇧🇷", "Swiss": "🇨🇭", "Belgian": "🇧🇪", "Polish": "🇵🇱"}
TEAM_COLOR = {"mercedes": "#27F4D2", "ferrari": "#E8002D", "mclaren": "#FF8000", "red_bull": "#3671C6", "aston_martin": "#229971", "alpine": "#0093CC",
              "williams": "#64C4FF", "rb": "#6692FF", "racing_bulls": "#6692FF", "sauber": "#52E252", "audi": "#C1C6C8", "haas": "#B6BABD", "cadillac": "#B5A16B"}
SESSION_IT = {"FP1": "Prove libere 1", "FP2": "Prove libere 2", "FP3": "Prove libere 3", "SQ": "Qualifiche sprint", "Sprint": "Sprint", "Q": "Qualifiche", "Race": "Gara"}
COMPOUND_IT = {"SOFT": "Morbide", "MEDIUM": "Medie", "HARD": "Dure", "INTERMEDIATE": "Intermedie", "WET": "Da bagnato"}


def gp_name(race_name: str) -> str:
    base = race_name.replace(" Grand Prix", "")
    return f"GP {GP_IT[base]}" if base in GP_IT else f"GP {base}"


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()


def _last(name: str) -> str:
    """Cognome per le etichette ("Andrea Kimi Antonelli" -> "Antonelli", "Nyck de Vries" -> "de Vries")."""
    if not name:
        return name
    p = name.split(" ")
    if len(p) > 2 and p[-2].lower() in ("de", "van", "von", "di", "da", "del", "le", "la"):
        return " ".join(p[-2:])
    return p[-1]


def _openf1_races(years, status) -> list[dict]:
    """Sessioni di gara (e sprint) OpenF1 degli anni scelti."""
    out = []
    for y in years:
        for s in openf1.sessions(y) or []:
            if s.get("session_name") in ("Race", "Sprint") and not s.get("is_cancelled"):
                out.append(s)
    return out


def _match_sessions(sessions, gp, kind="Race") -> list[dict]:
    loc = _norm(gp.get("locality")), _norm(gp.get("country"))
    hit = [s for s in sessions if s.get("session_name") == kind and (_norm(s.get("location")) == loc[0] or _norm(s.get("circuit_short_name")) == loc[0])]
    if not hit:     # paese con un solo GP all'anno
        same = [s for s in sessions if s.get("session_name") == kind and _norm(s.get("country_name")) == loc[1]]
        if len({s["year"] for s in same}) == len(same):
            hit = same
    return sorted(hit, key=lambda s: s["date_start"])


def _strategy(datas: list[tuple[int, dict]]) -> dict | None:
    """Soste, mescole e lunghezza degli stint nelle edizioni passate (dai dati OpenF1)."""
    stops, seqs, stint_len, first_stop, sc = [], Counter(), defaultdict(list), [], []
    eds = []
    for year, d in datas:
        res = d.get("session_result") or []
        finishers = {x["driver_number"] for x in res if not (x.get("dnf") or x.get("dns") or x.get("dsq"))}
        by = defaultdict(list)
        for s in d.get("stints") or []:
            by[s["num"]].append(s)
        n_stops = []
        for num, st in by.items():
            if num not in finishers:
                continue
            st.sort(key=lambda s: s["n"])
            n_stops.append(len(st) - 1)
            seqs[" → ".join(COMPOUND_IT.get(s["c"] or "", s["c"] or "?") for s in st)] += 1
            for s in st:
                if s.get("from") and s.get("to") and s.get("c"):
                    stint_len[s["c"]].append(s["to"] - s["from"] + 1)
            if len(st) > 1 and st[0].get("to"):
                first_stop.append(st[0]["to"])
        sc_n = sum(1 for m in d.get("race_control") or [] if m.get("cat") == "SafetyCar" and "DEPLOYED" in (m.get("msg") or "").upper()
                   and "VIRTUAL" not in (m.get("msg") or "").upper())
        vsc_n = sum(1 for m in d.get("race_control") or [] if "VIRTUAL SAFETY CAR DEPLOYED" in (m.get("msg") or "").upper())
        red = any(m.get("flag") == "RED" for m in d.get("race_control") or [])
        wet = (d.get("weather") or {}).get("rain", 0) > 0
        temp = [t for t in (d.get("weather") or {}).get("track") or [] if t is not None]
        sc.append(sc_n > 0)
        stops += n_stops
        eds.append({"season": year, "sc": sc_n, "vsc": vsc_n, "red": red, "wet": wet, "stops": r(statistics.mean(n_stops), 1) if n_stops else None,
                    "track_temp": r(statistics.mean(temp), 1) if temp else None})
    if not eds:
        return None
    dist = Counter(min(x, 3) for x in stops)
    tot = sum(dist.values()) or 1
    return {"editions": sorted(eds, key=lambda e: -e["season"]),
            "stops": {"1": r(dist[1] / tot, 3), "2": r(dist[2] / tot, 3), "3+": r(dist[3] / tot, 3), "0": r(dist[0] / tot, 3)},
            "stops_avg": r(statistics.mean(stops), 2) if stops else None,
            "sequences": [[k, v] for k, v in seqs.most_common(5)],
            "stint": {COMPOUND_IT.get(c, c): {"avg": r(statistics.mean(v), 1), "max": max(v)} for c, v in stint_len.items() if len(v) >= 3},
            "first_stop": [min(first_stop), int(statistics.median(first_stop)), max(first_stop)] if first_stop else None,
            "sc_rate": r((sum(sc) + 0.6 * 2) / (len(sc) + 2), 3)}


def _weather(gp, fc) -> dict | None:
    if not fc:
        return None
    times = fc["time"]
    out = {}
    for k, iso in gp["sessions"].items():
        key = iso[:13] + ":00"
        if key not in times:
            continue
        i = times.index(key)
        sl = slice(i, min(i + 2, len(times)))         # la sessione dura circa due ore
        pp = [x for x in fc["precipitation_probability"][sl] if x is not None]
        out[k] = {"temp": fc["temperature_2m"][i], "rain_p": max(pp) / 100 if pp else None, "rain_mm": sum(x or 0 for x in fc["precipitation"][sl]),
                  "wind": fc["wind_speed_10m"][i], "cloud": fc["cloud_cover"][i]}
    return out or None


def build(today: date):
    status, index = {}, []
    now = datetime.now(timezone.utc)
    year = today.year
    sched = jolpica.schedule(year)
    upcoming = [g for g in sched if g["sessions"]["Race"] >= (now - timedelta(days=KEEP_DAYS)).isoformat()[:16]]
    if not upcoming:                                       # pausa invernale: guarda la stagione dopo
        nxt = jolpica.schedule(year + 1)
        if nxt:
            sched, year, upcoming = nxt, year + 1, nxt
    upcoming = [g for g in upcoming if g["sessions"]["Race"] <= (now + timedelta(days=AHEAD_DAYS)).isoformat()[:16]]
    status["gp_in_arrivo"] = len(upcoming)

    races = []
    for y in range(year - SEASONS_BACK, year + 1):
        races += jolpica.season(y, completed=y < year, status=status)["races"]
    races = [x for x in races if x["results"]]
    status["gare_in_storico"] = len(races)
    if not races:
        return [], {}, status

    # parametri del modello scelti sulle gare della stagione (ricalcolati solo quando c'è una gara nuova)
    bt_path = CACHE / "f1" / "backtest.json"
    cur_n = sum(1 for x in races if x["season"] == year)
    bt = store.load(bt_path) or {}
    if bt.get("races") != cur_n or bt.get("version") != 1:
        try:
            bt = {**F.backtest(races, seasons=(year,) if cur_n >= 8 else (year - 1, year)), "races": cur_n, "version": 1}
            store.save(bt_path, bt)
        except Exception:
            log.exception("Verifica F1")
            bt = {"scale": 4.0, "half_life": 8.0}
    scale, hl = bt.get("scale", 4.0), bt.get("half_life", 8.0)
    status["modello"] = {k: bt.get(k) for k in ("n", "scale", "half_life", "logloss_winner", "logloss_uniform", "brier_podium")}

    R, team_r, dnf_rate = F.ratings(races, half_life=hl)
    cur_races = [x for x in races if x["season"] == year] or races[-1:]
    last_race = max(races, key=lambda x: (x["season"], x["round"]))
    stand = jolpica.standings(year) if cur_races else {"drivers": [], "teams": []}

    # OpenF1: colori delle squadre e dati delle edizioni passate (con un tetto di richieste per giro)
    budget = [OPENF1_BUDGET]
    of_sessions = _openf1_races(range(year - SEASONS_BACK, year + 1), status)
    colors, num_of = dict(TEAM_COLOR), {}
    last_of = sorted([s for s in of_sessions if s["session_name"] == "Race" and s["date_end"] < now.isoformat()], key=lambda s: s["date_start"])
    if last_of:
        d = openf1.session_data(last_of[-1]["session_key"], budget)
        for x in (d or {}).get("drivers") or []:
            if x.get("colour"):
                num_of[x["code"]] = x
    team_names = {}
    for x in last_race["results"]:
        team_names[x["team"]] = x.get("team_name") or x["team"]
        c = (num_of.get(x["code"]) or {}).get("colour")
        if c:
            colors[x["team"]] = "#" + c.lstrip("#")

    # pagina classifiche e profili dei piloti (anche fuori dai weekend di gara)
    drivers_info = {}
    for x in races:
        for y in x["results"]:
            drivers_info[y["id"]] = {"id": y["id"], "name": y["name"], "code": y["code"], "num": y["num"], "nat": y.get("nat"),
                                     "flag": NAT_FLAG.get(y.get("nat") or ""), "team": y["team"], "team_name": y.get("team_name")}
    _profiles(races, year, stand, drivers_info, colors, R)

    for gp in upcoming:
        try:
            ev = _gp_event(gp, year, races, R, team_r, dnf_rate, scale, colors, team_names, drivers_info, of_sessions, budget, stand, bt, status)
            if ev:
                index.append(ev)
        except Exception:
            log.exception("GP %s", gp.get("name"))
            status[f"gp_{gp['round']}"] = "errore"
    status["openf1_richieste"] = OPENF1_BUDGET - budget[0]
    rel = {"f1": {"name": "Formula 1", "n": bt.get("n"), "logloss_winner": bt.get("logloss_winner"), "logloss_uniform": bt.get("logloss_uniform"),
                  "brier_podium": bt.get("brier_podium")}}
    return index, rel, status


def _profiles(races, year, stand, info, colors, R):
    cur = [x for x in races if x["season"] == year]
    per = defaultdict(lambda: {"starts": 0, "wins": 0, "podiums": 0, "points": 0.0, "dnf": 0, "poles": 0, "fin": [], "q": [], "last": []})
    for x in sorted(cur, key=lambda x: x["round"]):
        qpos = {q["id"]: q["pos"] for q in x.get("quali") or []}
        for y in x["results"]:
            p = per[y["id"]]
            p["starts"] += 1
            p["points"] += y["points"]
            if y["classified"]:
                p["fin"].append(y["pos"])
                p["wins"] += y["pos"] == 1
                p["podiums"] += y["pos"] <= 3
            else:
                p["dnf"] += 1
            if qpos.get(y["id"]):
                p["q"].append(qpos[y["id"]])
                p["poles"] += qpos[y["id"]] == 1
            p["last"].append({"r": x["round"], "gp": gp_name(x["name"]), "pos": y["pos"] if y["classified"] else None, "grid": y["grid"], "st": y["status"]})
    # compagni di squadra: chi è arrivato davanti (gara) e chi ha fatto meglio in qualifica
    mates = {}
    for x in cur:
        by_team = defaultdict(list)
        for y in x["results"]:
            by_team[y["team"]].append(y)
        q = {qq["id"]: qq["pos"] for qq in x.get("quali") or []}
        for t, ys in by_team.items():
            if len(ys) != 2:
                continue
            a, b = ys
            for me, ot in ((a, b), (b, a)):
                m = mates.setdefault(me["id"], {"mate": ot["id"], "race": [0, 0], "quali": [0, 0]})
                if m["mate"] != ot["id"]:
                    continue
                m["race"][0 if me["pos"] < ot["pos"] else 1] += 1
                if q.get(me["id"]) and q.get(ot["id"]):
                    m["quali"][0 if q[me["id"]] < q[ot["id"]] else 1] += 1
    drivers = []
    for s in stand["drivers"]:
        p = per.get(s["id"], per.default_factory())
        i = info.get(s["id"], {})
        drivers.append({**{k: i.get(k) for k in ("id", "name", "code", "num", "nat", "flag")}, "id": s["id"], "name": s["name"],
                        "team": s["team"], "team_name": s["team_name"], "color": colors.get(s["team"]), "pos": s["pos"], "points": s["points"],
                        "wins": s["wins"], "podiums": p["podiums"], "poles": p["poles"], "starts": p["starts"], "dnf": p["dnf"],
                        "avg_fin": r(statistics.mean(p["fin"]), 1) if p["fin"] else None, "avg_q": r(statistics.mean(p["q"]), 1) if p["q"] else None,
                        "last": p["last"][-10:][::-1], "mate": mates.get(s["id"]), "rating": r(R.get(s["id"], {}).get("race"), 3)})
    teams = [{**t, "color": colors.get(t["id"])} for t in stand["teams"]]
    store.save(PUBLIC_DATA / "leagues" / "f1.json", {"key": "f1", "name": "Formula 1", "sport": "f1", "season": year,
                                                      "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
                                                      "drivers": drivers, "teams": teams, "table": []})


def _final(done) -> dict:
    res = done["results"]
    q1 = next((q for q in done.get("quali") or [] if q["pos"] == 1), None)
    return {"order": [y["id"] for y in res], "names": [_last(y["name"]) for y in res], "winner": res[0]["name"],
            "podium": [_last(y["name"]) for y in res[:3]], "pole": q1["name"] if q1 else None, "pole_s": _last(q1["name"]) if q1 else None,
            "fl": next((y["name"] for y in res if y.get("fl_rank") == 1), None), "dnf": [y["id"] for y in res if not y["classified"]], "st": "Finita"}


def _index_entry(d) -> dict:
    top, G = d["drivers"][:3], d["gp"]
    return {"id": d["id"], "sport": "f1", "league": "f1", "league_name": "Formula 1", "date": d["date"], "time_valid": True,
            "home": G["name"], "away": G["locality"], "home_flag": G.get("flag"), "main": [x["win"] for x in top],
            "f1": {"round": G["round"], "circuit": G["circuit"], "top": [[x["short"], x["code"], x["color"], x["win"], x["podium"]] for x in top],
                   "quali_done": G.get("quali_done"), "rain": d.get("rain"), "sessions": G["sessions"]},
            **({"final": d["final"]} if d.get("final") else {})}


def _gp_event(gp, year, races, R, team_r, dnf_rate, scale, colors, team_names, info, of_sessions, budget, stand, bt, status):
    rnd = gp["round"]
    eid = f"f1-{year}-{rnd:02d}"
    race_iso = gp["sessions"]["Race"]
    done = next((x for x in races if x["season"] == year and x["round"] == rnd), None)
    cur = sorted([x for x in races if x["season"] == year], key=lambda x: x["round"])
    base = cur[-1] if cur else max(races, key=lambda x: (x["season"], x["round"]))
    if done:
        # GP concluso: resta il pronostico di prima del via (file già scritto), con il risultato accanto
        old = store.load(PUBLIC_DATA / "events" / f"{eid}.json")
        if old and old.get("drivers"):
            if not old.get("final"):
                old["final"] = _final(done)
                store.save(PUBLIC_DATA / "events" / f"{eid}.json", old)
            return _index_entry(old)
        # niente file di prima: rifaccio la stima senza questa gara
        races = [x for x in races if (x["season"], x["round"]) < (year, rnd)]
        R, team_r, dnf_rate = F.ratings(races, half_life=bt.get("half_life", 8.0))
    # chi corre: la griglia se le qualifiche sono fatte, altrimenti i piloti dell'ultimo GP
    quali = [] if done else jolpica.quali_for(year, rnd)
    if quali:
        entrants = [{"id": q["id"], "team": q["team"]} for q in quali]
        grid = {q["id"]: q["pos"] for q in quali}
    else:
        entrants = [{"id": y["id"], "team": y["team"]} for y in base["results"]]
        grid = None
    prof = F.circuit_profile(races, gp["circuit"])
    fc = openmeteo.forecast(gp["lat"], gp["lon"]) if not done else None
    wx = _weather(gp, fc)
    rain = (wx or {}).get("Race", {}).get("rain_p") or 0.0
    sim = F.simulate(entrants, R, team_r, dnf_rate, prof, scale, grid=grid, rain=rain if rain >= 0.3 else 0.0)
    # sprint (se in programma e non ancora corsa)
    sprint = None
    if "Sprint" in gp["sessions"] and not (done and done.get("sprint")):
        ss = F.simulate(entrants, R, team_r, dnf_rate, {**prof, "dnf_factor": prof["dnf_factor"] * 0.5}, scale * 0.95, sims=8000, with_h2h=False)
        sprint = [{"id": x["id"], "win": r(x["win"], 3), "top3": r(x["podium"], 3), "top8": r(x["top8"], 3)} for x in ss["drivers"]]
    # edizioni passate: gomme, soste, safety car (OpenF1)
    past = [s for s in _match_sessions(of_sessions, gp) if s["date_end"] < race_iso.replace("Z", "")]
    datas = []
    for s in past[-3:]:
        d = openf1.session_data(s["session_key"], budget)
        if d:
            datas.append((s["year"], d))
    strat = _strategy(datas)
    # soste ai box per squadra nella stagione (dalle gare già in cache: si completa giro dopo giro)
    pit = defaultdict(list)
    for s in [s for s in of_sessions if s["session_name"] == "Race" and s["year"] == year and s["date_end"] < datetime.now(timezone.utc).isoformat()][-8:]:
        d = openf1.session_data(s["session_key"], budget)
        if not d:
            continue
        team_of = {x["num"]: x["team"] for x in d.get("drivers") or []}
        for p in d.get("pit") or []:
            if p.get("stop") and 1.6 < p["stop"] < 6:
                pit[team_of.get(p["num"])].append(p["stop"])
    pit_rows = sorted([{"team": t, "avg": r(statistics.mean(v), 2), "best": r(min(v), 2), "n": len(v)} for t, v in pit.items() if t and len(v) >= 4],
                      key=lambda x: x["avg"])
    st_pos = {d["id"]: d for d in stand["drivers"]}
    drivers = []
    for k, (e, x) in enumerate(zip(entrants, sim["drivers"])):
        i = info.get(e["id"], {"id": e["id"], "name": e["id"], "code": e["id"][:3].upper()})
        s = st_pos.get(e["id"], {})
        form = [y for y in reversed(cur) for y in [next((z for z in y["results"] if z["id"] == e["id"]), None)] if y][:6]
        drivers.append({"id": e["id"], "name": i["name"], "short": _last(i["name"]), "code": i.get("code"), "num": i.get("num"), "flag": i.get("flag"),
                        "team": e["team"], "team_name": team_names.get(e["team"], e["team"]), "color": colors.get(e["team"], "#888888"),
                        "grid": grid.get(e["id"]) if grid else None, "champ_pos": s.get("pos"), "points": s.get("points"),
                        "win": r(x["win"], 4), "podium": r(x["podium"], 3), "top6": r(x["top6"], 3), "top10": r(x["top10"], 3), "dnf": r(x["dnf"], 3),
                        "pole": r(x["pole"], 3) if not grid else None, "fl": r(x["fl"], 3), "exp_pos": r(x["exp_pos"], 1),
                        "rating": r(R.get(e["id"], {}).get("race"), 3), "form": [z["pos"] if z["classified"] else None for z in form],
                        "circuit": F.driver_circuit(races, gp["circuit"], e["id"])})
    order = sorted(range(len(drivers)), key=lambda k: -drivers[k]["win"])
    drivers = [drivers[k] for k in order]
    h2h = [[r(float(sim["h2h"][a][b]), 3) for b in order] for a in order]
    teams = sorted([{"team": t, "name": team_names.get(t, t), "color": colors.get(t), "win": r(p, 3)} for t, p in sim["team_win"].items()], key=lambda x: -x["win"])
    name = gp_name(gp["name"])
    final = _final(done) if done else None
    d = {"id": eid, "sport": "f1", "league": "f1", "league_name": "Formula 1", "date": race_iso, "time_valid": True,
         "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
         "home": {"name": name, "short": name, "flag": FLAG.get(gp["country"])}, "away": {"name": gp["circuit_name"], "short": gp["locality"]},
         "gp": {"round": rnd, "season": year, "name": name, "official": gp["name"], "circuit": gp["circuit_name"], "locality": gp["locality"],
                "country": COUNTRY_IT.get(gp["country"], gp["country"]), "flag": FLAG.get(gp["country"]),
                "sessions": [{"k": k, "name": SESSION_IT.get(k, k), "date": v} for k, v in sorted(gp["sessions"].items(), key=lambda kv: kv[1])],
                "quali_done": bool(quali), "sprint": "Sprint" in gp["sessions"]},
         "drivers": drivers, "h2h": h2h, "teams": teams, "sprint": sprint, "circuit": prof, "strategy": strat, "pit": pit_rows,
         "weather": wx, "rain": r(rain, 2), "model": {k: bt.get(k) for k in ("n", "logloss_winner", "logloss_uniform", "brier_podium")},
         "markets": {"win": [x["win"] for x in drivers[:3]], "sc": (strat or {}).get("sc_rate")}, "final": final}
    store.save(PUBLIC_DATA / "events" / f"{eid}.json", d)
    return _index_entry(d)
