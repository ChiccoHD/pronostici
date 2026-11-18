# Pronostici

Web app personale con statistiche dettagliate e probabilità per **calcio** (Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, Primeira Liga, Eliteserien, MLS, J1 League, Champions, Europa League, Conference League e Champions femminile), **NBA**, **tennis** (ATP e WTA) e **Formula 1**. Costo zero: i dati arrivano da fonti gratuite, GitHub li aggiorna sei volte al giorno e Cloudflare pubblica il sito.

**Indirizzo del sito: https://pronostici.dimariafnc.workers.dev/**

> Le percentuali sono stime statistiche, non certezze. Nella pagina *Affidabilità* dell'app vedi quanto il modello ha azzeccato sulle partite passate rispetto alle quote dei bookmaker.

## Cosa mostra

| Sport | Percentuali | Statistiche |
|---|---|---|
| Calcio | 1X2, doppia chance, Over/Under 0,5–5,5, Goal/No Goal, multigol, gol per squadra, combo, risultati esatti, primo tempo, angoli, cartellini; per giocatore: segna, assist, tiro in porta, ammonizione | Forma ultime 5/10/15, casa/trasferta, testa a testa, classifica, xG, tiri, angoli |
| NBA | Vincente, punti totali, handicap, punti per squadra, margine; per giocatore: soglie di punti, rimbalzi, assist, triple, punti+rimbalzi+assist | Forma 5/10/15, medie giocatori 5/10/15/stagione, infortuni, testa a testa, partite in due sere di fila |
| Tennis | Vincente, risultato in set, game totali, handicap game, tie-break, set decisivo | Classifica, Elo per superficie, forma, record per superficie, testa a testa |
| Formula 1 | Vittoria, podio, primi 10, ritiro, pole, giro veloce, Sprint, scuderia vincente, testa a testa tra piloti, safety car | Classifiche piloti e costruttori, forma, compagno di squadra, circuito (albo, pole→vittoria, ritiri), gomme e soste delle edizioni passate, pit stop, meteo per sessione |

## Grafica

Chiara e pulita, con un solo accento verde campo e cerchi percentuali in elenco, schede e classifica. Carattere Manrope con licenza SIL Open Font e ospitati nel sito (`public/fonts/`, nessuna richiesta a servizi esterni). Ogni squadra è riconoscibile da logo e colori sociali, i tennisti dalla bandiera: arrivano da ESPN insieme ai dati e sono collegati, non copiati nel repository. I giocatori hanno la foto di ESPN (collegata anche lei, tramite il numero del giocatore). Per i calciatori che ESPN non ha, l'aggiornamento cerca la foto su TheSportsDB (gratuito, serve che nome e squadra coincidano) e ricorda l'esito in `data/cache/photos.json`; se non c'è da nessuna parte restano le iniziali nei colori della squadra. Nella pagina *Info* la riga "foto_giocatori" dice quante foto arrivano da ciascuna fonte. Nel tennis la foto compare nella scheda dell'incontro, con la bandiera accanto. Icona e favicon sono originali (`public/favicon.svg`).

## Incrocio delle fonti

- **Calcio**: il modello mescola gol reali e gol attesi (xG) di football-data; Understat si aggiunge quando torna online.
- **Coppe europee**: un solo modello su 11 campionati europei (football-data) più le partite di coppa (ESPN), che collegano i campionati tra loro. La Champions femminile usa solo le sue partite (ESPN).
- **NBA**: la probabilità di vittoria combina il nostro modello con quello di ESPN (BPI). Il peso si ricalcola a ogni aggiornamento sulle partite già giocate e si vede nella pagina *Affidabilità*.
- **Formula 1**: risultati e qualifiche da Jolpica (archivio Ergast, gratuito), gomme, soste, meteo in pista e safety car delle edizioni passate da OpenF1 (dati storici gratuiti), previsioni meteo da Open-Meteo. Il modello simula la gara 20.000 volte dal passo in gara e in qualifica (più peso alle gare recenti), dall'importanza della griglia sul circuito, dai ritiri e dalla pioggia; i parametri si scelgono sulle gare già corse.
- Le quote dei bookmaker non entrano nel calcolo: restano un termine di paragone.

## Come funziona

