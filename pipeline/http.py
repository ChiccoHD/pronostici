"""Richieste HTTP gentili: tentativi ripetuti, pausa tra le chiamate, niente martellamento."""
import time
import logging

import requests

log = logging.getLogger("http")

_session = requests.Session()
_session.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; pronostici-personale/1.0)",
    "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
})
_last_call: dict[str, float] = {}


def _wait(host: str, delay: float) -> None:
    last = _last_call.get(host, 0.0)
    gap = time.time() - last
    if gap < delay:
        time.sleep(delay - gap)
    _last_call[host] = time.time()


def get(url: str, params: dict | None = None, *, delay: float = 0.6, tries: int = 3,
        timeout: int = 30, headers: dict | None = None) -> requests.Response | None:
    """GET con tentativi. Restituisce None se la fonte non risponde."""
    host = url.split("/")[2]
    for attempt in range(1, tries + 1):
        _wait(host, delay)
        try:
            r = _session.get(url, params=params, timeout=timeout, headers=headers)
            if r.status_code == 200:
                return r
            if r.status_code in (404, 400):
                log.warning("HTTP %s per %s", r.status_code, r.url)
                return None
            log.warning("HTTP %s per %s (tentativo %d)", r.status_code, r.url, attempt)
        except requests.RequestException as e:
            log.warning("Errore rete %s (tentativo %d): %s", url, attempt, e)
        time.sleep(2 * attempt)
    return None


def get_json(url: str, params: dict | None = None, **kw):
    r = get(url, params, **kw)
    if r is None:
        return None
    try:
        return r.json()
    except ValueError:
        log.warning("Risposta non JSON da %s", url)
        return None
