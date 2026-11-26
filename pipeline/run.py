"""Punto d'ingresso: aggiorna tutti gli sport e scrive index.json, meta.json, affidabilita.json.
Uso: python -m pipeline.run [--solo calcio,nba,tennis]"""
import argparse
import logging
import shutil
from datetime import datetime, timezone

from . import config, store
from .config import PUBLIC_DATA

SPORTS = {"calcio": "build_soccer", "coppe": "build_cups", "nazionali": "build_national", "nba": "build_nba", "tennis": "build_tennis", "f1": "build_f1"}
CUP_KEYS = set(config.CUPS) | set(config.WOMEN_CUPS)
NATIONAL_KEYS = set(config.NATIONAL)
KEEP_DAYS = 3      # giorni in cui una partita iniziata resta in elenco


def owner(e: dict) -> str:
    """Quale modulo ha prodotto un evento (per sostituire solo i suoi)."""
    if e["sport"] == "soccer":
        return "coppe" if e["league"] in CUP_KEYS else "nazionali" if e["league"] in NATIONAL_KEYS else "calcio"
    return e["sport"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", default="calcio,coppe,nazionali,nba,tennis,f1")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    today = config.today()
    wanted = [s.strip() for s in args.solo.split(",") if s.strip()]

    old_index = store.load(PUBLIC_DATA / "index.json", {"events": []})
    old_meta = store.load(PUBLIC_DATA / "meta.json", {})
    old_rel = store.load(PUBLIC_DATA / "affidabilita.json", {})
    sample = old_meta.get("sample", False)
    if sample:  # primo giro reale: via i dati di esempio
        shutil.rmtree(PUBLIC_DATA / "events", ignore_errors=True)
        old_index, old_rel = {"events": []}, {}

    events = {e["id"]: e for e in old_index.get("events", [])}
    status, reliability = dict(old_meta.get("status", {})) if not sample else {}, old_rel
    for s in wanted:
        mod = __import__(f"pipeline.{SPORTS[s]}", fromlist=["build"])
        logging.info("=== %s ===", s)
        try:
            idx, rel, st = mod.build(today)
        except Exception as ex:
            logging.exception("Sport %s fallito", s)
            status[s] = {"errore": f"{type(ex).__name__}: {ex}"}
            continue
        # Sostituisce gli eventi di questo sport solo se la raccolta ha prodotto qualcosa
        # (le partite già iniziate che la raccolta non ripropone restano: servono per l'esito e il confronto)
        if idx or not any(owner(e) == s for e in events.values()):
            new_ids = {e["id"] for e in idx}
            started = lambda e: e["date"] <= datetime.now(timezone.utc).isoformat()[:16]
            events = {k: v for k, v in events.items() if owner(v) != s or (started(v) and k not in new_ids)}
            for e in idx:     # se una partita viene riproposta, l'esito già trovato resta
                old = events.get(e["id"]) or {}
                events[e["id"]] = {**e, **({"final": old["final"]} if old.get("final") else {})}
        reliability.update({f"{s}:{k}": v for k, v in rel.items()})
        status[s] = {**st, "aggiornato": datetime.now(timezone.utc).isoformat(timespec="minutes")}

    now = datetime.now(timezone.utc)
    keep = sorted(events.values(), key=lambda e: e["date"])
    # le partite restano in elenco per qualche giorno dopo l'inizio, con il risultato finale (results.py)
    def alive(e):
        return datetime.fromisoformat(e["date"].replace("Z", "+00:00")).timestamp() > now.timestamp() - KEEP_DAYS * 86400
    keep = [e for e in keep if alive(e)]
    try:
        from . import results
        for e in keep:      # percorso ESPN del tabellone (serve alle notifiche del Worker)
            tg = results._target(e)
            if tg:
                e["espn"] = f"{tg[0]}/{tg[1]}"
        rs = {}
        results.attach(keep, rs)
        status["risultati"] = {"esiti": rs.get("risultati"), "aggiornato": now.isoformat(timespec="minutes")}
    except Exception:
        logging.exception("Risultati finali non letti")
    try:
        from . import archive
        ar = {}
        archive.update(keep, ar)
        status["archivio"] = ar.get("archivio")
    except Exception:
        logging.exception("Archivio non aggiornato")
    try:
        from . import calibrate
        calibrate.apply(keep, status)     # taratura con l'archivio, prima di elenco e Migliori
    except Exception:
        logging.exception("Taratura non applicata")
    try:
        from . import monthly
        monthly.maybe_write(status)       # controllo del mese: al primo giro di ogni mese
    except Exception:
        logging.exception("Controllo del mese non fatto")
    from . import odds_move
    odds_move.apply(keep, status)
    from . import rotation
    rotation.apply(keep, status)       # rischio turnover: prima di Migliori, che lo legge dai file delle partite
    store.save(PUBLIC_DATA / "index.json", {"updated": now.isoformat(timespec="minutes"), "events": keep})
    store.save(PUBLIC_DATA / "affidabilita.json", reliability)
    store.save(PUBLIC_DATA / "meta.json", {"updated": now.isoformat(timespec="minutes"), "sample": False,
                                           "status": status}, pretty=True)
    # Pulizia dei file di partite non più in elenco
    ids = {e["id"] for e in keep}
    ev_dir = PUBLIC_DATA / "events"
    if ev_dir.exists():
        for f in ev_dir.glob("*.json"):
            if f.stem not in ids:
                f.unlink()
    try:
        from . import picks
        # nella classifica solo le partite non ancora iniziate
        picks.write([e["id"] for e in keep if e["date"] > now.isoformat()[:16]])
    except Exception:
        logging.exception("Classifica delle giocate non creata")
    from . import clubs_it
    clubs_it.apply()                   # nomi delle squadre in italiano, per ultimo (i confronti tra fonti sono già fatti)
    logging.info("Fatto: %d eventi", len(keep))


if __name__ == "__main__":
    main()
