"""Prove di precisione che hanno bisogno della rete (lanciate da Verifica fonti): ClubElo per il calcio e statistiche di
servizio e risposta per il tennis. Scrivono solo il resoconto: niente entra nel sito finché la prova non convince."""
import csv
import difflib
import io
import math
import time
from collections import defaultdict
from datetime import date, timedelta

import numpy as np

from . import config, http
from .models import soccer as S, tennis as T


def _ll(p, y):
    return -math.log(min(max(p[y], 1e-6), 1))


# ------------------------------------------------------------------ calcio: ClubElo come seconda opinione
BIG = {"premier-league": "ENG", "serie-a": "ITA", "la-liga": "ESP", "bundesliga": "GER", "ligue-1": "FRA"}


_CE = {"base": None}


def _clubelo(day: date) -> dict:
    txt = http.get_text(f"{_CE['base']}/{day.isoformat()}", delay=1.2, tries=2, timeout=20) or ""
    out = {}
    for row in csv.DictReader(io.StringIO(txt)):
        try:
            out[(row["Country"], row["Club"])] = float(row["Elo"])
        except (KeyError, ValueError):
            pass
    return out


def clubelo_test(out):
    from . import build_soccer as B
    today = date.today()
    mondays = []
    d = date(2025, 8, 4)
    while d <= today:
        mondays.append(d)
        d += timedelta(days=7)
    for base in ("https://api.clubelo.com", "http://api.clubelo.com", "http://clubelo.com/API"):
        r = http.get(f"{base}/2025-09-01", tries=1, timeout=15)
        out(f"- prova {base}: {'risponde' if r is not None else 'non risponde'}")
        if r is not None and "Club" in r.text[:200]:
            _CE["base"] = base
            break
    if not _CE["base"]:
        out("- ClubElo non risponde ai server di GitHub: prova impossibile da qui")
        return
    snaps = {}
    for m in mondays:
        s = _clubelo(m)
        if s:
            snaps[m] = s
    out(f"- istantanee ClubElo scaricate: {len(snaps)} su {len(mondays)}")
    if len(snaps) < 20:
        return
    rows = []          # (data, p_modello[3], dr, esito)
    unmatched = set()
    for key, cc in BIG.items():
        lg = config.SOCCER_LEAGUES[key]
        matches = B.history(lg, today, {})
        names = sorted({c for snap in snaps.values() for (cty, c) in snap if cty == cc})
        cache = {}

        def ce(team):
            if team not in cache:
                n = difflib.get_close_matches(team, names, n=1, cutoff=0.55)
                if not n:
                    short = team.replace("FC ", "").replace(" FC", "").split(" ")[0]
                    n = difflib.get_close_matches(short, names, n=1, cutoff=0.6)
                cache[team] = n[0] if n else None
                if not n:
                    unmatched.add(f"{team} ({cc})")
            return cache[team]
        test = sorted([m for m in matches if m["date"] >= "2025-08-15"], key=lambda m: m["date"])
        weeks = defaultdict(list)
        for m in test:
            weeks[date.fromisoformat(m["date"]).isocalendar()[:2]].append(m)
        for _, ms in sorted(weeks.items()):
            first = min(date.fromisoformat(m["date"]) for m in ms)
            rt = S.fit(matches, first, iters=40)
            snap_day = max((x for x in snaps if x <= first), default=None)
            if rt is None or snap_day is None:
                continue
            snap = snaps[snap_day]
            for m in ms:
                a, b = ce(m["home"]), ce(m["away"])
                if not a or not b or (cc, a) not in snap or (cc, b) not in snap:
                    continue
                lh, la = rt.lambdas(m["home"], m["away"])
                p = list(S.p1x2(S.score_matrix(lh, la)))
                y = 0 if m["hg"] > m["ag"] else (1 if m["hg"] == m["ag"] else 2)
                rows.append((m["date"], p, snap[(cc, a)] - snap[(cc, b)], y))
    if unmatched:
        out(f"- squadre non abbinate: {', '.join(sorted(unmatched))[:500]}")
    rows.sort()
    split = "2026-07-01"
    tr = [r for r in rows if r[0] < split]
    te = [r for r in rows if r[0] >= split]
    out(f"- partite con modello ed Elo: {len(tr)} per stimare (2025-26), {len(te)} per provare (2026-27)")
    if len(tr) < 300 or len(te) < 100:
        return
    sig = lambda x: 1 / (1 + math.exp(-x))

    def elo_p(dr, a, hfa, dl):
        s = a * (dr + hfa) / 400 * math.log(10)
        ph, pa = sig(s - dl), sig(-s - dl)
        return [ph, max(1 - ph - pa, 0.02), pa]
    best = None
    for a in (0.6, 0.8, 1.0, 1.2):
        for hfa in (40, 60, 80, 100):
            for dl in (0.3, 0.4, 0.5, 0.6, 0.7):
                v = sum(_ll(elo_p(dr, a, hfa, dl), y) for _, _, dr, y in tr) / len(tr)
                if best is None or v < best[0]:
                    best = (v, a, hfa, dl)
    _, a, hfa, dl = best

    def blend(p, q, w):
        z = [(1 - w) * x + w * yv for x, yv in zip(p, q)]
        s = sum(z)
        return [x / s for x in z]
    ws = [i / 10 for i in range(11)]
    w_best = min(ws, key=lambda w: sum(_ll(blend(p, elo_p(dr, a, hfa, dl), w), y) for _, p, dr, y in tr))
    for name, sl in (("stima 2025-26", tr), ("prova 2026-27", te)):
        lm = sum(_ll(p, y) for _, p, _, y in sl) / len(sl)
        le = sum(_ll(elo_p(dr, a, hfa, dl), y) for _, _, dr, y in sl) / len(sl)
        lb = sum(_ll(blend(p, elo_p(dr, a, hfa, dl), w_best), y) for _, p, dr, y in sl) / len(sl)
        out(f"- {name}: log-loss 1X2 modello {lm:.4f} · ClubElo {le:.4f} · miscela (Elo {w_best:.0%}) **{lb:.4f}**")
    out(f"- parametri Elo: scala {a}, vantaggio casa {hfa}, pareggio {dl}")


