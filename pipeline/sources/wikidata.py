"""Wikidata (l'archivio dietro Wikipedia): foto dei calciatori da Wikimedia Commons, con licenze libere.
Una sola richiesta cerca molti giocatori insieme. Gratuito e senza chiave: chiede solo un User-Agent riconoscibile."""
import logging

from .. import http
from ..names import norm

log = logging.getLogger("wikidata")
SPARQL = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "pronostici-personale/1.0 (https://github.com/ChiccoHD; uso personale, poche richieste)",
      "Accept": "application/sparql-results+json"}
BATCH = 40     # nomi per richiesta
DELAY = 3.0    # secondi tra una richiesta e l'altra
FOOTBALLER = "Q937857"   # calciatore


def _lit(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _query(names: list[str]) -> str:
    values = " ".join(f"{_lit(n)}@{lang}" for n in names for lang in ("en", "mul"))
    return f"""SELECT ?p ?name ?img (GROUP_CONCAT(DISTINCT ?tl; separator="|") AS ?teams) WHERE {{
  VALUES ?name {{ {values} }}
  ?p rdfs:label ?name ; wdt:P106 wd:{FOOTBALLER} ; wdt:P18 ?img .
  OPTIONAL {{ ?p p:P54 ?st . ?st ps:P54 ?team . FILTER NOT EXISTS {{ ?st pq:P582 [] }}
             ?team rdfs:label ?tl . FILTER(LANG(?tl) IN ("en", "mul")) }}
}} GROUP BY ?p ?name ?img"""


def thumb(file_url: str, width: int = 160) -> str:
    """Indirizzo della foto di Commons ridotta (Special:FilePath fa da sé il ridimensionamento)."""
    return file_url.replace("http://", "https://", 1) + f"?width={width}"


def _same_team(a: str, b: str) -> bool:
    import difflib
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    return a == b or a in b or b in a or difflib.SequenceMatcher(None, a, b).ratio() >= 0.8


def footballer_photos(players: list[tuple[str, list[str]]]) -> dict[str, str | None] | None:
    """players: [(nome, [nomi possibili della squadra])]. Restituisce {nome: foto o None},
    oppure None se Wikidata non risponde. Con due calciatori omonimi vince quello della squadra giusta;
    se nessuno gioca lì, si accetta solo se il nome è di una persona sola."""
    out: dict[str, str | None] = {}
    names = list(dict.fromkeys(n for n, _ in players if n))
    teams_of = {n: t for n, t in players}
    for i in range(0, len(names), BATCH):
        chunk = names[i:i + BATCH]
        data = http.get_json(SPARQL, {"query": _query(chunk), "format": "json"}, delay=DELAY, tries=2,
                             timeout=60, headers=UA)
        if data is None:
            return out or None
        found: dict[str, list[tuple[str, list[str]]]] = {}
        for b in data.get("results", {}).get("bindings", []):
            n = b["name"]["value"]
            found.setdefault(n, []).append((b["img"]["value"], (b.get("teams", {}).get("value") or "").split("|")))
        for n in chunk:
            cands = {img: teams for img, teams in found.get(n, [])}
            mine = [img for img, teams in cands.items()
                    if any(_same_team(t, my) for t in teams for my in teams_of.get(n, []) if my and t)]
            if mine:
                out[n] = thumb(mine[0])
            elif len(cands) == 1:
                out[n] = thumb(next(iter(cands)))
            else:
                out[n] = None
    return out
