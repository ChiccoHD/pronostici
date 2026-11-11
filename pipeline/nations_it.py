"""Nomi delle nazionali: da ESPN allo storico internazionale (ALIAS) e in italiano (IT)."""
import unicodedata

# nome ESPN -> nome nello storico (solo dove differiscono)
ALIAS = {
    "Bosnia-Herzegovina": "Bosnia and Herzegovina", "Chinese Taipei": "Taiwan", "Congo DR": "DR Congo",
    "Czechia": "Czech Republic", "Kyrgyz Republic": "Kyrgyzstan", "Türkiye": "Turkey", "Turkiye": "Turkey",
    "Ireland": "Republic of Ireland", "Rep. of Ireland": "Republic of Ireland", "USA": "United States",
    "Cape Verde Islands": "Cape Verde", "Cabo Verde": "Cape Verde", "Sao Tome and Principe": "São Tomé and Príncipe",
    "St. Kitts and Nevis": "Saint Kitts and Nevis", "St Kitts and Nevis": "Saint Kitts and Nevis", "St. Lucia": "Saint Lucia",
    "St. Vincent and the Grenadines": "Saint Vincent and the Grenadines", "Korea Republic": "South Korea",
    "Korea DPR": "North Korea", "IR Iran": "Iran", "Macedonia": "North Macedonia", "FYR Macedonia": "North Macedonia",
    "The Gambia": "Gambia", "Côte d'Ivoire": "Ivory Coast", "Cote d'Ivoire": "Ivory Coast", "Swaziland": "Eswatini",
    "US Virgin Islands": "United States Virgin Islands", "East Timor": "Timor-Leste", "Curacao": "Curaçao",
    "Brunei Darussalam": "Brunei", "Hong Kong, China": "Hong Kong", "Congo Republic": "Congo",
}

