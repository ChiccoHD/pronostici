"""TheSportsDB: archivio gratuito curato da volontari. Qui serve solo per le foto dei calciatori
che ESPN non ha. Chiave pubblica gratuita, 30 richieste al minuto, un solo risultato per ricerca."""
import difflib
import logging

from .. import http
from ..names import norm

log = logging.getLogger("thesportsdb")
BASE = "https://www.thesportsdb.com/api/v1/json/123"
DELAY = 2.4  # resta sotto le 30 richieste al minuto


def _same_team(a: str, b: str) -> bool:
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    return a == b or a in b or b in a or difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def player_photo(name: str, teams: list[str]) -> tuple[str | None, bool]:
    """Foto di un calciatore cercato per nome. La squadra deve coincidere, così un omonimo
    non finisce con la faccia sbagliata. Restituisce (indirizzo o None, la fonte ha risposto)."""
    data = http.get_json(f"{BASE}/searchplayers.php", {"p": name.replace(" ", "_")}, delay=DELAY, tries=2)
    if data is None:
        return None, False
    for p in data.get("player") or []:
        if (p.get("strSport") or "") != "Soccer":
            continue
        if not any(_same_team(p.get("strTeam") or "", t) for t in teams if t):
            continue
        url = p.get("strCutout") or p.get("strThumb")
        if url:
            return url.rstrip("/") + "/small", True  # anteprima da 250 px
    return None, True
