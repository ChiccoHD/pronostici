"""Rischio turnover nel calcio: se una squadra ha una partita più importante nei giorni subito dopo (una finale, una
semifinale, un turno a eliminazione diretta o una coppa europea), spesso fa giocare le riserve. Il modello non lo vede,
i bookmaker sì (esempio: Chapecoense–Palmeiras del 24/11/2026, con la finale di Libertadores 4 giorni dopo).

Calendario di tutte le competizioni da ESPN (`site.web.api.espn.com/.../soccer/all/teams/<id>/schedule?fixture=true`,
verificato con Verifica fonti modo `turnover`), una richiesta per squadra, tenuta in cache 20 ore.
Campo `rotation` nel file della partita e `rot` nell'elenco: solo informazione, non cambia le percentuali."""
import logging
import re
from datetime import datetime, timedelta, timezone

from . import http, store
from .config import CACHE, PUBLIC_DATA

URL = "https://site.web.api.espn.com/apis/site/v2/sports/soccer/all/teams/{tid}/schedule"
PATH = CACHE / "soccer" / "rotation.json"
WINDOW_DAYS = 4          # partite di oggi e dei prossimi 4 giorni
MAX_REQ = 160            # richieste al massimo per giro (poche e lente)
TTL_H = 20

COMP = {"conmebol.libertadores": "Copa Libertadores", "conmebol.sudamericana": "Copa Sudamericana", "uefa.champions": "Champions League",
        "uefa.europa": "Europa League", "uefa.europa.conf": "Conference League", "concacaf.champions": "Champions Cup CONCACAF",
        "afc.champions": "Champions League asiatica", "bra.copa_do_brazil": "Coppa del Brasile", "ita.coppa_italia": "Coppa Italia",
        "esp.copa_del_rey": "Copa del Rey", "eng.fa": "FA Cup", "eng.league_cup": "Carabao Cup", "ger.dfb_pokal": "Coppa di Germania",
        "fra.coupe_de_france": "Coppa di Francia", "arg.copa": "Copa Argentina", "fifa.cwc": "Mondiale per club",
        "ned.cup": "Coppa d'Olanda", "por.taca.portugal": "Coppa di Portogallo", "jpn.emperors_cup": "Coppa dell'Imperatore"}
CONTINENTAL = {"conmebol.libertadores", "conmebol.sudamericana", "uefa.champions", "uefa.europa", "uefa.europa.conf",
               "concacaf.champions", "afc.champions", "fifa.cwc"}
STAGE = [(r"\bfinal\b|^final", "la finale", 3), (r"semi", "la semifinale", 3), (r"quarter", "i quarti", 2),
         (r"round of 16|octavos|last 16", "gli ottavi", 2), (r"play-?off|knockout|round of 32", "un turno a eliminazione", 2)]
IT_DAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]


def _dt(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _schedule(tid: str, mem: dict, now: datetime, budget: list) -> list:
    got = mem.get(tid)
    if got and (now - _dt(got["t"])).total_seconds() < TTL_H * 3600:
        return got["e"]
    if budget[0] <= 0:
        return got["e"] if got else []
    budget[0] -= 1
    js = http.get_json(URL.format(tid=tid), {"fixture": "true"}, tries=2) or {}
    evs = []
    for e in js.get("events") or []:
        evs.append({"d": e.get("date"), "lg": (e.get("league") or {}).get("slug") or "", "st": (e.get("seasonType") or {}).get("name") or "",
                    "n": e.get("shortName") or e.get("name") or "", "id": str(e.get("id"))})
    mem[tid] = {"t": now.isoformat(timespec="minutes"), "e": evs}
    return evs


def _risk(this_id: str, this_lg: str, when: datetime, evs: list):
    """La partita più importante nei giorni dopo questa, se c'è: (livello, testo)."""
    best = None
    for o in evs:
        d = _dt(o["d"])
        if not d or o["id"] == this_id or d <= when + timedelta(hours=12):
            continue
        days = (d - when).total_seconds() / 86400
        if days > 6:
            continue
        lg, st = o["lg"], o["st"].lower()
        if lg and lg == this_lg:
            continue
        lvl, what = 0, None
        for rx, name, l in STAGE:
            if re.search(rx, st):
                lvl, what = l, name
                break
        if lvl == 3 and days > 6 or lvl == 2 and days > 4:
            continue
        if not lvl and lg in CONTINENTAL and this_lg not in CONTINENTAL and days <= 3.5:
            lvl, what = 1, "una partita"
        if not lvl:
            continue
        comp = COMP.get(lg, lg)
        loc = d.astimezone(timezone(timedelta(hours=1)))
        txt = f"{what} di {comp} {IT_DAYS[loc.weekday()]} {loc.day} (tra {round(days)} giorni)"
        if not best or lvl > best[0]:
            best = (lvl, txt, round(days, 1), comp)
    return best


def apply(events: list[dict], status: dict):
    try:
        mem = store.load(PATH, {})
        now = datetime.now(timezone.utc)
        budget, n = [MAX_REQ], 0
        for e in events:
            e.pop("rot", None)
            if e.get("sport") != "soccer" or e.get("final"):
                continue
            when = _dt(e.get("date"))
            if not when or when < now - timedelta(hours=3) or when > now + timedelta(days=WINDOW_DAYS):
                continue
            path = PUBLIC_DATA / "events" / f"{e['id']}.json"
            d = store.load(path)
            if not d:
                continue
            this_id = e["id"].rsplit("-", 1)[-1]
            this_lg = (e.get("espn") or "").split("/")[-1] if isinstance(e.get("espn"), str) else ""
            rot = {}
            for side in ("home", "away"):
                tid = str((d.get(side) or {}).get("id") or "")
                if not tid or tid == "None":
                    continue
                r = _risk(this_id, this_lg, when, _schedule(tid, mem, now, budget))
                if r:
                    rot[side] = {"lvl": r[0], "txt": r[1], "days": r[2], "comp": r[3]}
            if rot:
                d["rotation"] = rot
                e["rot"] = max(v["lvl"] for v in rot.values())
                n += 1
            else:
                d.pop("rotation", None)
            store.save(path, d)
        # squadre non più in programma: via dalla cache dopo 3 giorni
        lim = now - timedelta(days=3)
        store.save(PATH, {k: v for k, v in mem.items() if _dt(v["t"]) and _dt(v["t"]) > lim})
        status["turnover"] = {"ok": True, "partite": n, "richieste": MAX_REQ - budget[0]}
    except Exception as ex:
        logging.exception("Rischio turnover non calcolato")
        status["turnover"] = {"ok": False, "errore": str(ex)[:200]}
