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

## Nazionali (11 novembre 2026)

Storico: partite internazionali dal 2012 (dataset pubblico `martj42/international_results`). Previsioni rifatte mese per
mese con i soli dati precedenti; parametri scelti sul 2023-24, controllati sul 2025-26 (1.798 partite).

| Scelta | Log loss 1X2 2023-24 | Log loss 1X2 2025-26 |
|---|---|---|
| Emivita 540 giorni, prior 3 (come i club, più lungo) | 0,892 | 0,856 |
| **Emivita 1200 giorni, prior 0,3, amichevoli a peso pieno** | 0,861 | **0,830** |
| Riferimento: frequenze fisse 1/X/2 | – | 1,046 |

- Le amichevoli pesate meno (0,6) peggioravano le previsioni: tenute a peso pieno.
- Campo neutro: niente vantaggio casa. Fasi finali pesano 1,2, qualificazioni e Nations League 1,0.
- Per tipo (2025-26): qualificazioni 0,756, amichevoli 0,866, Nations League 0,923 (gironi equilibrati).
- Calibrazione: errore medio 2,3 punti; i favoriti netti vincono un po' più spesso di quanto stimato.

## Tennis: riposo, stanchezza e cambio di superficie (novembre 2026)

Provate come correzioni dell'Elo sullo storico ESPN (ATP 7.748 incontri, WTA 12.431):
penalità per il rientro dopo più di 45 giorni, per più di 3 incontri in 7 giorni e per il primo incontro su una superficie diversa.
Sull'ultimo anno la scelta migliore (rientro: ATP 70, WTA 40 punti Elo; stanchezza ATP 10) migliora la log loss di meno di 0,001
(ATP 0,6411 → 0,6403; WTA 0,6377 → 0,6372); su un periodo diverso (maggio–novembre 2025) il guadagno sparisce
(ATP 0,6570 → 0,6571; WTA 0,6622 → 0,6621). Non le usiamo: nella scheda si vedono come informazione ("Condizione").

## Calcio: riposo corto tra due partite (novembre 2026)
Prova su 3.802 partite di 8 campionati (Premier, Championship, Serie A, LaLiga, Bundesliga, Ligue 1, Eredivisie, Portogallo), stagione 2025/26 e inizio 2026/27, ogni partita prevista con i soli dati di prima. Riposo contato tra due partite di campionato (le coppe non sono nei dati storici).
- Squadre con 3 giorni di riposo o meno (719 casi): 1.023 gol fatti contro 966 attesi (rapporto 1,06); con riposo normale 1,02. Nessun calo.
- Correggere i gol attesi con poco riposo non migliora il 1X2 (log-loss 0,9977 senza correzione, 0,9976 con +4%, peggiora con correzioni negative).
- Decisione: nessuna correzione per la fatica nel modello. Da rifare se si aggiungono le partite di coppa allo storico.

## F1: prove libere nel pronostico della gara (novembre 2026)
Prova su 17 GP del 2026 (Verifica fonti, modo `f1pratica`): rating di gara spostato in base al passo nelle prove libere del weekend (scarto dal migliore sul giro secco e, con peso 1,5, nelle serie lunghe), punteggio standard × peso × 0,1.
- Log-loss del vincitore: 1,885 senza prove; 1,841 (peso 0,5), 1,809 (1), 1,783 (1,5), 1,774 (2), 1,790 (3), 1,815 (4). Brier del podio da 0,0829 a 0,0798.
- Decisione: peso 1,5 (`PRACTICE_W` in `models/f1.py`), un po' sotto l'ottimo per non adattarsi troppo a 17 gare. Le prove si usano solo prima della gara; dopo la qualifica conta anche la griglia.

## Meteo e gol nel calcio (novembre 2026)

Verifica fonti, modo `meteo`: 2.435 partite di questa stagione in 18 campionati, città dello stadio da ESPN e meteo
all'ora della partita dall'archivio di Open-Meteo; gol confrontati con la media del proprio campionato.

- Pioggia (≥1 mm nelle due ore) contro asciutto: 196 contro 2.239 partite, **+0,14 gol** a partita (errore ±0,12): non significativa.
- Vento forte (≥30 km/h) contro calmo: 41 contro 2.394 partite, **−0,24 gol** (errore ±0,25): non significativa.

Il meteo resta solo un'informazione nella scheda della partita (`weather`), fuori dal modello. Da riprovare a fine stagione con più partite.

## F1: passo in qualifica (novembre 2026)

Verifica fonti, modo `f1quali`: 17 GP del 2026, simulazione con la griglia vera e le prove libere (peso 1,5), più il
passo sul giro secco della qualifica con pesi diversi. Log-loss del vincitore / Brier del podio:
0 → 1,588 / 0,0721; 1 → 1,549 / 0,0713; 2 → 1,528 / 0,0709; 3 → 1,518 / 0,0707; 4 → 1,518 / 0,0706; 6 → 1,549 / 0,0709.
Scelto **3** (`QUALI_W`), il più prudente del tratto migliore. Il peso della griglia resta quello del circuito.
