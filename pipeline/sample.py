"""Dati di ESEMPIO (inventati) per provare il sito e i modelli senza rete.
Sostituisce le fonti con generatori casuali e lancia la pipeline vera.
Uso: python -m pipeline.sample   — il sito mostrerà l'avviso "dati di esempio"."""
import math
from collections import defaultdict
import random
import shutil
from datetime import date, datetime, timedelta, timezone

import numpy as np

from . import config, photos, store
from .config import CACHE, PUBLIC_DATA, SOCCER_LEAGUES
from .sources import espn, footballdata, understat

rng = np.random.default_rng(7)
random.seed(7)

TEAMS = {
    "I1": ["Inter", "Napoli", "Milan", "Juventus", "Atalanta", "Roma", "Lazio", "Fiorentina", "Bologna", "Como",
           "Torino", "Udinese", "Genoa", "Verona", "Cagliari", "Lecce", "Parma", "Sassuolo", "Pisa", "Cremonese"],
    "E0": ["Liverpool", "Arsenal", "Man City", "Chelsea", "Newcastle", "Tottenham", "Aston Villa", "Man United",
           "Brighton", "Nott'm Forest", "Bournemouth", "Brentford", "Fulham", "Crystal Palace", "Everton",
           "West Ham", "Wolves", "Leeds", "Burnley", "Sunderland"],
    "SP1": ["Real Madrid", "Barcelona", "Ath Madrid", "Ath Bilbao", "Villarreal", "Betis", "Sociedad", "Celta",
            "Sevilla", "Girona", "Valencia", "Osasuna", "Getafe", "Mallorca", "Vallecano", "Espanol", "Alaves",
            "Elche", "Levante", "Oviedo"],
    "D1": ["Bayern Munich", "Leverkusen", "Dortmund", "RB Leipzig", "Ein Frankfurt", "Stuttgart", "Freiburg",
           "Wolfsburg", "M'gladbach", "Mainz", "Hoffenheim", "Werder Bremen", "Augsburg", "Union Berlin",
           "St Pauli", "Heidenheim", "Hamburg", "FC Koln"],
    "F1": ["Paris SG", "Marseille", "Monaco", "Lille", "Lyon", "Nice", "Lens", "Rennes", "Strasbourg", "Brest",
           "Toulouse", "Nantes", "Auxerre", "Angers", "Le Havre", "Lorient", "Metz", "Paris FC"],
}
ESPN_NAMES = {"Inter": "Internazionale", "Milan": "AC Milan", "Roma": "AS Roma", "Verona": "Hellas Verona",
              "Man City": "Manchester City", "Man United": "Manchester United", "Newcastle": "Newcastle United",
              "Nott'm Forest": "Nottingham Forest", "Wolves": "Wolverhampton Wanderers", "Tottenham": "Tottenham Hotspur",
              "West Ham": "West Ham United", "Brighton": "Brighton & Hove Albion", "Leeds": "Leeds United",
              "Ath Madrid": "Atlético Madrid", "Ath Bilbao": "Athletic Club", "Betis": "Real Betis",
              "Sociedad": "Real Sociedad", "Celta": "Celta Vigo", "Vallecano": "Rayo Vallecano", "Espanol": "Espanyol",
              "Alaves": "Alavés", "Oviedo": "Real Oviedo", "Dortmund": "Borussia Dortmund",
              "Leverkusen": "Bayer Leverkusen", "Ein Frankfurt": "Eintracht Frankfurt",
              "M'gladbach": "Borussia Mönchengladbach", "Stuttgart": "VfB Stuttgart", "Freiburg": "SC Freiburg",
              "Wolfsburg": "VfL Wolfsburg", "Hoffenheim": "TSG Hoffenheim", "Augsburg": "FC Augsburg",
              "Union Berlin": "1. FC Union Berlin", "St Pauli": "St. Pauli", "Heidenheim": "1. FC Heidenheim 1846",
              "Hamburg": "Hamburger SV", "FC Koln": "1. FC Köln", "Paris SG": "Paris Saint-Germain",
              "Marseille": "Olympique de Marseille", "Monaco": "AS Monaco", "Rennes": "Stade Rennais",
              "Brest": "Stade Brestois 29", "Lens": "RC Lens", "Nice": "OGC Nice"}
FIRST = ["Marco", "Luca", "Kevin", "Diego", "Lukas", "Jonas", "Pierre", "Hugo", "Alvaro", "Pedro", "Tom", "Ben",
         "Nico", "Federico", "Mattia", "Leon", "Theo", "Rafa", "Jamie", "Ollie", "Dusan", "Ivan", "Sergio", "Ruben"]
LAST = ["Rossi", "Bianchi", "Muller", "Schmidt", "Martin", "Bernard", "Garcia", "Lopez", "Smith", "Walker",
        "Novak", "Silva", "Costa", "Ferrari", "Romano", "Weber", "Moreau", "Ruiz", "Taylor", "Moretti", "Galli",
        "Kovac", "Dubois", "Fischer", "Hughes", "Esposito", "Conti", "Navarro", "Sanchez", "Brown"]


def _strength(n):
    att = np.exp(rng.normal(0, 0.28, n)); dfn = np.exp(rng.normal(0, 0.24, n))
    order = np.argsort(-(att / dfn))
    return att[order], dfn[order]


SOCCER = {}


