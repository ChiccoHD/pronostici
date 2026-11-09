"""Configurazione centrale: campionati, stagioni, percorsi."""
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DATA = ROOT / "public" / "data"
CACHE = ROOT / "data" / "cache"

# Calcio: codice ESPN, codice football-data.co.uk, codice Understat
SOCCER_LEAGUES = {
    "serie-a": {"name": "Serie A", "country": "Italia", "espn": "ita.1", "fd": "I1", "understat": "Serie_A"},
    "premier-league": {"name": "Premier League", "country": "Inghilterra", "espn": "eng.1", "fd": "E0", "understat": "EPL"},
    "la-liga": {"name": "LaLiga", "country": "Spagna", "espn": "esp.1", "fd": "SP1", "understat": "La_liga"},
    "bundesliga": {"name": "Bundesliga", "country": "Germania", "espn": "ger.1", "fd": "D1", "understat": "Bundesliga"},
    "ligue-1": {"name": "Ligue 1", "country": "Francia", "espn": "fra.1", "fd": "F1", "understat": "Ligue_1"},
}

# Quanti giorni in avanti mostrare le partite
DAYS_AHEAD = {"soccer": 10, "nba": 4, "tennis": 3}

# Pausa tra una richiesta e l'altra verso la stessa fonte (secondi)
POLITE_DELAY = 0.6


def today() -> date:
    return datetime.now(timezone.utc).date()


def soccer_season_start_year(d: date | None = None) -> int:
    """Le stagioni europee iniziano a luglio/agosto."""
    d = d or today()
    return d.year if d.month >= 7 else d.year - 1


def fd_season_code(start_year: int) -> str:
    """2026 -> '2627' (formato football-data.co.uk)."""
    return f"{start_year % 100:02d}{(start_year + 1) % 100:02d}"


def nba_season_start_year(d: date | None = None) -> int:
    """La stagione NBA inizia a ottobre; prima di agosto vale quella precedente."""
    d = d or today()
    return d.year if d.month >= 8 else d.year - 1
