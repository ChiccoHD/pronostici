"""Quote in movimento: per ogni partita si ricorda la prima quota vista (senza margine) e si confronta con l'ultima.
Uno spostamento grande di solito vuol dire una notizia (infortunio, formazione, motivazioni). Campo `move` nell'elenco
({"i": esito, "from": p, "to": p, "since": data}); il Worker avvisa chi segue la partita. Le quote restano un confronto:
non entrano nel modello."""
from datetime import datetime, timedelta, timezone

from . import store
from .config import CACHE, PUBLIC_DATA

PATH = CACHE / "odds_first.json"
HIST = CACHE / "odds_hist.json"       # storia delle quote per il grafico nella scheda (campo `odds_hist` del file della partita)
HIST_MAX = 40
MIN_MOVE = 0.06        # da 6 punti in su la partita è "in movimento"


def apply(events: list[dict], status: dict):
    try:
        mem = store.load(PATH, {})
        hist = store.load(HIST, {})
        now = datetime.now(timezone.utc)
        keep, keep_h = {}, {}
        n = 0
        for e in events:
            b = e.get("book")
            if not b or e.get("final") or e.get("sport") == "f1":
                continue
            # storia: un punto nuovo solo se qualcosa si è mosso di almeno mezzo punto
            h = hist.get(e["id"]) or []
            if h and len(h[-1]) - 1 != len(b):
                h = []
            if not h or max(abs(b[i] - h[-1][i + 1]) for i in range(len(b))) >= 0.005:
                h = (h + [[now.isoformat(timespec="minutes")] + [round(x, 3) for x in b]])[-HIST_MAX:]
            keep_h[e["id"]] = h
            if len(h) >= 2:
                path = PUBLIC_DATA / "events" / f"{e['id']}.json"
                d = store.load(path)
                if d:
                    d["odds_hist"] = h
                    store.save(path, d)
            first = mem.get(e["id"])
            if not first or len(first["b"]) != len(b):
                first = {"b": b, "t": now.isoformat(timespec="minutes")}
            keep[e["id"]] = first
            diffs = [b[i] - first["b"][i] for i in range(len(b))]
            i = max(range(len(b)), key=lambda k: abs(diffs[k]))
            if abs(diffs[i]) >= MIN_MOVE:
                e["move"] = {"i": i, "from": round(first["b"][i], 3), "to": round(b[i], 3), "since": first["t"]}
                n += 1
            else:
                e.pop("move", None)
        # partite finite o sparite: si tengono solo 14 giorni
        lim = (now - timedelta(days=14)).isoformat()
        for k, v in mem.items():
            if k not in keep and v.get("t", "") > lim:
                keep[k] = v
        store.save(PATH, keep)
        for k, v in hist.items():
            if k not in keep_h and v and v[-1][0] > lim:
                keep_h[k] = v
        store.save(HIST, keep_h)
        status["quote_in_movimento"] = n
    except Exception as ex:  # mai bloccare l'aggiornamento
        status["quote_in_movimento"] = f"errore: {ex}"