IT = {
    "Albania": "Albania", "Andorra": "Andorra", "Argentina": "Argentina", "Armenia": "Armenia", "Australia": "Australia",
    "Austria": "Austria", "Azerbaijan": "Azerbaigian", "Belarus": "Bielorussia", "Belgium": "Belgio", "Bolivia": "Bolivia",
    "Bosnia and Herzegovina": "Bosnia ed Erzegovina", "Brazil": "Brasile", "Bulgaria": "Bulgaria", "Cameroon": "Camerun",
    "Canada": "Canada", "Cape Verde": "Capo Verde", "Chile": "Cile", "China": "Cina", "Colombia": "Colombia",
    "Costa Rica": "Costa Rica", "Croatia": "Croazia", "Cyprus": "Cipro", "Czech Republic": "Repubblica Ceca",
    "Denmark": "Danimarca", "DR Congo": "RD del Congo", "Congo": "Congo", "Ecuador": "Ecuador", "Egypt": "Egitto",
    "England": "Inghilterra", "Estonia": "Estonia", "Faroe Islands": "Isole Fær Øer", "Finland": "Finlandia",
    "France": "Francia", "Georgia": "Georgia", "Germany": "Germania", "Ghana": "Ghana", "Gibraltar": "Gibilterra",
    "Greece": "Grecia", "Hungary": "Ungheria", "Iceland": "Islanda", "India": "India", "Indonesia": "Indonesia",
    "Iran": "Iran", "Iraq": "Iraq", "Israel": "Israele", "Italy": "Italia", "Ivory Coast": "Costa d'Avorio",
    "Jamaica": "Giamaica", "Japan": "Giappone", "Jordan": "Giordania", "Kazakhstan": "Kazakistan", "Kosovo": "Kosovo",
    "Kuwait": "Kuwait", "Kyrgyzstan": "Kirghizistan", "Latvia": "Lettonia", "Lebanon": "Libano", "Liechtenstein": "Liechtenstein",
    "Lithuania": "Lituania", "Luxembourg": "Lussemburgo", "Malaysia": "Malesia", "Malta": "Malta", "Mexico": "Messico",
    "Moldova": "Moldavia", "Montenegro": "Montenegro", "Morocco": "Marocco", "Netherlands": "Paesi Bassi",
    "New Zealand": "Nuova Zelanda", "Nigeria": "Nigeria", "North Korea": "Corea del Nord", "North Macedonia": "Macedonia del Nord",
    "Northern Ireland": "Irlanda del Nord", "Norway": "Norvegia", "Panama": "Panama", "Paraguay": "Paraguay", "Peru": "Perù",
    "Poland": "Polonia", "Portugal": "Portogallo", "Qatar": "Qatar", "Republic of Ireland": "Irlanda", "Romania": "Romania",
    "Russia": "Russia", "San Marino": "San Marino", "Saudi Arabia": "Arabia Saudita", "Scotland": "Scozia", "Senegal": "Senegal",
    "Serbia": "Serbia", "Singapore": "Singapore", "Slovakia": "Slovacchia", "Slovenia": "Slovenia", "South Africa": "Sudafrica",
    "South Korea": "Corea del Sud", "Spain": "Spagna", "Sweden": "Svezia", "Switzerland": "Svizzera", "Syria": "Siria",
    "Taiwan": "Taipei Cinese", "Thailand": "Thailandia", "Tunisia": "Tunisia", "Turkey": "Turchia", "Ukraine": "Ucraina",
    "United Arab Emirates": "Emirati Arabi Uniti", "United States": "Stati Uniti", "Uruguay": "Uruguay", "Uzbekistan": "Uzbekistan",
    "Venezuela": "Venezuela", "Vietnam": "Vietnam", "Wales": "Galles", "Algeria": "Algeria", "Mali": "Mali",
    "Burkina Faso": "Burkina Faso", "Guinea": "Guinea", "Equatorial Guinea": "Guinea Equatoriale", "Guinea-Bissau": "Guinea-Bissau",
    "Zambia": "Zambia", "Zimbabwe": "Zimbabwe", "Sudan": "Sudan", "Somalia": "Somalia", "Sierra Leone": "Sierra Leone",
    "Namibia": "Namibia", "Madagascar": "Madagascar", "Eritrea": "Eritrea", "Benin": "Benin", "Gambia": "Gambia",
    "Central African Republic": "Repubblica Centrafricana", "Chad": "Ciad", "Gabon": "Gabon", "Libya": "Libia",
    "Ethiopia": "Etiopia", "Kenya": "Kenya", "Uganda": "Uganda", "Tanzania": "Tanzania", "Angola": "Angola",
    "Mozambique": "Mozambico", "Haiti": "Haiti", "Honduras": "Honduras", "El Salvador": "El Salvador", "Guatemala": "Guatemala",
    "Nicaragua": "Nicaragua", "Cuba": "Cuba", "Trinidad and Tobago": "Trinidad e Tobago", "Curaçao": "Curaçao",
    "Suriname": "Suriname", "Guyana": "Guyana", "Barbados": "Barbados", "Bermuda": "Bermuda", "Aruba": "Aruba",
    "Antigua and Barbuda": "Antigua e Barbuda", "Cayman Islands": "Isole Cayman", "Martinique": "Martinica",
    "Guadeloupe": "Guadalupa", "Bonaire": "Bonaire", "Palestine": "Palestina", "Bahrain": "Bahrein", "Yemen": "Yemen",
    "Oman": "Oman", "Tajikistan": "Tagikistan", "Turkmenistan": "Turkmenistan", "Philippines": "Filippine",
    "Hong Kong": "Hong Kong", "Eswatini": "Eswatini", "Tahiti": "Tahiti", "Cook Islands": "Isole Cook",
    "New Caledonia": "Nuova Caledonia", "Fiji": "Figi", "Papua New Guinea": "Papua Nuova Guinea", "Solomon Islands": "Isole Salomone",
}


def _plain(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()


def to_history(espn_name: str, known: set[str]) -> str | None:
    """Nome dello storico per una nazionale ESPN (None se non si trova)."""
    n = ALIAS.get(espn_name, espn_name)
    if n in known:
        return n
    plain = {_plain(k): k for k in known}
    return plain.get(_plain(n))


def it(name: str) -> str:
    return IT.get(name, name)