def _gen_soccer():
    today = config.today()
    sy = config.soccer_season_start_year(today)
    eid = 700000
    cities = ["Porto Alto", "Vila Nova", "Riverside", "Lakeview", "Kita", "Minato", "Fjord", "Nordby", "Sandvik",
              "Hillcrest", "Eastport", "Westfield", "Bayside", "Kawa", "Yama", "Stavby", "Brookton", "Fairhaven"]
    for key, lg in SOCCER_LEAGUES.items():
        teams = TEAMS.get(lg.get("fd")) or [f"{c} {lg['country'][:3]}" for c in cities]
        n = len(teams)
        att, dfn = _strength(n)
        seasons, events, players, boxes = {}, [], {}, {}
        for ti, t in enumerate(teams):
            players[t] = []
            for k in range(20):
                pos = "G" if k == 0 else ("D" if k < 7 else ("M" if k < 13 else "F"))
                skill = {"G": 0.0, "D": 0.06, "M": 0.2, "F": 0.5}[pos] * math.exp(rng.normal(0, 0.5))
                players[t].append({"pid": str(10000 * (ti + 1) + k + hash(key) % 997 * 100),
                                   "name": f"{random.choice(FIRST)} {random.choice(LAST)}", "pos": pos, "skill": skill})
        for y in (sy - 2, sy - 1, sy):
            rounds = []
            for rnd in range(2 * (n - 1)):
                order = list(range(n))
                random.shuffle(order)
                rounds.append([(order[i], order[i + 1]) for i in range(0, n, 2)])
            start = date(y, 8, 23)
            rows = []
            for ri, rd in enumerate(rounds):
                d = start + timedelta(days=7 * ri + (14 if ri > 18 else 0))
                for h, a in rd:
                    dd = d + timedelta(days=random.choice([0, 0, 1, 1, 2]))
                    lh = 1.38 * 1.15 * att[h] * dfn[a]; la = 1.38 / 1.15 * att[a] * dfn[h]
                    eid += 1
                    ev_date = datetime(dd.year, dd.month, dd.day, random.choice([12, 15, 18, 19]), random.choice([0, 30, 45]), tzinfo=timezone.utc)
                    played = dd < today
                    if y == sy:
                        events.append({"id": str(eid), "date": ev_date.isoformat().replace("+00:00", "Z"),
                                       "state": "post" if played else "pre", "completed": played,
                                       "status": "FT" if played else "Programmata",
                                       "home": {"id": str(100 + h), "name": ESPN_NAMES.get(teams[h], teams[h]), "short": teams[h], "abbr": teams[h][:3].upper(), "score": None, "color": "#%06x" % random.randint(0x202020, 0xd0d0d0), "alt": "#ffffff"},
                                       "away": {"id": str(100 + a), "name": ESPN_NAMES.get(teams[a], teams[a]), "short": teams[a], "abbr": teams[a][:3].upper(), "score": None, "color": "#%06x" % random.randint(0x202020, 0xd0d0d0), "alt": "#ffffff"},
                                       "season_type": 1, "venue": f"Stadio {teams[h]}"})
                    if not played:
                        continue
                    hg, ag = int(rng.poisson(lh)), int(rng.poisson(la))
                    if y == sy:
                        events[-1]["home"]["score"], events[-1]["away"]["score"] = hg, ag
                        boxes[str(eid)] = {"date": dd.isoformat(), "lines": _soccer_box(players, teams, h, a, hg, ag)}
                    p = _probs(lh, la)
                    m = {"date": dd.isoformat(), "time": "15:00", "home": teams[h], "away": teams[a],
                         "hg": float(hg), "ag": float(ag), "hhg": float(rng.binomial(hg, 0.45)), "hag": float(rng.binomial(ag, 0.45)),
                         "hs": float(rng.poisson(12 * att[h])), "as": float(rng.poisson(10 * att[a])),
                         "hst": float(rng.poisson(4.4 * att[h])), "ast": float(rng.poisson(3.6 * att[a])),
                         "hc": float(rng.poisson(5.4 * att[h] ** 0.5)), "ac": float(rng.poisson(4.5 * att[a] ** 0.5)),
                         "hy": float(rng.poisson(1.9)), "ay": float(rng.poisson(2.2)), "hr": 0.0, "ar": 0.0,
                         "hf": float(rng.poisson(12)), "af": float(rng.poisson(12.5)),
                         "o1x2": [round(1 / (x * 1.05), 2) for x in p[:3]], "oou25": [round(1 / (p[3] * 1.05), 2), round(1 / ((1 - p[3]) * 1.05), 2)]}
                    rows.append(m)
            seasons[config.fd_season_code(y)] = rows
        SOCCER[lg.get("fd") or key] = {"seasons": seasons, "events": events, "boxes": boxes, "espn": lg["espn"],
                                       "fdnew": lg.get("fdnew"), "power": {ESPN_NAMES.get(t, t): (att[i], dfn[i]) for i, t in enumerate(teams)},
                                       "fdname": {ESPN_NAMES.get(t, t): t for t in teams},
                                       "level": {"I1": 1, "E0": 1.05, "SP1": 1, "D1": .98, "F1": .95, "P1": .85}.get(lg.get("fd"), .8)}
    _gen_cups(today, sy)


CUPS_FAKE = {}


