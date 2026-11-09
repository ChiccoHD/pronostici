"""Lettura/scrittura JSON compatti per cache e output del sito."""
import json
from pathlib import Path


def load(path: Path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(path: Path, obj, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(obj, f, ensure_ascii=False, indent=1, default=_default)
        else:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), default=_default)
    tmp.replace(path)


def _default(o):
    try:
        import numpy as np
        if isinstance(o, np.integer):
            return int(o)
        if isinstance(o, np.floating):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
    except ImportError:
        pass
    raise TypeError(f"Tipo non serializzabile: {type(o)}")
