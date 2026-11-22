"""Kalshi: mercato di previsione regolamentato negli Stati Uniti, dati pubblici e gratuiti senza chiave.
Vincitore, podio, pole, giro veloce e testa a testa dei GP di F1. Come Polymarket: solo confronto, mai dentro il modello.
Prezzi in dollari da 0 a 1 = probabilità (campi *_dollars, verificato con Verifica fonti, modo griglia)."""
import logging
import re

from .. import http
from .polymarket import norm

log = logging.getLogger("kalshi")
BASE = "https://api.elections.kalshi.com/trade-api/v2"
DELAY = 1.5
SERIES = {"KXF1RACE": "win", "KXF1RACEPODIUM": "podium", "KXF1POLE": "pole", "KXF1FASTLAP": "fl"}
MAX_SPREAD = 0.12      # differenza massima tra chi compra e chi vende per fidarsi del prezzo medio


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def price(m: dict) -> float | None:
    """Prezzo del Sì: a metà tra domanda e offerta se sono vicine, altrimenti l'ultimo scambio (se c'è stato volume)."""
    bid, ask, last = _f(m.get("yes_bid_dollars")), _f(m.get("yes_ask_dollars")), _f(m.get("last_price_dollars"))
    if bid is not None and ask is not None and 0 < ask and ask - bid <= MAX_SPREAD:
        p = (bid + ask) / 2
    elif last and (_f(m.get("volume_fp")) or 0) > 0:
        p = last
    else:
        return None
    return p if 0 < p < 1 else None


def _events(series: str) -> list[dict]:
    js = http.get_json(f"{BASE}/events", {"series_ticker": series, "status": "open", "with_nested_markets": "true"}, delay=DELAY) or {}
    return js.get("events") or []


def _match(title: str, keys: list[str]) -> bool:
    t = norm(title)
    return any(k in t for k in keys) and "sprint" not in t


def gp_markets(race_name: str, locality: str) -> dict | None:
    """{"win": {nome: p}, "podium": ..., "pole": ..., "fl": ..., "h2h": [[nomeA, nomeB, pA, volume]]} per il GP."""
    keys = [k for k in {norm(race_name), norm(locality)} if k]
    out = {"win": {}, "podium": {}, "pole": {}, "fl": {}, "h2h": []}
    try:
        for ser, k in SERIES.items():
            for e in _events(ser):
                if not _match(e.get("title") or "", keys):
                    continue
                for m in e.get("markets") or []:
                    who = (m.get("yes_sub_title") or m.get("no_sub_title") or "").strip()
                    p = price(m)
                    if who and p is not None:
                        out[k][who] = p
        for e in _events("KXF1H2H"):
            for m in e.get("markets") or []:
                t = m.get("title") or ""
                mm = re.match(r"Will (.+?) beat (.+?) in the (.+?)\?", t)
                if not mm or not _match(mm.group(3), keys):
                    continue
                p = price(m)
                if p is not None:
                    out["h2h"].append([mm.group(1), mm.group(2), p, _f(m.get("volume_fp")) or 0])
    except Exception:
        log.exception("Kalshi")
        return None
    return out if any(out[k] for k in out) else None