def _gen_cups(today, sy):
    """Coppe inventate: squadre dei campionati europei di esempio, forza relativa al livello del campionato."""
    pool = []
    for code, s in SOCCER.items():
        if code in ("I1", "E0", "SP1", "D1", "F1", "P1"):
            for name, (a, d) in s["power"].items():
                pool.append((name, a * s["level"], d / s["level"], code))
    eid = 900000
    for cup in ("uefa.champions", "uefa.europa", "uefa.europa.conf"):
        evs = []
        d = date(sy - 1, 9, 16)
        while d <= today + timedelta(days=14):
            if 9 <= d.month or d.month <= 5:
                random.shuffle(pool)
                for k in range(0, 16, 2):
                    (hn, ha, hd, _), (an, aa, ad, _) = pool[k], pool[k + 1]
                    eid += 1
                    played = d < today
                    lh, la = 1.35 * 1.12 * ha * ad, 1.35 / 1.12 * aa * hd
                    hg, ag = (int(rng.poisson(lh)), int(rng.poisson(la))) if played else (None, None)
                    p = _probs(lh, la)
                    evs.append({"id": str(eid), "date": f"{d.isoformat()}T20:00Z", "state": "post" if played else "pre",
                                "completed": played, "status": "",
                                "home": {"id": str(eid) + "h", "name": hn, "short": hn, "abbr": hn[:3].upper(), "score": hg, "color": "#1d3a8a", "alt": "#ffffff"},
                                "away": {"id": str(eid) + "a", "name": an, "short": an, "abbr": an[:3].upper(), "score": ag, "color": "#8a1d2b", "alt": "#ffffff"},
                                "season_type": 1, "venue": f"Stadio {hn}",
                                "odds": {"provider": "Esempio", "p_home": p[0], "p_draw": p[1], "p_away": p[2], "total": 2.5,
                                         "p_over": p[3], "p_under": 1 - p[3]}})
            d += timedelta(days=7 if d.weekday() == 1 else 1)
            while d.weekday() not in (1, 2):
                d += timedelta(days=1)
        CUPS_FAKE[cup] = evs
    women = [f"{c} Women" for c in ("Lyon", "Barcelona", "Chelsea", "Wolfsburg", "Arsenal", "Bayern", "Roma", "PSG",
                                    "Juventus", "Real Madrid", "Benfica", "Twente", "Hacken", "Brann", "Manchester City", "Celtic")]
    pw = {w: float(np.exp(rng.normal(0, .45))) for w in women}
    evs, d = [], date(sy - 2, 10, 1)
    while d <= today + timedelta(days=14):
        if 10 <= d.month or d.month <= 5:
            random.shuffle(women)
            for k in range(0, 8, 2):
                h, a = women[k], women[k + 1]
                eid += 1
                played = d < today
                lh, la = 1.5 * pw[h] / pw[a] ** .5, 1.3 * pw[a] / pw[h] ** .5
                evs.append({"id": str(eid), "date": f"{d.isoformat()}T18:45Z", "state": "post" if played else "pre", "completed": played,
                            "status": "", "season_type": 1, "venue": "",
                            "home": {"id": h, "name": h, "short": h, "abbr": h[:3].upper(), "score": int(rng.poisson(lh)) if played else None, "color": "#5b2a86", "alt": "#ffffff"},
                            "away": {"id": a, "name": a, "short": a, "abbr": a[:3].upper(), "score": int(rng.poisson(la)) if played else None, "color": "#0f6e56", "alt": "#ffffff"}})
        d += timedelta(days=7)
    CUPS_FAKE["uefa.wchampions"] = evs
    _gen_national(today)


NATIONS = {"Italy": ("ITA", 1.5), "France": ("FRA", 1.8), "Belgium": ("BEL", 1.4), "Turkey": ("TUR", 1.2), "England": ("ENG", 1.7),
           "Spain": ("ESP", 1.9), "Croatia": ("CRO", 1.3), "Czech Republic": ("CZE", 1.1), "Germany": ("GER", 1.6),
           "Netherlands": ("NED", 1.5), "San Marino": ("SMR", 0.25), "Argentina": ("ARG", 1.9), "Brazil": ("BRA", 1.7),
           "Japan": ("JPN", 1.2), "Uruguay": ("URU", 1.3), "Wales": ("WAL", 0.9)}
NATIONAL_HIST = []


