"""Punto d'ingresso: aggiorna tutti gli sport e scrive index.json, meta.json, affidabilita.json.
Uso: python -m pipeline.run [--solo calcio,nba,tennis]"""
import argparse
import logging
import shutil
from datetime import datetime, timezone

from . import config, store
from .config import PUBLIC_DATA

SPORTS = {"calcio": "build_soccer", "nba": "build_nba", "tennis": "build_tennis"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", default="calcio,nba,tennis")
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
    sport_prefix = {"calcio": "soccer", "nba": "nba", "tennis": "tennis"}
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
        if idx or not any(e["sport"] == sport_prefix[s] for e in events.values()):
            events = {k: v for k, v in events.items() if v["sport"] != sport_prefix[s]}
            events.update({e["id"]: e for e in idx})
        reliability.update({f"{s}:{k}": v for k, v in rel.items()})
        status[s] = {**st, "aggiornato": datetime.now(timezone.utc).isoformat(timespec="minutes")}

    now = datetime.now(timezone.utc)
    keep = sorted(events.values(), key=lambda e: e["date"])
    keep = [e for e in keep if datetime.fromisoformat(e["date"].replace("Z", "+00:00")).timestamp() > now.timestamp() - 3 * 3600]
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
    logging.info("Fatto: %d eventi", len(keep))


if __name__ == "__main__":
    main()
