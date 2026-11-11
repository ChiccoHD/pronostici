"""Abbinamento dei nomi tra fonti diverse (es. 'Internazionale' su ESPN = 'Inter' su football-data)."""
import difflib
import re
import unicodedata

_DROP = {
    "fc", "cf", "ac", "as", "ss", "ssc", "us", "afc", "sc", "vfl", "vfb", "tsg", "club", "calcio",
    "de", "del", "la", "le", "rcd", "ud", "cd", "sd", "ca", "sv", "bc", "1", "04", "05", "1846",
    "1899", "1909", "1910", "1913", "hsc", "ogc", "losc", "rc", "aj", "ec", "sco", "fk", "the",
    "and", "stade", "olympique", "hove", "albion", "hotspur", "wanderers", "29", "football",
}

# Varianti note -> forma usata da football-data.co.uk (già normalizzata)
ALIASES = {
    # nomi ESPN che non somigliano a quelli di football-data
    "deportivo": "la coruna", "deportivo la coruna": "la coruna", "hamarkameratene": "hamkam",
    "tokyo verdy 1969": "verdy", "tokyo verdy": "verdy", "urawa red diamonds": "urawa reds",
    "red bull new york": "new york red bulls", "new york red bulls": "new york red bulls",
    # Italia
    "internazionale": "inter", "inter milan": "inter", "milan": "milan", "hellas verona": "verona",
    "roma": "roma", "napoli": "napoli",
    # Inghilterra
    "manchester city": "man city", "manchester united": "man united", "man utd": "man united",
    "newcastle united": "newcastle", "newcastle utd": "newcastle", "nottingham forest": "nottm forest",
    "nottingham": "nottm forest", "wolverhampton": "wolves", "west ham united": "west ham",
    "leeds united": "leeds", "leicester city": "leicester", "sheffield united": "sheffield united",
    "ipswich town": "ipswich", "luton town": "luton", "afc bournemouth": "bournemouth",
    "brighton": "brighton", "tottenham": "tottenham", "spurs": "tottenham",
    "sunderland": "sunderland", "burnley": "burnley",
    # Spagna
    "atletico madrid": "ath madrid", "atletico": "ath madrid", "atl madrid": "ath madrid",
    "athletic": "ath bilbao", "athletic bilbao": "ath bilbao", "real betis": "betis",
    "real sociedad": "sociedad", "celta vigo": "celta", "celta": "celta", "espanyol": "espanol",
    "rayo vallecano": "vallecano", "alaves": "alaves", "deportivo alaves": "alaves",
    "real oviedo": "oviedo", "real valladolid": "valladolid", "real mallorca": "mallorca",
    "mallorca": "mallorca", "girona": "girona", "leganes": "leganes", "las palmas": "las palmas",
    "levante": "levante", "elche": "elche", "osasuna": "osasuna", "sevilla": "sevilla",
    "barcelona": "barcelona", "real madrid": "real madrid",
    # Germania
    "bayern munchen": "bayern munich", "bayern": "bayern munich", "borussia dortmund": "dortmund",
    "bayer leverkusen": "leverkusen", "eintracht frankfurt": "ein frankfurt",
    "borussia monchengladbach": "mgladbach", "monchengladbach": "mgladbach",
    "borussia mgladbach": "mgladbach", "wolfsburg": "wolfsburg", "freiburg": "freiburg",
    "hoffenheim": "hoffenheim", "mainz": "mainz", "mainz 05": "mainz", "augsburg": "augsburg",
    "stuttgart": "stuttgart", "union berlin": "union berlin", "werder bremen": "werder bremen",
    "bochum": "bochum", "heidenheim": "heidenheim", "st pauli": "st pauli", "hamburg": "hamburg",
    "hamburger": "hamburg", "koln": "fc koln", "cologne": "fc koln", "holstein kiel": "holstein kiel",
    "rb leipzig": "rb leipzig", "leipzig": "rb leipzig", "darmstadt": "darmstadt",
    # Francia
    "paris saint germain": "paris sg", "psg": "paris sg", "paris": "paris sg",
    "marseille": "marseille", "lyon": "lyon", "lyonnais": "lyon", "monaco": "monaco",
    "lille": "lille", "rennais": "rennes", "rennes": "rennes", "nice": "nice", "lens": "lens",
    "nantes": "nantes", "strasbourg": "strasbourg", "brestois": "brest", "brest": "brest",
    "toulouse": "toulouse", "reims": "reims", "montpellier": "montpellier", "le havre": "le havre",
    "havre": "le havre", "auxerre": "auxerre", "angers": "angers", "saint etienne": "st etienne",
    "st etienne": "st etienne", "lorient": "lorient", "metz": "metz", "paris fc": "paris fc",
    # Portogallo e altri campionati europei (per le coppe)
    "sporting cp": "sp lisbon", "sporting": "sp lisbon", "sporting lisbon": "sp lisbon", "sporting braga": "sp braga",
    "braga": "sp braga", "fc porto": "porto", "porto": "porto", "benfica": "benfica", "vitoria guimaraes": "guimaraes",
    "psv": "psv eindhoven", "psv eindhoven": "psv eindhoven", "az": "az alkmaar", "az alkmaar": "az alkmaar",
    "feyenoord": "feyenoord", "ajax": "ajax", "twente": "twente", "utrecht": "utrecht", "go ahead eagles": "go ahead eagles",
    "club brugge": "club brugge", "union st gilloise": "st gilloise", "royale union st gilloise": "st gilloise",
    "union saint gilloise": "st gilloise", "anderlecht": "anderlecht", "genk": "genk", "gent": "gent", "antwerp": "antwerp",
    "galatasaray": "galatasaray", "fenerbahce": "fenerbahce", "besiktas": "besiktas", "trabzonspor": "trabzonspor",
    "istanbul basaksehir": "buyuksehyr", "basaksehir": "buyuksehyr", "olympiacos": "olympiakos", "olympiakos": "olympiakos",
    "paok": "paok", "paok salonika": "paok", "aek athens": "aek", "panathinaikos": "panathinaikos",
    "celtic": "celtic", "rangers": "rangers", "hearts": "hearts", "heart of midlothian": "hearts", "aberdeen": "aberdeen",
    "hibernian": "hibernian", "sint truidense": "st truiden", "kobenhavn": "copenhagen", "fc kobenhavn": "copenhagen",
    "rb salzburg": "salzburg", "red bull salzburg": "salzburg", "sk sturm graz": "sturm graz", "rapid vienna": "rapid vienna",
    "malmo": "malmo ff", "fcsb": "fcsb", "csu craiova": "u craiova",
    # MLS e Giappone (nomi brevi di football-data)
    "lafc": "los angeles fc", "la galaxy": "la galaxy", "new york red bulls": "ny red bulls",
    "new york city": "new york city", "atlanta united": "atlanta utd", "inter miami": "inter miami",
}


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " ").replace("'", "").replace(".", " ").replace("-", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    toks = [t for t in s.split() if t not in _DROP]
    return " ".join(toks)


class Matcher:
    """Abbina nomi esterni a un insieme di nomi canonici (quelli di football-data)."""

    def __init__(self, canonical: list[str], min_score: float = 0.72):
        self.min_score = min_score
        self.canonical = sorted(set(canonical))
        self._by_key = {norm(c): c for c in self.canonical}
        self._cache: dict[str, str | None] = {}

    def match(self, name: str) -> str | None:
        if name in self._cache:
            return self._cache[name]
        res = self._match(name)
        self._cache[name] = res
        return res

    def _match(self, name: str) -> str | None:
        if not name:
            return None
        if name in self.canonical:
            return name
        k = norm(name)
        if k in self._by_key:
            return self._by_key[k]
        alias = ALIASES.get(k)
        if alias and norm(alias) in self._by_key:
            return self._by_key[norm(alias)]
        # Prova i prefissi/sottoinsiemi di parole
        kt = set(k.split())
        best, best_score = None, 0.0
        for ck, c in self._by_key.items():
            ct = set(ck.split())
            if not ct or not kt:
                continue
            if ct <= kt or kt <= ct:
                score = len(ct & kt) / max(len(ct | kt), 1) + 0.5
            else:
                score = difflib.SequenceMatcher(None, k, ck).ratio()
            if score > best_score:
                best, best_score = c, score
        return best if best_score >= self.min_score else None


def person_key(full_name: str) -> str:
    """'Alex de Minaur' -> 'deminaur a' ; 'De Minaur A.' -> 'deminaur a'."""
    s = unicodedata.normalize("NFKD", full_name or "").encode("ascii", "ignore").decode()
    s = s.strip()
    if re.search(r"\s[A-Z](\.[A-Z])*\.?$", s):  # formato tennis-data: 'Cognome N.'
        parts = s.rsplit(" ", 1)
        last, init = parts[0], parts[1][0]
    else:
        parts = s.split(" ", 1)
        if len(parts) == 1:
            return parts[0].lower()
        init, last = parts[0][0], parts[1]
    last = re.sub(r"[^a-z]", "", last.lower())
    return f"{last} {init.lower()}"
