"""Punto d'ingresso: aggiorna tutti gli sport e scrive index.json, meta.json, affidabilita.json.
Uso: python -m pipeline.run [--solo calcio,nba,tennis]"""
import argparse
import logging
import shutil
from datetime import datetime, timezone

from . import config, store
from .config import PUBLIC_DATA

SPORTS = {"calcio": "build_soccer", "coppe": "build_cups", "nazionali": "build_national", "nba": "build_nba", "tennis": "build_tennis"}
CUP_KEYS = set(config.CUPS) | set(config.WOMEN_CUPS)
NATIONAL_KEYS = set(config.NATIONAL)


def owner(e: dict) -> str:
    """Quale modulo ha prodotto un evento (per sostituire solo i suoi)."""
    if e["sport"] == "soccer":
        return "coppe" if e["league"] in CUP_KEYS else "nazionali" if e["league"] in NATIONAL_KEYS else "calcio"
    return e["sport"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", default="calcio,coppe,nazionali,nba,tennis")
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
        if idx or not any(owner(e) == s for e in events.values()):
            events = {k: v for k, v in events.items() if owner(v) != s}
            events.update({e["id"]: e for e in idx})
        reliability.update({f"{s}:{k}": v for k, v in rel.items()})
        status[s] = {**st, "aggiornato": datetime.now(timezone.utc).isoformat(timespec="minutes")}

    now = datetime.now(timezone.utc)
    keep = sorted(events.values(), key=lambda e: e["date"])
    # le partite restano fino a 4 ore dopo l'inizio; nel tennis l'orario è spesso indicativo
    # (incontri "a seguire"), quindi restano fino a 24 ore
    def alive(e):
        hours = 24 if e["sport"] == "tennis" or e.get("time_valid") is False else 4
        return datetime.fromisoformat(e["date"].replace("Z", "+00:00")).timestamp() > now.timestamp() - hours * 3600
    keep = [e for e in keep if alive(e)]
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
        picks.write([e["id"] for e in keep])
    except Exception:
        logging.exception("Classifica delle giocate non creata")
    logging.info("Fatto: %d eventi", len(keep))


if __name__ == "__main__":
    main()
