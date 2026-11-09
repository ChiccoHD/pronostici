# Istruzioni per Claude

Web app personale "Pronostici": statistiche e probabilità per calcio (Serie A, Premier League, LaLiga, Bundesliga, Ligue 1), NBA e tennis (ATP, WTA). Leggi anche `README.md`.

## Vincoli
- **Costo zero**: solo fonti e servizi gratuiti (ESPN, football-data.co.uk, Understat, tennis-data.co.uk, GitHub Actions, Cloudflare Pages). Non aggiungere servizi a pagamento senza chiederlo.
- **Si lavora solo nel repository**: le modifiche vanno caricate su GitHub, Cloudflare Pages pubblica da solo la cartella `public/`. Niente artefatti o pubblicazioni separate.
- **Interfaccia in italiano**, pensata per smartphone.
- Il sito è statico (HTML/CSS/JS senza compilazione): niente framework o build step senza motivo.

## Struttura
- `pipeline/sources/` scarica i dati, una fonte per file.
- `pipeline/models/` calcola le probabilità: `soccer.py` (Poisson + Dixon-Coles), `nba.py` (rating in punti), `tennis.py` (Elo + catena di Markov), `common.py` (statistica e misure di affidabilità).
- `pipeline/build_*.py` prepara uno sport; `pipeline/run.py` lancia tutto e scrive `public/data/`.
- `pipeline/names.py` abbina i nomi tra fonti diverse: se compare "nomi_non_abbinati" in `public/data/meta.json`, aggiungi l'alias qui.
- `data/cache/` storico già scaricato (scritto dal workflow, non modificarlo a mano).
- `public/` il sito; `public/data/` è generato dal workflow.

## Regole pratiche
- Ogni sport e ogni campionato deve poter fallire da solo senza bloccare gli altri: mantieni i try/except e lo stato in `meta.json`.
- Se cambi il formato dei JSON in `public/data/`, aggiorna anche `public/app.js` nello stesso commit.
- Richieste alle fonti sempre poche e lente (vedi `pipeline/http.py`); le fonti non ufficiali possono bloccare chi esagera.
- Prima di consegnare: `python -m pipeline.sample` (dati inventati, nessuna rete) deve girare senza errori e il sito deve funzionare con `python -m http.server -d public`. Dopo la prova, se i dati veri sono già presenti, ripristinali con `git checkout public/data data/cache`.
- Per controllare le fonti vere: workflow **Verifica fonti** su GitHub (il resoconto finisce in `report/fonti.md`).
- Le percentuali restano stime: non presentarle mai come certezze nell'interfaccia.
