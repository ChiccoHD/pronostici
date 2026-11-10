"""TheSportsDB: archivio gratuito curato da volontari. Qui serve solo per le foto dei calciatori
che ESPN non ha. Chiave pubblica gratuita, 30 richieste al minuto, un solo risultato per ricerca."""
import difflib
import logging
import time

from .. import http
from ..names import norm

log = logging.getLogger("thesportsdb")
BASE = "https://www.thesportsdb.com/api/v1/json/123"
DELAY = 2.4  # resta sotto le 30 richieste al minuto
MAX_FAILS = 4  # rifiuti di fila prima di lasciar perdere per questo aggiornamento
_fails = 0


def _same_team(a: str, b: str) -> bool:
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    return a == b or a in b or b in a or difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def player_photo(name: str, teams: list[str]) -> tuple[str | None, bool]:
    """Foto di un calciatore cercato per nome. La squadra deve coincidere, così un omonimo
    non finisce con la faccia sbagliata. Restituisce (indirizzo o None, la fonte ha risposto)."""
    global _fails
    if _fails >= MAX_FAILS:  # la fonte sta rifiutando (chiave pubblica condivisa): si riprova al prossimo aggiornamento
        return None, False
    data = http.get_json(f"{BASE}/searchplayers.php", {"p": name.replace(" ", "_")}, delay=DELAY, tries=1)
    if data is None:
        _fails += 1
        if _fails < MAX_FAILS:
            time.sleep(30)  # il limite è al minuto: una pausa di solito basta
        return None, False
    _fails = 0
    for p in data.get("player") or []:
        if (p.get("strSport") or "") != "Soccer":
            continue
        if not any(_same_team(p.get("strTeam") or "", t) for t in teams if t):
            continue
        url = p.get("strCutout") or p.get("strThumb")
        if url:
            return url.rstrip("/") + "/small", True  # anteprima da 250 px
    return None, True
