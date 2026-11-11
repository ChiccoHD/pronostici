# Taratura dei modelli (11 novembre 2026)

Le previsioni sono state rifatte partita per partita usando solo i dati disponibili prima di ciascuna,
con impostazioni diverse. Le impostazioni si scelgono su un periodo e si controllano su un altro mai usato
per sceglierle, così non si "impara a memoria" il passato. Misura: perdita logaritmica media (più bassa è meglio).

## Calcio (12 campionati con dati football-data: Serie A, Premier, LaLiga, Bundesliga, Ligue 1, Portogallo,
Serie B, Championship, Eredivisie, Süper Lig, Scozia, Belgio)

Scelta sulla stagione 2025-26, controllo sulla 2026-27 fino a novembre.

| | 1X2 scelta | O/U 2,5 scelta | 1X2 controllo | O/U 2,5 controllo |
|---|---|---|---|---|
| Prima | 1,0090 | 0,6972 | 0,9966 | 0,6811 |
| Dopo | 1,0045 | 0,6874 | 0,9944 | 0,6739 |
| Bookmaker (senza margine) | 0,9873 | 0,6785 | 0,9736 | 0,6639 |

Cosa è cambiato:
- **Tiri in porta** come segnale in più insieme a gol ed xG (convertiti in gol con la media del campionato):
  dicono quante occasioni crea una squadra anche quando non segna. È il cambiamento che rende di più.
- Più prudenza con le squadre con pochi dati (PRIOR 2,5 → 4) e correzione dei punteggi bassi (RHO −0,07 → −0,11).
- Provati e scartati: memoria più corta o più lunga, una correzione in più per i pareggi.

Il divario con i bookmaker sull'Over/Under si è quasi dimezzato; sull'1X2 è sceso di circa un quinto.
J1, MLS e Norvegia non hanno i tiri in porta nella fonte: per loro cambiano solo prudenza e RHO.

## Tennis (Elo)

Scelta sugli incontri fino a maggio 2026, controllo da giugno 2026.

| | ATP scelta | ATP controllo | WTA scelta | WTA controllo |
|---|---|---|---|---|
| Prima | 0,6389 | 0,6509 | 0,6402 | 0,6412 |
| Dopo | 0,6350 | 0,6480 | 0,6375 | 0,6387 |

Cosa è cambiato: l'Elo si muove di più nei primi incontri di un giocatore e si stabilizza più in fretta
(K 300, forma 0,5), e l'Elo sulla superficie pesa il 30% invece del 50%.

## Da rifare

Ogni tanto (per esempio a fine stagione) conviene ripetere la prova con i dati nuovi.
