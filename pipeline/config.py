"""Configurazione centrale: campionati, stagioni, percorsi."""
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DATA = ROOT / "public" / "data"
CACHE = ROOT / "data" / "cache"

# Calcio. kind "fd": file stagionali di football-data (con tiri, angoli, cartellini, xG);
# kind "fdnew": file unico per nazione (risultati e quote di chiusura). season: "aug" (agosto-maggio) o "cal" (anno solare).
SOCCER_LEAGUES = {
    "serie-a": {"name": "Serie A", "country": "Italia", "espn": "ita.1", "kind": "fd", "fd": "I1", "understat": "Serie_A", "season": "aug"},
    "premier-league": {"name": "Premier League", "country": "Inghilterra", "espn": "eng.1", "kind": "fd", "fd": "E0", "understat": "EPL", "season": "aug"},
    "la-liga": {"name": "LaLiga", "country": "Spagna", "espn": "esp.1", "kind": "fd", "fd": "SP1", "understat": "La_liga", "season": "aug"},
    "bundesliga": {"name": "Bundesliga", "country": "Germania", "espn": "ger.1", "kind": "fd", "fd": "D1", "understat": "Bundesliga", "season": "aug"},
    "ligue-1": {"name": "Ligue 1", "country": "Francia", "espn": "fra.1", "kind": "fd", "fd": "F1", "understat": "Ligue_1", "season": "aug"},
    "serie-b": {"name": "Serie B", "country": "Italia", "espn": "ita.2", "kind": "fd", "fd": "I2", "season": "aug"},
    "championship": {"name": "Championship", "country": "Inghilterra", "espn": "eng.2", "kind": "fd", "fd": "E1", "season": "aug"},
    "eredivisie": {"name": "Eredivisie", "country": "Olanda", "espn": "ned.1", "kind": "fd", "fd": "N1", "season": "aug"},
    "super-lig": {"name": "Süper Lig", "country": "Turchia", "espn": "tur.1", "kind": "fd", "fd": "T1", "season": "aug"},
    "scozia": {"name": "Premiership scozzese", "country": "Scozia", "espn": "sco.1", "kind": "fd", "fd": "SC0", "season": "aug"},
    "belgio": {"name": "Pro League belga", "country": "Belgio", "espn": "bel.1", "kind": "fd", "fd": "B1", "season": "aug"},
    "primeira-liga": {"name": "Primeira Liga", "country": "Portogallo", "espn": "por.1", "kind": "fd", "fd": "P1", "season": "aug"},
    "j1": {"name": "J1 League", "country": "Giappone", "espn": "jpn.1", "kind": "fdnew", "fdnew": ("JPN", "J1"), "season": "cal"},
    "mls": {"name": "MLS", "country": "Stati Uniti", "espn": "usa.1", "kind": "fdnew", "fdnew": ("USA", "MLS"), "season": "cal"},
    "eliteserien": {"name": "Eliteserien", "country": "Norvegia", "espn": "nor.1", "kind": "fdnew", "fdnew": ("NOR", "Eliteserien"), "season": "cal"},
}

# Coppe europee: modello unico su campionati europei (football-data) + partite di coppa (ESPN)
CUPS = {
    "champions": {"name": "Champions League", "espn": "uefa.champions"},
    "europa-league": {"name": "Europa League", "espn": "uefa.europa"},
    "conference": {"name": "Conference League", "espn": "uefa.europa.conf"},
}
WOMEN_CUPS = {"champions-femminile": {"name": "Champions League femminile", "espn": "uefa.wchampions"}}
# Campionati europei che servono solo a collegare le squadre delle coppe (oltre a quelli sopra di tipo "fd")
EURO_LINK_FD = {"G1": "Grecia"}   # Olanda, Belgio, Turchia e Scozia ora sono campionati seguiti (SOCCER_LEAGUES)
# ...e dai file per nazione di football-data (nome del campionato indicativo: se non coincide si usa l'unico del file)
EURO_LINK_FDNEW = [("AUT", "Bundesliga"), ("DNK", "Superliga"), ("POL", "Ekstraklasa"), ("ROU", "Liga 1"),
                   ("SWE", "Allsvenskan"), ("SWZ", "Super League"), ("NOR", "Eliteserien"), ("IRL", "Premier Division"),
                   ("FIN", "Veikkausliiga")]

# Nazionali (maschili). espn: codice ESPN; tournament: nome della competizione nello storico internazionale
# (serve a pesare le partite); logo: id del logo ESPN. Le competizioni fuori stagione non vengono interrogate.
NATIONAL = {
    "nations-league": {"name": "Nations League", "espn": "uefa.nations", "tournament": "UEFA Nations League", "logo": 2395},
    "mondiali": {"name": "Mondiali", "espn": "fifa.world", "tournament": "FIFA World Cup", "logo": 4},
    "europei": {"name": "Europei", "espn": "uefa.euro", "tournament": "UEFA Euro", "logo": 74},
    "qual-europei": {"name": "Qualificazioni Europei", "espn": "uefa.euroq", "tournament": "UEFA Euro qualification", "logo": 56},
    "qual-mondiali": {"name": "Qualificazioni Mondiali (Europa)", "espn": "fifa.worldq.uefa", "tournament": "FIFA World Cup qualification", "logo": 67},
    "qual-mondiali-sudamerica": {"name": "Qualificazioni Mondiali (Sudamerica)", "espn": "fifa.worldq.conmebol", "tournament": "FIFA World Cup qualification", "logo": 65},
    "qual-mondiali-concacaf": {"name": "Qualificazioni Mondiali (Nord e Centro America)", "espn": "fifa.worldq.concacaf", "tournament": "FIFA World Cup qualification", "logo": 64},
    "qual-mondiali-asia": {"name": "Qualificazioni Mondiali (Asia)", "espn": "fifa.worldq.afc", "tournament": "FIFA World Cup qualification", "logo": 62},
    "qual-mondiali-africa": {"name": "Qualificazioni Mondiali (Africa)", "espn": "fifa.worldq.caf", "tournament": "FIFA World Cup qualification", "logo": 63},
    "copa-america": {"name": "Copa América", "espn": "conmebol.america", "tournament": "Copa América", "logo": 83},
    "coppa-africa": {"name": "Coppa d'Africa", "espn": "caf.nations", "tournament": "African Cup of Nations", "logo": 76},
    "qual-coppa-africa": {"name": "Qualificazioni Coppa d'Africa", "espn": "caf.nations_qual", "tournament": "African Cup of Nations qualification", "logo": 76},
    "coppa-asia": {"name": "Coppa d'Asia", "espn": "afc.asian.cup", "tournament": "AFC Asian Cup", "logo": 2243},
    "gold-cup": {"name": "Gold Cup", "espn": "concacaf.gold", "tournament": "Gold Cup", "logo": 59},
    "concacaf-nations": {"name": "Nations League CONCACAF", "espn": "concacaf.nations.league", "tournament": "CONCACAF Nations League", "logo": 2406},
    "amichevoli": {"name": "Amichevoli", "espn": "fifa.friendly", "tournament": "Friendly", "logo": 53},
}

# Quanti giorni in avanti mostrare le partite
DAYS_AHEAD = {"soccer": 10, "cups": 14, "nba": 4, "tennis": 3, "national": 12}

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


def calendar_season_from(d: date | None = None) -> date:
    """Campionati ad anno solare (Giappone, MLS, Norvegia): a gennaio-febbraio vale ancora la stagione precedente."""
    d = d or today()
    return date(d.year if d.month >= 3 else d.year - 1, 1, 1)