def _gen_national(today):
    """Storico e calendario inventati per le nazionali (nomi ESPN diversi per alcune, come nella realtà)."""
    names = list(NATIONS)
    espn_name = {"Czech Republic": "Czechia", "Turkey": "Türkiye"}
    d = date(today.year - 10, 3, 20)
    while d < today - timedelta(days=3):
        random.shuffle(names)
        for k in range(0, len(names), 2):
            h, a = names[k], names[k + 1]
            sh, sa = NATIONS[h][1], NATIONS[a][1]
            NATIONAL_HIST.append({"date": d.isoformat(), "home": h, "away": a, "hg": float(rng.poisson(1.1 * sh / sa ** .5)),
                                  "ag": float(rng.poisson(0.9 * sa / sh ** .5)), "neutral": False,
                                  "tournament": random.choice(["Friendly", "UEFA Nations League", "FIFA World Cup qualification"])})
        d += timedelta(days=45)
    eid = 950000
    fixtures = {"uefa.nations": [("Italy", "France"), ("England", "Croatia"), ("Czech Republic", "Spain"), ("Turkey", "Belgium"),
                                 ("Belgium", "Italy"), ("Germany", "Netherlands")],
                "fifa.friendly": [("Japan", "Brazil"), ("Argentina", "Uruguay"), ("Wales", "San Marino")]}
    for code, pairs in fixtures.items():
        evs = []
        for i, (h, a) in enumerate(pairs):
            eid += 1
            day = today + timedelta(days=1 + (i // 4) * 3)
            t = lambda n, side: {"id": f"{eid}{side}", "name": espn_name.get(n, n), "short": espn_name.get(n, n), "abbr": NATIONS[n][0],
                                 "score": None, "color": "#1d3a8a" if side == "h" else "#8a1d2b", "alt": "#ffffff",
                                 "logo": f"https://a.espncdn.com/i/teamlogos/countries/500/{NATIONS[n][0].lower()}.png"}
            evs.append({"id": str(eid), "date": f"{day.isoformat()}T19:45Z", "state": "pre", "completed": False, "status": "",
                        "season_type": 1, "venue": "", "neutral": False, "home": t(h, "h"), "away": t(a, "a"),
                        "odds": {"provider": "Esempio", "p_home": .45, "p_draw": .28, "p_away": .27, "total": 2.5, "p_over": .5, "p_under": .5}})
        CUPS_FAKE[code] = evs


def _probs(lh, la):
    from .models.soccer import score_matrix, p1x2
    M = score_matrix(lh, la)
    i, j = np.indices(M.shape)
    return (*p1x2(M), float(M[(i + j) > 2.5].sum()))


def _soccer_box(players, teams, h, a, hg, ag):
    lines = []
    for side, ti, goals in (("home", h, hg), ("away", a, ag)):
        squad = players[teams[ti]]
        starters = [squad[0]] + random.sample(squad[1:7], 4) + random.sample(squad[7:13], 3) + random.sample(squad[13:], 3)
        subs = random.sample([p for p in squad if p not in starters], 3)
        onfield = starters + subs
        w = np.array([p["skill"] * (1 if p in starters else 0.35) for p in onfield]) + 1e-6
        scorers = rng.choice(len(onfield), size=goals, p=w / w.sum()) if goals else []
        assists = rng.choice(len(onfield), size=goals, p=w / w.sum()) if goals else []
        for k, p in enumerate(onfield):
            g = int(sum(1 for s in scorers if s == k)); asst = int(sum(1 for s in assists if s == k))
            sh = g + int(rng.poisson(p["skill"] * 3 * (1 if p in starters else 0.35)))
            lines.append({"pid": p["pid"], "name": p["name"], "pos": p["pos"], "team": str(100 + ti), "side": side,
                          "start": p in starters, "sub": p in subs, "g": g, "a": asst, "sh": sh,
                          "sot": min(sh, g + int(rng.binomial(max(sh - g, 0), 0.3))),
                          "yc": int(rng.random() < 0.11), "rc": 0, "fc": int(rng.poisson(1)), "fs": int(rng.poisson(1)),
                          "sv": int(rng.poisson(3)) if p["pos"] == "G" else 0, "off": 0})
    return lines


# ----------------------------------------------------------------- NBA

NBA_TEAMS = [("Boston Celtics", "BOS"), ("New York Knicks", "NY"), ("Milwaukee Bucks", "MIL"), ("Cleveland Cavaliers", "CLE"),
             ("Orlando Magic", "ORL"), ("Indiana Pacers", "IND"), ("Philadelphia 76ers", "PHI"), ("Miami Heat", "MIA"),
             ("Atlanta Hawks", "ATL"), ("Chicago Bulls", "CHI"), ("Toronto Raptors", "TOR"), ("Brooklyn Nets", "BKN"),
             ("Charlotte Hornets", "CHA"), ("Detroit Pistons", "DET"), ("Washington Wizards", "WSH"),
             ("Oklahoma City Thunder", "OKC"), ("Denver Nuggets", "DEN"), ("Minnesota Timberwolves", "MIN"),
             ("Los Angeles Clippers", "LAC"), ("Dallas Mavericks", "DAL"), ("Phoenix Suns", "PHX"),
             ("New Orleans Pelicans", "NO"), ("Los Angeles Lakers", "LAL"), ("Sacramento Kings", "SAC"),
             ("Golden State Warriors", "GS"), ("Houston Rockets", "HOU"), ("Utah Jazz", "UTAH"),
             ("Memphis Grizzlies", "MEM"), ("San Antonio Spurs", "SA"), ("Portland Trail Blazers", "POR")]
NBA = {}
NBA_COLORS = ["#007a33", "#006bb6", "#00471b", "#860038", "#0077c0", "#002d62", "#006bb6", "#98002e", "#c8102e", "#ce1141",
              "#ce1141", "#000000", "#1d1160", "#c8102e", "#002b5c", "#007ac1", "#0e2240", "#0c2340", "#c8102e", "#00538c",
              "#1d1160", "#0c2340", "#552583", "#5a2d81", "#1d428a", "#ce1141", "#002b5c", "#5d76a9", "#c4ced4", "#e03a3e"]


def _gen_nba():
    today = config.today()
    sy = config.nba_season_start_year(today)
    off = rng.normal(0, 4, 30); dfn = rng.normal(0, 3.5, 30)
    roster = {}
    for t in range(30):
        roster[t] = [{"pid": str(5000 + t * 20 + k), "name": f"{random.choice(FIRST)} {random.choice(LAST)}",
                      "pos": random.choice(["G", "F", "C"]), "min": max(8, 36 - k * 2.6 + rng.normal(0, 2)),
                      "usage": max(0.4, 1.6 - k * 0.12 + rng.normal(0, 0.15)), "reb": rng.uniform(0.1, 0.35),
                      "ast": rng.uniform(0.05, 0.3), "tp": rng.uniform(0.02, 0.12)} for k in range(12)]
    gid = 401800000
    for y in (sy - 1, sy):
        games, box = [], {}
        d = date(y, 10, 21)
        end = date(y + 1, 4, 12)
        while d <= end:
            if y == sy and d > today + timedelta(days=5):
                break
            teams = list(range(30)); random.shuffle(teams)
            for k in range(0, random.choice([8, 10, 12, 14]), 2):
                h, a = teams[k], teams[k + 1]
                gid += 1
                hs_e = 114 + 2.2 + off[h] - dfn[a]; as_e = 114 + off[a] - dfn[h]
                played = d < today
                hs = int(round(hs_e + rng.normal(0, 11))) if played else None
                as_ = int(round(as_e + rng.normal(0, 11))) if played else None
                if played and hs == as_:
                    hs += 3
                ph = 1 / (1 + math.exp(-(hs_e - as_e) / 7.2))
                g = {"id": str(gid), "date": f"{d.isoformat()}T{random.choice(['00:00', '00:30', '01:00', '02:30', '03:00'])}Z",
                     "state": "post" if played else "pre", "home": str(h + 1), "away": str(a + 1),
                     "home_name": NBA_TEAMS[h][0], "away_name": NBA_TEAMS[a][0],
                     "home_abbr": NBA_TEAMS[h][1], "away_abbr": NBA_TEAMS[a][1], "home_color": NBA_COLORS[h], "away_color": NBA_COLORS[a],
                     "hs": hs, "as": as_,
                     "odds": {"provider": "Esempio", "total": round((hs_e + as_e) * 2) / 2, "spread": -round((hs_e - as_e) * 2) / 2,
                              "p_home": ph, "p_away": 1 - ph, "details": ""}}
                games.append(g)
                if played and y == sy:
                    box[g["id"]] = {"date": d.isoformat(), "lines": _nba_box(roster, h, hs) + _nba_box(roster, a, as_)}
            d += timedelta(days=1)
        NBA[y] = {"games": games, "box": box}


def _nba_box(roster, t, pts):
    lines = []
    mins = [max(0, p["min"] + rng.normal(0, 4)) for p in roster[t]]
    usage = np.array([p["usage"] * m for p, m in zip(roster[t], mins)])
    share = usage / usage.sum()
    for p, m, s in zip(roster[t], mins, share):
        if m < 3:
            continue
        pt = int(rng.poisson(max(pts * s, 0.1)))
        tpm = int(rng.poisson(p["tp"] * m)); tpa = tpm + int(rng.poisson(p["tp"] * m * 1.7))
        fgm = max(tpm, int(pt / 2.3)); fga = fgm + int(rng.poisson(fgm * 1.1 + 1))
        lines.append({"pid": p["pid"], "name": p["name"], "pos": p["pos"], "team": str(t + 1), "start": p["min"] > 26,
                      "min": round(m), "pts": pt, "reb": int(rng.poisson(p["reb"] * m)), "ast": int(rng.poisson(p["ast"] * m)),
                      "stl": int(rng.poisson(0.03 * m)), "blk": int(rng.poisson(0.02 * m)), "tov": int(rng.poisson(0.05 * m)),
                      "pf": int(rng.poisson(0.06 * m)), "fgm": fgm, "fga": fga, "tpm": tpm, "tpa": tpa, "ftm": 0, "fta": 0})
    return lines


# ----------------------------------------------------------------- tennis

TENNIS = {}


def _gen_tennis():
    """Incontri inventati nel formato restituito da espn.tennis_matches."""
    today = config.today()
    mid = 600000
    for tour, n in (("atp", 90), ("wta", 90)):
        skill = sorted(rng.normal(0, 1, n), reverse=True)
        names = []
        while len(names) < n:
            nm = f"{random.choice(FIRST)} {random.choice(LAST)}{random.choice(['', 'o', 'ic', 'er', 'ov'])}"
            if nm not in names:
                names.append(nm)
        surf_bonus = {nm: {s: rng.normal(0, 0.3) for s in ("Hard", "Clay", "Grass")} for nm in names}
        matches = []
        d = today - timedelta(days=740)
        while d < today:
            month = d.month
            tname = "Madrid Open" if month in (4, 5) else ("Halle Open" if month == 6 else "Hard Court Open")
            surface = "Clay" if month in (4, 5) else ("Grass" if month == 6 else "Hard")
            for _ in range(40):
                i, j = rng.choice(n, 2, replace=False)
                si = skill[i] + surf_bonus[names[i]][surface]; sj = skill[j] + surf_bonus[names[j]][surface]
                p = 1 / (1 + math.exp(-(si - sj) * 1.1))
                iw = rng.random() < p
                sets = [[6, int(rng.integers(0, 5))], [7 if rng.random() < 0.2 else 6, int(rng.integers(2, 6))]]
                if rng.random() < 0.3:
                    sets = [[6, 4], [int(rng.integers(3, 6)), 6], [6, int(rng.integers(1, 5))]]
                ws, ls = [x[0] for x in sets], [x[1] for x in sets]
                mid += 1
                dd = d + timedelta(days=int(rng.integers(0, 4)))
                matches.append({"id": str(mid), "date": f"{dd.isoformat()}T12:00Z", "time_valid": True,
                                "state": "post", "status_name": "STATUS_FINAL", "status": "Final",
                                "tournament": tname, "location": "Città", "major": False, "court": None,
                                "round": "1st Round", "best_of": 3,
                                "players": [{"id": "a", "name": names[i], "winner": bool(iw), "order": 1, "rank": int(i) + 1,
                                             "country": None, "cc": "ita", "sets": ws if iw else ls},
                                            {"id": "b", "name": names[j], "winner": not iw, "order": 2, "rank": int(j) + 1,
                                             "country": None, "cc": "esp", "sets": ls if iw else ws}]})
            d += timedelta(days=7)
        for k in range(8):
            i, j = int(rng.integers(0, 12)), int(rng.integers(12, 40))
            mid += 1
            matches.append({"id": str(mid), "date": f"{(today + timedelta(days=k // 3)).isoformat()}T{12 + k % 6}:00Z",
                            "time_valid": True, "state": "pre", "status_name": "STATUS_SCHEDULED", "status": "Programmato",
                            "tournament": "Finals di prova", "location": "Città", "major": False, "court": None,
                            "round": "Round robin", "best_of": 3,
                            "players": [{"id": "a", "name": names[i], "winner": False, "order": 1, "rank": i + 1, "country": None, "cc": "ita", "sets": []},
                                        {"id": "b", "name": names[j], "winner": False, "order": 2, "rank": j + 1, "country": None, "cc": "usa", "sets": []}]})
        TENNIS[tour] = matches


# ----------------------------------------------------------------- collegamento alle fonti

# ----------------------------------------------------------------- formula 1
F1_TEAMS = [("mercedes", "Mercedes"), ("ferrari", "Ferrari"), ("mclaren", "McLaren"), ("red_bull", "Red Bull"), ("aston_martin", "Aston Martin"),
            ("alpine", "Alpine"), ("williams", "Williams"), ("rb", "Racing Bulls"), ("audi", "Audi"), ("haas", "Haas"), ("cadillac", "Cadillac")]
F1_NAMES = ["Marco Rossetti", "Luca Ferraro", "Tom Hartley", "Jan de Wit", "Pierre Lamotte", "Diego Navarro", "Kai Sorensen", "Yuki Tanabe",
            "Oscar Lind", "Max Brenner", "Leo Costa", "Nico Albers", "Sam Doyle", "Ali Haddad", "Ben Carter", "Ivo Petrov", "Raul Ortega",
            "Finn Walsh", "Hugo Martel", "Emil Strand", "Theo Grant", "Paul Weber"]
F1_GP = [("Australian Grand Prix", "albert_park", "Albert Park", "Melbourne", "Australia", -37.85, 144.97),
         ("Japanese Grand Prix", "suzuka", "Suzuka Circuit", "Suzuka", "Japan", 34.84, 136.54),
         ("Italian Grand Prix", "monza", "Autodromo Nazionale di Monza", "Monza", "Italy", 45.62, 9.29),
         ("Monaco Grand Prix", "monaco", "Circuit de Monaco", "Monte-Carlo", "Monaco", 43.73, 7.42),
         ("British Grand Prix", "silverstone", "Silverstone Circuit", "Silverstone", "UK", 52.07, -1.02),
         ("Las Vegas Grand Prix", "vegas", "Las Vegas Strip Street Circuit", "Las Vegas", "USA", 36.11, -115.17),
         ("Qatar Grand Prix", "losail", "Losail International Circuit", "Lusail", "Qatar", 25.49, 51.45)]
F1DATA = {}


def _gen_f1(today):
    """Stagione inventata: forza di ogni pilota, risultati delle gare passate, tre GP nei prossimi giorni."""
    drivers = [{"id": n.split()[-1].lower(), "name": n, "code": n.split()[-1][:3].upper(), "num": str(i + 2), "nat": random.choice(["Italian", "British", "German", "Spanish", "Dutch"]),
                "team": F1_TEAMS[i // 2][0], "team_name": F1_TEAMS[i // 2][1], "force": 1.6 - (i // 2) * 0.28 + random.uniform(-0.3, 0.3)}
               for i, n in enumerate(F1_NAMES)]
    year = today.year
    sched, seasons = [], {}
    for y in (year - 1, year):
        races = []
        n_r = 22 if y < year else 18
        for k in range(n_r):
            gp = F1_GP[k % len(F1_GP)]
            d = (date(y, 3, 8) + timedelta(days=14 * k)) if y < year else (today - timedelta(days=1 + 14 * (n_r - 1 - k)))
            perf = sorted(drivers, key=lambda x: -(x["force"] + random.gauss(0, 1)))
            dnf = {x["id"] for x in drivers if random.random() < 0.07}
            fin = [x for x in perf if x["id"] not in dnf] + [x for x in perf if x["id"] in dnf]
            grid = sorted(drivers, key=lambda x: -(x["force"] + random.gauss(0, 0.8)))
            gpos = {x["id"]: i + 1 for i, x in enumerate(grid)}
            res = [{**{kk: x[kk] for kk in ("id", "name", "code", "num", "nat", "team", "team_name")}, "pos": i + 1, "grid": gpos[x["id"]],
                    "status": "Retired" if x["id"] in dnf else "Finished", "classified": x["id"] not in dnf,
                    "points": [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][i] if i < 10 and x["id"] not in dnf else 0, "laps": 57, "fl_rank": 1 if i == 0 else None}
                   for i, x in enumerate(fin)]
            quali = [{**{kk: x[kk] for kk in ("id", "name", "code", "num", "nat", "team")}, "pos": gpos[x["id"]], "q": [None, None, None]} for x in grid]
            races.append({"season": y, "round": k + 1, "name": gp[0], "date": d.isoformat(), "circuit": gp[1], "results": res, "quali": quali, "sprint": []})
        seasons[y] = {"season": y, "_last": n_r, "races": races}
    last = seasons[year]["races"][-1]   # GP di ieri, già concluso: per provare il risultato
    lg = next(g for g in F1_GP if g[1] == last["circuit"])
    ld = date.fromisoformat(last["date"])
    sched.append({"season": year, "round": last["round"], "name": lg[0], "circuit": lg[1], "circuit_name": lg[2], "locality": lg[3], "country": lg[4],
                  "lat": lg[5], "lon": lg[6], "sessions": {"FP1": f"{(ld - timedelta(days=2)).isoformat()}T11:30:00Z", "Q": f"{(ld - timedelta(days=1)).isoformat()}T14:00:00Z",
                                                          "Race": f"{ld.isoformat()}T13:00:00Z"}})
    for k in range(3):
        gp = F1_GP[(4 + k) % len(F1_GP)]
        d = today + timedelta(days=2 + 7 * k)
        rnd = 19 + k
        iso = lambda dd, h: f"{dd.isoformat()}T{h}Z"
        ses = {"FP1": iso(d - timedelta(days=2), "11:30"), "FP2": iso(d - timedelta(days=2), "15:00"), "FP3": iso(d - timedelta(days=1), "10:30"),
               "Q": iso(d - timedelta(days=1), "14:00"), "Race": iso(d, "13:00")}
        if k == 1:
            ses = {"FP1": ses["FP1"], "SQ": ses["FP2"], "Sprint": iso(d - timedelta(days=1), "10:00"), "Q": ses["Q"], "Race": ses["Race"]}
        sched.append({"season": year, "round": rnd, "name": gp[0], "circuit": gp[1], "circuit_name": gp[2], "locality": gp[3], "country": gp[4],
                      "lat": gp[5], "lon": gp[6], "sessions": ses})
    # griglia del primo GP (qualifiche già fatte se è domani)
    F1DATA.update({"drivers": drivers, "seasons": seasons, "sched": sched})


def _install_f1_fakes():
    from .sources import jolpica, openf1, openmeteo
    jolpica.schedule = lambda y: [g for g in F1DATA["sched"] if g["season"] == y]
    jolpica.season = lambda y, completed, status: F1DATA["seasons"].get(y, {"races": []})
    jolpica.quali_for = lambda y, rnd: []
    def standings(y):
        pts = defaultdict(float); wins = defaultdict(int); tp = defaultdict(float); tw = defaultdict(int)
        info = {d["id"]: d for d in F1DATA["drivers"]}
        for x in F1DATA["seasons"].get(y, {}).get("races", []):
            for z in x["results"]:
                pts[z["id"]] += z["points"]; tp[z["team"]] += z["points"]
                if z["pos"] == 1 and z["classified"]:
                    wins[z["id"]] += 1; tw[z["team"]] += 1
        ds = sorted(pts, key=lambda k: -pts[k])
        ts = sorted(tp, key=lambda k: -tp[k])
        names = dict(F1_TEAMS)
        return {"drivers": [{"id": k, "name": info[k]["name"], "code": info[k]["code"], "num": info[k]["num"], "nat": info[k]["nat"], "pos": i + 1,
                             "points": pts[k], "wins": wins[k], "team": info[k]["team"], "team_name": info[k]["team_name"]} for i, k in enumerate(ds)],
                "teams": [{"id": k, "name": names[k], "pos": i + 1, "points": tp[k], "wins": tw[k]} for i, k in enumerate(ts)]}
    jolpica.standings = standings
    def ses(y):
        out = []
        for x in F1DATA["seasons"].get(y, {}).get("races", []):
            gp = next(g for g in F1_GP if g[1] == x["circuit"])
            out.append({"session_key": y * 100 + x["round"], "session_name": "Race", "location": gp[3], "circuit_short_name": gp[3],
                        "country_name": gp[4], "year": y, "date_start": x["date"] + "T13:00:00+00:00", "date_end": x["date"] + "T15:00:00+00:00", "meeting_key": y * 100 + x["round"]})
        return out
    openf1.sessions = ses
    def sdata(key, budget):
        y, rnd = divmod(key, 100)
        x = F1DATA["seasons"][y]["races"][rnd - 1]
        rr = random.Random(key)
        nums = {d["id"]: int(d["num"]) for d in F1DATA["drivers"]}
        stints, pit = [], []
        for z in x["results"]:
            n = nums[z["id"]]
            k = rr.choice([1, 1, 2, 2, 2, 3])
            cuts = sorted(rr.sample(range(12, 50), k)) if k else []
            edges = [1] + [c + 1 for c in cuts]
            comps = [rr.choice(["MEDIUM", "SOFT"])] + [rr.choice(["HARD", "MEDIUM"]) for _ in cuts]
            for i, a in enumerate(edges):
                b = (edges[i + 1] - 1) if i + 1 < len(edges) else 57
                stints.append({"num": n, "n": i + 1, "from": a, "to": b, "c": comps[i], "age": 0})
            for c in cuts:
                pit.append({"num": n, "lap": c, "stop": round(rr.uniform(2.1, 3.6), 2), "lane": round(rr.uniform(20, 25), 1)})
        return {"stints": stints, "pit": pit,
                "weather": {"air": [22, 23], "track": [38, 41], "rain": 1 if rr.random() < 0.15 else 0, "n": 2},
                "race_control": [{"lap": 12, "cat": "SafetyCar", "flag": None, "msg": "SAFETY CAR DEPLOYED"}] if rr.random() < 0.5 else [],
                "drivers": [{"num": nums[d["id"]], "code": d["code"], "team": d["team_name"], "colour": {"mercedes": "27F4D2", "ferrari": "E8002D", "mclaren": "FF8000", "red_bull": "3671C6"}.get(d["team"], "888888"), "last": d["name"].split()[-1]} for d in F1DATA["drivers"]],
                "session_result": [{"driver_number": nums[z["id"]], "position": z["pos"], "dnf": not z["classified"]} for z in x["results"]]}
    openf1.session_data = sdata
    def fc(lat, lon):
        start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        times = [(start + timedelta(hours=h)).strftime("%Y-%m-%dT%H:00") for h in range(16 * 24)]
        rnd = random.Random(int(lat * 100))
        return {"time": times, "temperature_2m": [round(18 + 6 * rnd.random(), 1) for _ in times],
                "precipitation_probability": [int(rnd.random() * (70 if lat > 50 else 15)) for _ in times],
                "precipitation": [round(rnd.random() * (1.5 if lat > 50 else 0.1), 1) for _ in times],
                "wind_speed_10m": [round(5 + 15 * rnd.random(), 1) for _ in times], "cloud_cover": [int(100 * rnd.random()) for _ in times]}
    openmeteo.forecast = fc


def _install_fakes():
    def fd_season(code, sc):
        return [dict(m) for m in SOCCER.get(code, {}).get("seasons", {}).get(sc, [])]

    def fd_new(country, name, since):
        s = next((v for v in SOCCER.values() if v.get("fdnew") == (country, name)), None)
        if not s:
            return []
        rows = [dict(m) for ms in s["seasons"].values() for m in ms if m["date"] >= since]
        for m in rows:
            for k in ("hs", "as", "hst", "ast", "hc", "ac", "hy", "ay", "hr", "ar", "hf", "af", "hhg", "hag", "oou25"):
                m.pop(k, None)
        return sorted(rows, key=lambda m: m["date"])
    footballdata.new_league = fd_new

    def fd_fixtures():
        out = []
        for code, s in SOCCER.items():
            name_back = {v: k for k, v in ESPN_NAMES.items()}
            for e in s["events"]:
                if e["state"] == "pre":
                    h = name_back.get(e["home"]["name"], e["home"]["name"]); a = name_back.get(e["away"]["name"], e["away"]["name"])
                    out.append({"div": code, "date": e["date"][:10], "home": h, "away": a,
                                "o1x2": [round(random.uniform(1.6, 3.2), 2), round(random.uniform(3.0, 3.8), 2), round(random.uniform(2.2, 4.5), 2)],
                                "oou25": [round(random.uniform(1.7, 2.1), 2), round(random.uniform(1.7, 2.1), 2)]})
        return out

    def scoreboard_range(sport, league, start, end, chunk_days=14):
        if sport == "soccer":
            s = next(v for v in SOCCER.values() if v["espn"] == league)
            return [{"_parsed": e} for e in s["events"] if start.isoformat() <= e["date"][:10] <= end.isoformat()]
        if sport == "basketball":
            out = []
            for y, s in NBA.items():
                for g in s["games"]:
                    if start.isoformat() <= g["date"][:10] <= end.isoformat():
                        out.append({"_nba": g})
            return out
        return []

    real_parse = espn.parse_event

    def parse_event(ev):
        if "_parsed" in ev:
            return dict(ev["_parsed"])
        if "_nba" in ev:
            g = ev["_nba"]
            done = g["hs"] is not None
            return {"id": g["id"], "date": g["date"], "state": g["state"], "completed": done, "status": "",
                    "home": {"id": g["home"], "name": g["home_name"], "abbr": g["home_abbr"], "short": g["home_abbr"], "score": g["hs"], "color": g["home_color"]},
                    "away": {"id": g["away"], "name": g["away_name"], "abbr": g["away_abbr"], "short": g["away_abbr"], "score": g["as"], "color": g["away_color"]},
                    "season_type": 2, "odds": g["odds"]}
        return real_parse(ev)

    def summary(sport, league, event_id):
        if sport == "soccer":
            for s in SOCCER.values():
                if event_id in s["boxes"]:
                    return {"_lines": s["boxes"][event_id]["lines"]}
            return None
        if sport == "basketball":
            def pred(gid):
                g = next((x for v in NBA.values() for x in v["games"] if x["id"] == gid), None)
                if not g:
                    return {}
                p = min(max(g["odds"]["p_home"] + rng.normal(0, .04), .02), .98)
                return {"homeTeam": {"gameProjection": f"{p * 100:.1f}"}}
            for s in NBA.values():
                if event_id in s["box"]:
                    return {"_lines": s["box"][event_id]["lines"], "predictor": pred(event_id)}
                for g in s["games"]:
                    if g["id"] == event_id and g["state"] == "pre":
                        inj = []
                        team_lines = [x for b in s["box"].values() for x in b["lines"] if x["team"] == g["home"]]
                        if team_lines:
                            x = team_lines[0]
                            inj = [{"team": {"id": g["home"]}, "injuries": [{"athlete": {"id": x["pid"], "displayName": x["name"]}, "status": "Day-To-Day", "details": {"type": "Caviglia"}}]}]
                        return {"injuries": inj, "_odds": g["odds"], "predictor": pred(event_id)}
        return None

    espn.scoreboard_range = scoreboard_range
    espn.parse_event = parse_event
    espn.summary = summary
    espn.soccer_player_lines = lambda summ: summ.get("_lines", [])
    espn.nba_player_lines = lambda summ: summ.get("_lines", [])
    espn.pickcenter_odds = lambda summ: summ.get("_odds")
    def tennis_day(sport, league, day):
        if sport == "soccer":
            return [{"_parsed": e} for e in CUPS_FAKE.get(league, []) if e["date"][:10] == day.isoformat()]
        if sport != "tennis":
            return []
        lo, hi = day.isoformat(), (day + timedelta(days=3)).isoformat()
        return [{"_t": m} for m in TENNIS.get(league, []) if lo <= m["date"][:10] <= hi]
    espn.scoreboard_day = tennis_day
    espn.scoreboard = lambda sport, league, start, end=None: tennis_day(sport, league, start)
    espn.tennis_matches = lambda evs, tour: [e["_t"] for e in evs]
    from .sources import intl_results
    intl_results.matches = lambda since: [dict(m) for m in NATIONAL_HIST if m["date"] >= since]
    espn.group_standings = lambda *a, **k: []
    espn.league_board = lambda sport, league: {"leagues": [{"season": {"endDate": "2099-01-01"}}], "events": []}
    footballdata.season = fd_season
    footballdata.fixtures = fd_fixtures
    understat.league_matches = lambda league, y: []

    from . import build_nba
    real_games = build_nba._games

    def games(season_year, today, status, final):
        return real_games(season_year, today, status, final)
    build_nba._games = games


def _fake_finished():
    """Qualche partita già giocata (ieri e stamattina) con esito, per provare elenco e confronto."""
    idx = store.load(PUBLIC_DATA / "index.json")
    evs = idx["events"]
    now = datetime.now(timezone.utc)
    picks = [e for e in evs if e["sport"] == "soccer"][:4] + [e for e in evs if e["sport"] == "nba"][:2] + [e for e in evs if e["sport"] == "tennis"][:2]
    for k, e in enumerate(picks):
        e["date"] = (now - timedelta(days=1 if k % 2 else 0, hours=5)).isoformat(timespec="minutes").replace("+00:00", "Z")
        if e["sport"] == "soccer":
            f = {"h": int(rng.poisson(1.4)), "a": int(rng.poisson(1.1)), "st": "Finale"}
            f["periods"] = [[min(f["h"], 1)], [0]]
            if k == 3:
                f = {"void": "Rinviata"}
        elif e["sport"] == "nba":
            f = {"h": int(rng.normal(115, 10)), "a": int(rng.normal(112, 10)), "st": "Finale"}
        else:
            f = {"h": 2, "a": 1, "w": 0, "sets": [[6, 4, 7], [3, 6, 6]], "games": 32, "st": "Finale"}
        e["final"] = f
        d = store.load(PUBLIC_DATA / "events" / f"{e['id']}.json")
        d["date"], d["final"] = e["date"], f
        store.save(PUBLIC_DATA / "events" / f"{e['id']}.json", d)
    store.save(PUBLIC_DATA / "index.json", idx)


def main():
    import logging
    logging.basicConfig(level=logging.INFO, format="%(name)s %(levelname)s %(message)s")
    shutil.rmtree(CACHE, ignore_errors=True)
    shutil.rmtree(PUBLIC_DATA, ignore_errors=True)
    _gen_soccer(); _gen_nba(); _gen_tennis(); _gen_f1(date.today())
    _install_fakes(); _install_f1_fakes()
    photos.ENABLED = False  # nessuna rete con i dati di esempio
    import sys
    from . import run
    sys.argv = ["run"]
    run.main()
    _fake_finished()
    meta = store.load(PUBLIC_DATA / "meta.json")
    meta["sample"] = True
    store.save(PUBLIC_DATA / "meta.json", meta, pretty=True)
    shutil.rmtree(CACHE, ignore_errors=True)  # la cache di esempio non va nel repository
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / ".gitkeep").write_text("")


if __name__ == "__main__":
    main()
