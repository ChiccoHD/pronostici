# Pronostici

Web app personale con statistiche dettagliate e probabilità per **calcio** (Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, Primeira Liga, Eliteserien, MLS, J1 League, Champions, Europa League, Conference League e Champions femminile), **NBA** e **tennis** (ATP e WTA). Costo zero: i dati arrivano da fonti gratuite, GitHub li aggiorna sei volte al giorno e Cloudflare pubblica il sito.

> Le percentuali sono stime statistiche, non certezze. Nella pagina *Affidabilità* dell'app vedi quanto il modello ha azzeccato sulle partite passate rispetto alle quote dei bookmaker.

## Cosa mostra

| Sport | Percentuali | Statistiche |
|---|---|---|
| Calcio | 1X2, doppia chance, Over/Under 0,5–5,5, Goal/No Goal, multigol, gol per squadra, combo, risultati esatti, primo tempo, angoli, cartellini; per giocatore: segna, assist, tiro in porta, ammonizione | Forma ultime 5/10/15, casa/trasferta, testa a testa, classifica, xG, tiri, angoli |
| NBA | Vincente, punti totali, handicap, punti per squadra, margine; per giocatore: soglie di punti, rimbalzi, assist, triple, punti+rimbalzi+assist | Forma 5/10/15, medie giocatori 5/10/15/stagione, infortuni, testa a testa, partite in due sere di fila |
| Tennis | Vincente, risultato in set, game totali, handicap game, tie-break, set decisivo | Classifica, Elo per superficie, forma, record per superficie, testa a testa |

## Grafica

Ispirata alla carta rosa dei quotidiani sportivi: titoli in Barlow Condensed (stile tabellone), testo in Barlow, entrambi con licenza SIL Open Font e ospitati nel sito (`public/fonts/`, nessuna richiesta a servizi esterni). Ogni squadra è riconoscibile da logo e colori sociali, i tennisti dalla bandiera: arrivano da ESPN insieme ai dati e sono collegati, non copiati nel repository. I giocatori sono indicati con le iniziali nei colori della squadra, senza foto. Icona e favicon sono originali (`public/favicon.svg`).

## Incrocio delle fonti

- **Calcio**: il modello mescola gol reali e gol attesi (xG) di football-data; Understat si aggiunge quando torna online.
- **Coppe europee**: un solo modello su 11 campionati europei (football-data) più le partite di coppa (ESPN), che collegano i campionati tra loro. La Champions femminile usa solo le sue partite (ESPN).
- **NBA**: la probabilità di vittoria combina il nostro modello con quello di ESPN (BPI). Il peso si ricalcola a ogni aggiornamento sulle partite già giocate e si vede nella pagina *Affidabilità*.
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
Apri l'indirizzo `*.pages.dev` e aggiungi la pagina alla schermata Home (Safari: Condividi → Aggiungi alla schermata Home; Chrome: menu → Aggiungi a schermata Home).

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
- **Quote**: per il calcio vengono dalla media dei bookmaker di football-data.co.uk, per l'NBA da ESPN. Per il tennis non ci sono quote.
- **Orari**: GitHub a volte ritarda o salta le esecuzioni programmate. Se serve, si può affiancare un orario di Cloudflare che le avvia.
- **Niente dati in diretta**: solo prima e dopo le partite.
