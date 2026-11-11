"""Storico delle partite tra nazionali dal 1872 (dataset pubblico "international_results" su GitHub, aggiornato
dopo ogni finestra internazionale). Gratuito; serve solo per lo storico, le partite in arrivo vengono da ESPN."""
import csv
import io
import logging

from .. import http

log = logging.getLogger("intl")
URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv"


def matches(since: str) -> list[dict] | None:
    """Partite giocate dal giorno indicato (AAAA-MM-GG); None se la fonte non risponde."""
    r = http.get(URL, delay=0.6, timeout=60)
    if r is None:
        return None
    out = []
    for row in csv.DictReader(io.StringIO(r.content.decode("utf-8"))):
        if row["date"] < since or row["home_score"] in ("", "NA") or row["away_score"] in ("", "NA"):
            continue
        out.append({"date": row["date"], "home": row["home_team"], "away": row["away_team"],
                    "hg": float(row["home_score"]), "ag": float(row["away_score"]),
                    "tournament": row["tournament"], "neutral": row["neutral"].upper() == "TRUE"})
    return out
