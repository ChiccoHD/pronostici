"""Nomi delle squadre di club in italiano (Marseille → Marsiglia, Bayern Munich → Bayern Monaco...).
L'elenco sta in public/clubs_it.json (lo legge anche il telefono per aggiornare squadre seguite e schedine salvate).
Si applica alla fine di run.py a tutti i JSON di public/data: i confronti tra fonti avvengono prima, sui nomi originali.
Idempotente: nessun nome italiano contiene un nome dell'elenco."""
import json
import logging
import re
from pathlib import Path

from .config import PUBLIC_DATA

log = logging.getLogger("clubs_it")
MAP_FILE = Path(__file__).resolve().parent.parent / "public" / "clubs_it.json"
SKIP_DIRS = {"tennis"}


def load_map() -> dict:
    m = json.loads(MAP_FILE.read_text(encoding="utf-8"))
    m = {k: v for k, v in m.items() if k != v}
    # un nome italiano non deve contenere un nome da tradurre (si tradurrebbe due volte)
    pat = re.compile(r"(?<![\w])(" + "|".join(sorted(map(re.escape, m), key=len, reverse=True)) + r")(?![\w])")
    bad = [k for k, v in m.items() if pat.search(v)]
    for k in bad:
        log.warning("Nome italiano scartato (contiene un altro nome): %s → %s", k, m[k])
        m.pop(k)
    return m


def translator(m: dict):
    if not m:
        return lambda s: s
    pat = re.compile(r"(?<![\w])(" + "|".join(sorted(map(re.escape, m), key=len, reverse=True)) + r")(?![\w])")

    def tr(s: str) -> str:
        if len(s) > 400 or s.startswith("http"):
            return s
        return pat.sub(lambda x: m[x.group(1)], s)
    return tr


def _walk(o, tr):
    if isinstance(o, str):
        return tr(o)
    if isinstance(o, list):
        return [_walk(x, tr) for x in o]
    if isinstance(o, dict):
        return {(tr(k) if isinstance(k, str) else k): _walk(v, tr) for k, v in o.items()}
    return o


def apply(status: dict | None = None):
    try:
        tr = translator(load_map())
        n = 0
        for f in PUBLIC_DATA.rglob("*.json"):
            if any(p in SKIP_DIRS for p in f.relative_to(PUBLIC_DATA).parts[:-1]):
                continue
            raw = f.read_text(encoding="utf-8")
            data = json.loads(raw)
            new = _walk(data, tr)
            if new != data:
                pretty = raw.startswith("{\n") or raw.startswith("[\n")
                f.write_text(json.dumps(new, ensure_ascii=False, indent=1 if pretty else None,
                                        separators=None if pretty else (",", ":")), encoding="utf-8")
                n += 1
        if status is not None:
            status["nomi_italiani"] = f"{n} file"
    except Exception:
        log.exception("Nomi in italiano non applicati")