```
Fonti gratuite ──► GitHub Actions (6 volte al giorno) ──► file JSON in public/data ──► Cloudflare Pages
ESPN, football-data.co.uk,      scarica, salva la cache,          il sito li legge
Understat                       calcola i modelli
```

- `pipeline/` — codice Python: `sources/` scarica i dati, `models/` calcola le probabilità, `build_*.py` prepara ogni sport, `run.py` lancia tutto.
- `public/` — il sito (HTML, CSS, JavaScript, nessuna compilazione).
- `data/cache/` — storico già scaricato, così ogni aggiornamento chiede alle fonti solo le novità.
- `.github/workflows/` — `Aggiorna dati` (automatico) e `Verifica fonti` (manuale).

I dati inclusi all'inizio sono **di esempio e inventati**: il sito mostra un avviso finché non parte il primo aggiornamento vero.

## Messa in funzione, passo per passo

### 1. Abilita i permessi di scrittura per le automazioni
Nel repository su GitHub: **Settings → Actions → General → Workflow permissions** → scegli **Read and write permissions** → **Save**.

### 2. Verifica le fonti
1. Vai sulla scheda **Actions**. Se GitHub chiede di abilitare i workflow, conferma.
2. A sinistra scegli **Verifica fonti** → **Run workflow** → **Run workflow**.
3. Dopo 1–2 minuti apri l'esecuzione: il riepilogo elenca, fonte per fonte, cosa arriva (✅) e cosa no (❌). Lo stesso testo viene salvato in `report/fonti.md`.

### 3. Primo aggiornamento dei dati
1. In **Actions** scegli **Aggiorna dati** → **Run workflow**.
2. La prima volta dura 10–20 minuti perché scarica lo storico. Le volte successive pochi minuti.
3. Alla fine il workflow salva i dati nel repository con un commit "Dati aggiornati…".

### 4. Pubblica con Cloudflare Pages
1. Cloudflare → **Workers & Pages** → **Create** → scheda **Pages** → **Connect to Git**.
2. Scegli il repository `pronostici`.
3. Impostazioni di build: **Framework preset** `None`, **Build command** vuoto, **Build output directory** `public`.
4. **Save and Deploy**. Ogni aggiornamento dei dati viene pubblicato da solo.

### 5. Sul telefono
Apri https://pronostici.dimariafnc.workers.dev/ e aggiungi la pagina alla schermata Home (Safari: Condividi → Aggiungi alla schermata Home; Chrome: menu → Aggiungi a schermata Home).

## Comandi utili (in locale)

```bash
pip install -r requirements.txt
python -m pipeline.check_sources   # verifica le fonti
python -m pipeline.run             # aggiornamento completo
python -m pipeline.run --solo nba  # un solo sport
python -m pipeline.sample          # rigenera i dati di esempio inventati
python -m http.server -d public    # apre il sito su http://localhost:8000
```

## Limiti da conoscere

- **ESPN e Understat non sono fonti ufficiali**: possono cambiare senza preavviso. Se succede, la pagina *Info* dell'app mostra l'errore e gli altri sport continuano a funzionare.
- **Tennis**: storico e tabelloni arrivano da ESPN (tennis-data.co.uk blocca i server di GitHub). La superficie è dedotta dal nome del torneo e dal periodo dell'anno; la classifica mondiale non è disponibile: si mostra il numero di testa di serie nel torneo.
- **Understat** (xG) a novembre 2026 è in manutenzione: il calcio funziona lo stesso con gol e tiri in porta, e gli xG torneranno da soli quando il sito sarà di nuovo online.
- **Voti dei giocatori**: nessuna fonte gratuita li fornisce in modo affidabile, quindi non ci sono.
- **Quote**: per il calcio vengono dalla media dei bookmaker di football-data.co.uk, per l'NBA da ESPN. Per tennis e Formula 1 non ci sono quote gratuite.
- **Formula 1**: la diretta di OpenF1 è a pagamento, quindi durante le sessioni l'ordine arriva dal tabellone di ESPN (letto dal telefono e dal Worker per gli avvisi). Niente foto dei piloti: numero sul colore della scuderia.
- **Orari**: GitHub a volte ritarda o salta le esecuzioni programmate. Se serve, si può affiancare un orario di Cloudflare che le avvia.
- **Niente dati in diretta**: solo prima e dopo le partite.