# ------------------------------------------------------------------ tennis: servizio e risposta
SACK = "https://raw.githubusercontent.com/JeffSackmann/tennis_{t}/master/{t}_matches_{y}.csv"


def _sack(tour, year):
    txt = http.get_text(SACK.format(t=tour, y=year), delay=1.5)
    if not txt or "tourney_date" not in txt[:300]:
        return []
    return list(csv.DictReader(io.StringIO(txt)))


def serve_test(out):
    for tour in ("atp", "wta"):
        rows = []
        for y in (2022, 2023, 2024, 2025, 2026):
            got = _sack(tour, y)
            out(f"- {tour.upper()} {y}: {len(got)} incontri")
            rows += got
        rows = [r for r in rows if r.get("w_svpt") and r.get("l_svpt") and r.get("w_1stWon") and r.get("score")
                and "RET" not in r["score"] and "W/O" not in r["score"]]
        rows.sort(key=lambda r: (r["tourney_date"], r.get("match_num", "0").zfill(4)))
        if len(rows) < 3000:
            continue
        last = rows[-1]["tourney_date"]
        test_from = str(int(last[:4]) - 1) + last[4:]          # ultimo anno di dati
        elo = T.Elo()
        hist = defaultdict(list)    # giocatore -> [(data, punti servizio vinti, giocati, risposta vinti, giocati)]
        rec = []
        for r in rows:
            dt = r["tourney_date"]
            w, l = r["winner_name"], r["loser_name"]
            surf = r.get("surface") or "Hard"
            bo = int(r.get("best_of") or 3)
            wsv = (float(r["w_1stWon"]) + float(r["w_2ndWon"])) / float(r["w_svpt"]) if float(r["w_svpt"]) else None
            lsv = (float(r["l_1stWon"]) + float(r["l_2ndWon"])) / float(r["l_svpt"]) if float(r["l_svpt"]) else None
            if dt >= test_from:
                def stats(pl):
                    lim = str(int(dt[:4]) - 1) + dt[4:]
                    h = [x for x in hist[pl] if x[0] >= lim]
                    sp = sum(x[1] for x in h); sn = sum(x[2] for x in h)
                    rp = sum(x[3] for x in h); rn = sum(x[4] for x in h)
                    return (sp / sn, rp / rn, sn) if sn > 300 and rn > 300 else None
                sw, sl = stats(w), stats(l)
                pe = elo.prob(w, l, surf)
                if sw and sl:
                    rec.append((dt, pe, sw, sl, bo))
            elo.update(w, l, surf, dt)
            if wsv is not None and lsv is not None:
                hist[w].append((dt, wsv * float(r["w_svpt"]), float(r["w_svpt"]), (1 - lsv) * float(r["l_svpt"]), float(r["l_svpt"])))
                hist[l].append((dt, lsv * float(r["l_svpt"]), float(r["l_svpt"]), (1 - wsv) * float(r["w_svpt"]), float(r["w_svpt"])))
        if len(rec) < 400:
            out(f"- {tour.upper()}: troppo pochi incontri di prova ({len(rec)})")
            continue
        avg_s = np.mean([x[2][0] for x in rec] + [x[3][0] for x in rec])
        avg_r = 1 - avg_s

        def p_serve(a, b, bo):
            pa = min(max(avg_s + (a[0] - avg_s) - (b[1] - avg_r), 0.4), 0.85)
            pb = min(max(avg_s + (b[0] - avg_s) - (a[1] - avg_r), 0.4), 0.85)
            return T.fast_win(pa, pb, bo)
        half = len(rec) // 2
        data = [(pe, p_serve(sw, sl, bo)) for _, pe, sw, sl, bo in rec]      # il vincitore è sempre il primo: esito = 1

        def ll(ps):
            return sum(-math.log(min(max(p, 1e-6), 1)) for p in ps) / len(ps)
        ws = [i / 10 for i in range(11)]
        wb = min(ws, key=lambda w: ll([(1 - w) * pe + w * ps for pe, ps in data[:half]]))
        for name, sl in (("prima metà", data[:half]), ("seconda metà", data[half:])):
            out(f"- {tour.upper()} {name} ({len(sl)}): log-loss Elo {ll([x[0] for x in sl]):.4f} · servizio/risposta {ll([x[1] for x in sl]):.4f} · "
                f"miscela ({wb:.0%} servizio) **{ll([(1 - wb) * a + wb * b for a, b in sl]):.4f}**")
        time.sleep(1)


def run(out):
    out(f"# Prove di precisione — {date.today().isoformat()}\n")
    out("## Tennis: servizio e risposta (Jeff Sackmann)")
    try:
        serve_test(out)
    except Exception as e:
        out(f"- errore: {e}")
    out("\n## Calcio: ClubElo")
    try:
        clubelo_test(out)
    except Exception as e:
        out(f"- errore: {e}")
