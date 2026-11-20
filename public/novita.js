"use strict";
/* Novità dell'app, dalla più recente. Ogni nuova funzione va aggiunta qui in cima, con data (AAAA-MM-GG) e testo breve. */
const NOVITA = [
  { d: "2026-11-20", t: "Giornate, classifiche e schedina della giornata", items: [
    "Classifiche: il campionato si sceglie da un pulsante con ricerca (anche per paese o sport) e gruppi; sotto restano gli ultimi visti.",
    "Nuova scheda Giornate in ogni campionato di calcio: risultati e partite in programma giornata per giornata. Per la F1 c'è il Calendario della stagione con podio e pole di ogni GP.",
    "Costruisci la multipla → Per giornata: scegli campionato e giornata, quante partite e il tipo (le più sicure, 1X2, doppia chance, Under/Over, Goal, combo, risultato esatto) e l'app compone la schedina. Si arriva anche dalle Giornate.",
    "Logo della Serie B tornato visibile con il tema scuro.",
    "F1: i tempi di una sessione scaricati quando erano ancora incompleti (come le Prove libere 1 di Las Vegas) ora si riscaricano da soli. Se una sessione resta quasi senza tempi (pista bagnata, interruzioni) l'app lo dice." ] },
  { d: "2026-11-20", t: "F1: sessioni, quote e tema del paese", items: [
    "Nella scheda del GP tocca una sessione (prove libere, qualifiche, Sprint, gara): classifica dei tempi, settori migliori in viola, velocità in rettilineo e passo gara dalle simulazioni con tanta benzina.",
    "Quote del mercato Polymarket anche per il giro più veloce delle prove libere, la pole, la scuderia vincente, oltre a vincitore, podio e testa a testa.",
    "Più chiaro: sotto ogni pilota «mercato X% · q.» è la probabilità e la quota del mercato; accanto alla percentuale del modello c'è la sua quota equa.",
    "La scheda del GP prende i colori della bandiera del paese che lo ospita.",
    "La F1 si aggiorna da sola a ogni giro di dati e in più dopo ogni sessione del weekend (meteo, tempi, quote, griglia): prima restava ferma." ] },
  { d: "2026-11-19", t: "Correzioni", items: [
    "Elenco: con poche partite (es. solo tennis o basket) la pagina restava bloccata mentre scorrevi; ora scorre normalmente.",
    "Le migliori di oggi: c'è sempre una carta per ogni sport (anche tennis e F1). Se per oggi non resta niente, mostra la migliore del primo giorno in cui si gioca, con il giorno accanto all'orario.",
    "Le migliori seguono il giorno scelto nel calendario: tocchi sabato e vedi le migliori di sabato per ogni sport.",
    "La sera, se per oggi restano solo giocate deboli (sotto il 65%), la carta mostra la migliore del giorno dopo.",
    "F1: le giocate sulla pole hanno l'orario della qualifica, così compaiono nel giorno giusto del calendario.",
    "Le migliori di un giorno scelto mostrano uno sport solo se c'è una giocata forte (almeno 65%): niente più pole al 23% come \"migliore\"." ] },
  { d: "2026-11-19", t: "Foto dei piloti", items: [
    "F1: ogni pilota ha la sua foto (da Wikipedia) con il numero sul colore della scuderia, nell'elenco dei piloti, nei testa a testa e nella sua pagina." ] },
  { d: "2026-11-19", t: "F1 più ricca e il tuo profilo", items: [
    "F1, nuova scheda Settori: miglior tempo in ogni settore, giro ideale e velocità in rettilineo per piloti e scuderie, dall'ultima sessione del weekend (prima del weekend, dalle qualifiche dell'anno scorso).",
    "F1, Testa a testa: per ogni sfida la quota equa del modello e, quando c'è, la quota del mercato Polymarket; sezione \"Sfide quotate\" e \"Contro il compagno su questa pista\" (qualifica e gara, dal 2018).",
    "F1, Gara: accanto a ogni percentuale quella del mercato e la sezione \"Modello contro mercato\" con le giocate dove il modello vede più valore.",
    "F1, Circuito: giri, tempo perso nella corsia box, albo d'oro più lungo con chi partiva in pole. Pagina del pilota con i numeri di carriera.",
    "Tu: tocca la faccina per scegliere un'immagine del profilo: una tua foto, il logo di una squadra che segui o di un campionato, un simbolo o una bandiera.",
    "Elenco: quando arrivano dati nuovi mentre scorri, la pagina non torna più in cima.",
    "Scelta dello sport rifatta: icona, nome e numero su tre righe uguali, con più spazio attorno a quello scelto.",
    "F1 nell'elenco anche nei giorni di prove libere, qualifiche e Sprint, con i favoriti per la pole e per la Sprint." ] },
  { d: "2026-11-18", t: "Arriva la Formula 1", items: [
    "Nuovo sport F1: ogni GP con le probabilità di vittoria, podio, punti, ritiro e pole per tutti i piloti (20.000 gare simulate dal passo in gara e in qualifica delle ultime stagioni).",
    "Nella scheda del GP: programma del weekend, Sprint, testa a testa tra due piloti a scelta e tra compagni di squadra, scuderia vincente.",
    "Gomme e strategia dalle edizioni passate (soste, mescole, durata degli stint, safety car), pit stop delle scuderie, meteo per ogni sessione e scheda del circuito.",
    "Pagina di ogni pilota, classifiche piloti e costruttori in Classifiche, piloti nella ricerca. Durante le sessioni l'ordine in diretta.",
    "Campanella sul GP per avvisi di partenza, pole e podio. Per la F1 non ci sono quote dei bookmaker gratuite: niente confronto con le quote." ] },
  { d: "2026-11-18", t: "Brasile e Argentina", items: [
    "Nuovi campionati: Brasileirão (Brasile) e Liga Profesional (Argentina), con pronostici, classifiche, pagine squadra e diretta." ] },
  { d: "2026-11-18", t: "Stime più precise", items: [
    "Calcio: quando escono le formazioni ufficiali, se manca un titolare importante 1X2, Over 2,5 e Goal vengono ricalcolati (riquadro in cima a Esito, con le percentuali di prima).",
    "Nazionali: le formazioni ufficiali compaiono anche per le loro partite, circa un'ora prima del via.",
    "NBA: i giocatori assenti tolgono punti al punteggio atteso della loro squadra, in base a quanto segnano e giocano; il modello di ESPN pesa un po' di più.",
    "Tennis: nella scheda Giocatori la condizione (ultimo incontro, incontri negli ultimi 7 e 14 giorni, cambio di superficie).",
    "Taratura automatica: se nelle partite concluse il modello è stato troppo sicuro o troppo prudente, le prossime percentuali vengono corrette di poco. In Info → Archivio anche il riepilogo mese per mese." ] },
  { d: "2026-11-17", t: "Tema Stadio rifatto e tema Notte", items: [
    "Il tema Stadio ha il prato tagliato a strisce, le linee del campo appena accennate e la luce dei riflettori.",
    "Nuovo tema Notte: blu profondo con luci al neon.",
    "La barra dei giorni è un po' più bassa: più spazio per le partite." ] },
  { d: "2026-11-17", t: "Ritocchi", items: [
    "Le migliori di oggi sono card più piccole, tutte e tre visibili insieme (🌙 = partita della notte, q. = quota equa).",
    "Corretto il salto dell'elenco quando i filtri si riducono durante lo scorrimento." ] },
  { d: "2026-11-17", t: "Più spazio per le partite", items: [
    "Scorrendo l'elenco in giù i filtri si riducono a una sola riga con i giorni: tornando un po' su ricompaiono sport, stato e campionati.",
    "Le migliori di oggi includono anche il basket: contano le partite fino alle 8 di domattina, come quelle NBA della notte." ] },
  { d: "2026-11-17", t: "Le migliori di oggi, una per sport", items: [
    "Nel riquadro Oggi ci sono tre card, Calcio, Basket e Tennis: per ognuno la giocata di oggi con la probabilità stimata più alta, con la quota equa.",
    "Pagina squadra più compatta: intestazione con i colori della squadra, posizione, punti e gol in riquadri, Segui/Classifica/Confronta in una riga, la prossima partita subito sotto e il resto in schede (Partite, Stagione, Giocatori, Tendenze)." ] },
  { d: "2026-11-17", t: "Tante novità: Oggi, Confronta, temi, backup", items: [
    "In cima all'elenco il riquadro Oggi: le tue squadre in campo, le schedine in gioco e la migliore giocata del giorno.",
    "Migliori: le prime 10 sono card da scorrere, con il colore della squadra e quanto è alta la stima.",
    "Confronta due squadre o due tennisti qualsiasi (dalla lente, dalla pagina squadra o tennista): forza, forma, statistiche di stagione e una stima se si affrontassero.",
    "Scheda partita: grafico dell'andamento della forma e, in diretta, la linea del tempo con gol e cartellini.",
    "Due temi nuovi, Stadio e Contrasto: tocca il pulsante del tema in alto.",
    "Animazioni leggere: pagine che entrano morbide, numeri che salgono, \"GOL!\" in diretta e coriandoli per una schedina vinta.",
    "L'app si apre subito con gli ultimi dati salvati e si aggiorna da sola in sottofondo (il pallino verde accanto all'orario).",
    "In Tu → I tuoi dati: link di backup con schedine, squadre e storico, da aprire su un altro telefono per ritrovare tutto." ] },
  { d: "2026-11-17", t: "Notifiche più semplici", items: [
    "Le scelte delle notifiche sono quattro riquadri (Calcio, Basket, Tennis, Altri avvisi): toccane uno per gli interruttori, con le scorciatoie Essenziali, Tutti e Nessuno.",
    "Partite, squadre e tennisti seguiti stanno in una riga compatta \"Per chi\".",
    "Corretto: seguendo una squadra (es. Inter) non compaiono più le partite della sua squadra femminile, né in Tu né nelle notifiche." ] },
  { d: "2026-11-17", t: "Area personale rinnovata", items: [
    "Tu ha una nuova intestazione con il tuo nome (tocca la faccina per sceglierlo), le schedine vinte, la percentuale di giocate prese e la serie in corso.",
    "Grafico del bilancio in euro (dalle schedine con quota e puntata) oppure delle giocate prese contro quelle attese dal modello.",
    "Traguardi da sbloccare: prima presa, schedina vinta, tris, cinquina, colpo grosso e altri.",
    "Le squadre seguite sono schede colorate con la prossima partita." ] },
  { d: "2026-11-17", t: "Calendario centrato su oggi", items: [
    "All'apertura la barra dei giorni mostra oggi al centro: scorri a sinistra per i giorni passati, a destra per i prossimi." ] },
  { d: "2026-11-17", t: "Classifiche delle nazionali", items: [
    "Nations League, qualificazioni e le altre competizioni a gironi hanno le classifiche ufficiali dei gironi: nella scheda della partita (il girone delle due squadre) e in Classifiche." ] },
  { d: "2026-11-17", t: "Classifica nella partita e giorni passati", items: [
    "Nella scheda di una partita di campionato o NBA c'è la classifica con le due squadre evidenziate e le squadre vicine; da lì si apre quella completa.",
    "Nel calendario dell'elenco ci sono anche ieri e i giorni prima: toccali per vedere le partite finite con il risultato." ] },
  { d: "2026-11-17", t: "Probabilità in diretta, Cerca, calendario e immagini", items: [
    "Durante la partita le percentuali si aggiornano con il punteggio: nel calcio anche Over, Goal, doppia chance e chi segna il prossimo gol; nel tennis chi vince adesso, dai set e dai game.",
    "Nelle schedine ogni giocata in corso mostra \"ora X%\" e le schedine salvate dicono quanto hanno di passare adesso.",
    "Nuova lente in alto: trova squadre, tennisti, partite e campionati.",
    "Nella scheda di una partita: Calendario (Google Calendar o calendario del telefono, con promemoria 30 minuti prima) e Immagine da mandare su WhatsApp.",
    "Anche le schedine si condividono come immagine." ] },
  { d: "2026-11-16", t: "Tennis in diretta più chiaro", items: [
    "Il riquadro In diretta indica il numero di ogni set (con \"ora\" su quello in corso) e la colonna \"Set vinti\" è separata dai game.",
    "Sotto il tabellone, a parole: chi ha vinto ogni set e con che punteggio, e a quanto sta il set in corso." ] },
  { d: "2026-11-16", t: "Forma dei tennisti", items: [
    "Nella scheda di un incontro di tennis c'è la sezione Forma, come per calcio e basket: ultimi 5, 10 o 15 incontri con vinte e perse, set, game vinti, vittorie senza perdere set e tie-break.",
    "\"Filtra per giocata\" ora sta sotto il calendario." ] },
  { d: "2026-11-16", t: "Più ordine e niente zoom", items: [
    "All'apertura l'elenco mostra già la giornata di oggi.",
    "Barre più leggibili: lo sport scelto ha il suo colore, lo stato (Tutte, In diretta…) una pastiglia piena.",
    "Info: le quattro sezioni sono riquadri separati, con icona, colore e una riga che dice cosa contengono.",
    "L'app non si ingrandisce più con due dita o con il doppio tocco.",
    "Tolto il riquadro grigio intorno alla bandierina dei tennisti.",
    "L'app controlla le nuove versioni ogni volta che la riapri, anche dalla schermata Home." ] },
  { d: "2026-11-16", t: "Ritocchi grafici", items: [
    "Nell'elenco la striscia dei colori è staccata tra una partita e l'altra.",
    "Tennis: sfumatura e barra con i colori della bandiera di ogni giocatore; senza foto si vede la bandiera intera, senza cerchio.",
    "Foto dei tennisti anche da Wikipedia quando ESPN non ce l'ha." ] },
  { d: "2026-11-16", t: "Colori delle squadre", items: [
    "Nella scheda della partita lo sfondo richiama i colori delle due squadre e c'è una barra 1 / X / 2 colorata per vedere subito chi è favorito.",
    "Nell'elenco ogni partita ha una striscia con i colori di casa e ospiti." ] },
  { d: "2026-11-16", t: "Nuove notifiche", items: [
    "Esito delle schedine salvate: \"✓ Schedina 2: vinta!\" o \"persa\" appena si decide, anche ad app chiusa.",
    "Formazioni ufficiali uscite, per le partite di calcio che segui.",
    "Avviso quando il modello e i bookmaker sono lontani (12 punti o più) su una partita che segui.",
    "A scelta, alle 9 di mattina le 3 giocate migliori del giorno.",
    "Nell'elenco NBA compaiono i giocatori importanti fuori per infortunio (🚑)." ] },
  { d: "2026-11-16", t: "Archivio dei pronostici", items: [
    "In Info → Archivio: tutte le partite concluse (fino a 6 mesi) con pronostico ed esito.",
    "Quante volte esce il pronostico più probabile, Over/Under e Goal, per sport e per competizione, e se quando dice 70% esce davvero 7 volte su 10.",
    "Quando modello e bookmaker non sono d'accordo sulla favorita, chi ci ha preso." ] },
  { d: "2026-11-16", t: "Filtro per giocata e app più veloce", items: [
    "In Partite tocca \"🎯 Filtra per giocata\": per esempio solo le partite con Over 2,5 almeno al 65%, Goal, 1X, favorita…",
    "L'app si apre subito usando la copia salvata sul telefono e funziona anche senza rete, con gli ultimi dati scaricati.",
    "Quando esce una nuova versione compare l'avviso \"Nuova versione dell'app\": tocca per aggiornare." ] },
  { d: "2026-11-13", t: "Computer: selezione più pulita", items: [
    "La partita aperta nell'elenco a sinistra ora è evidenziata con lo sfondo e una barretta verde, senza i riquadri intorno ai singoli pezzi." ] },
  { d: "2026-11-13", t: "Schedine chiuse più chiare", items: [
    "Le giocate finite mostrano il risultato finale e una frase chiara: \"✓ Presa\" oppure \"✗ Persa: serviva la vittoria di Barcelona e un altro gol\"." ] },
  { d: "2026-11-12", t: "Pallino anche su Aggiornamenti", items: [
    "Quando ci sono novità, oltre al pallino su Info ne compare uno anche sulla scheda Aggiornamenti, così sai dove toccare." ] },
  { d: "2026-11-12", t: "Schedine in diretta e notifiche più complete", items: [
    "Nelle schedine salvate, durante la partita, sotto ogni giocata: minuto, risultato, pallini per i conteggi (●●○ = 2 gol su 3) e una frase con cosa manca, es. \"Ti serve: la vittoria di Como e altri 2 gol\".",
    "Notifiche: aggiunte ammonizioni, calci d'angolo, inizio del secondo tempo, inizio di ogni quarto e di ogni set.",
    "La fine del primo tempo ora arriva subito: prima dipendeva dal tabellone ESPN, che a volte la segna con minuti di ritardo.",
    "Nella scheda della partita il tasto Segui è in alto accanto alla competizione e la diretta sta sotto le squadre; campanella anche sulle partite in diretta." ] },
  { d: "2026-11-11", t: "Diretta e Concluse più precise", items: [
    "Il numero su \"In diretta\" ora conta solo le partite davvero in corso secondo ESPN.",
    "Una partita appena finita passa subito in Concluse, senza aspettare il prossimo aggiornamento dei dati." ] },
  { d: "2026-11-11", t: "Schedina sempre a portata di mano", items: [
    "Quando hai giocate in schedina, in basso compare una barra con quota e probabilità: toccala e la schedina si apre lì sotto, senza cambiare pagina.",
    "Costruisci la multipla: aggiungendo una proposta, la schedina si apre subito sotto.",
    "Svuotare, eliminare o dare un nome a una schedina ora si fa con una finestra dell'app, non più con quelle del browser.",
    "In diretta, le partite finite restano un'ora dalla fine." ] },
  { d: "2026-11-11", t: "Elenco per stato, Live integrato", items: [
    "In Partite scegli Tutte, In diretta, Da giocare o Concluse.",
    "La sezione Live non è più in basso: è il filtro \"In diretta\", con i risultati che si aggiornano ogni pochi secondi.",
    "Notifiche con l'icona dell'app (%) nella barra del telefono; in Tu l'elenco chiaro di squadre e tennisti seguiti." ] },
  { d: "2026-11-11", t: "Tennis: cronaca game per game", items: [
    "La cronaca è divisa set per set: ogni game mostra il punteggio e chi l'ha vinto, con i colori dei due giocatori.",
    "La registra il server ogni minuto per tutti gli incontri, quindi è completa anche se l'app era chiusa." ] },
  { d: "2026-11-11", t: "Notifiche più semplici", items: [
    "In fondo a Tu: un interruttore per accenderle e la lista delle partite che segui.",
    "Campanella gialla sulle partite seguite, ben visibile anche con il tema scuro." ] },
  { d: "2026-11-11", t: "Notifiche", items: [
    "In Tu → Notifiche scegli sport e avvisi: gol, espulsioni, fine primo tempo, fine di ogni quarto, set o game, inizio e fine partita.",
    "Arrivano solo per le partite che segui con la campanella (nell'elenco o in alto nella scheda) e per le squadre e i tennisti che segui.",
    "Arrivano anche ad app chiusa, entro un minuto circa. Su iPhone l'app deve essere sulla schermata Home." ] },
  { d: "2026-11-11", t: "Partite concluse", items: [
    "Le partite finite restano in elenco per tre giorni con il risultato: tocca \"Concluse\" tra i giorni.",
    "Su ogni partita finita vedi se il pronostico più probabile è uscito e, nella scheda, \"Com'è andata\": percentuali del modello, quote ed esito a confronto.",
    "Nella scheda restano anche cronaca e statistiche di fine partita." ] },
  { d: "2026-11-11", t: "Nazionali", items: [
    "Nations League, qualificazioni a Mondiali ed Europei, fasi finali (Mondiali, Europei, Copa América, Coppa d'Africa, Coppa d'Asia, Gold Cup) e amichevoli.",
    "Probabilità da tutte le partite tra nazionali degli ultimi anni, con campo neutro e importanza della partita; loghi, forma, testa a testa, quote e Live.",
    "Sulle amichevoli un avviso: sono le partite più incerte." ] },
  { d: "2026-11-11", t: "Novità dell'app", items: [
    "In Info → Aggiornamenti trovi l'elenco delle novità; un pallino su Info avvisa quando ce n'è una nuova." ] },
  { d: "2026-11-11", t: "Tablet e computer", items: [
    "Su tablet elenco delle partite e riquadri su due colonne.",
    "Su computer barra delle sezioni a sinistra, elenco fisso e partita aperta accanto." ] },
  { d: "2026-11-11", t: "Area personale Tu e Info", items: [
    "Nuova area Tu: squadre seguite, schedine salvate con esito automatico, storico delle giocate, copia dei dati.",
    "Info riunisce Come funziona, Affidabilità e Aggiornamenti.",
    "La Schedina serve solo a comporre: le schedine salvate vanno in Tu." ] },
  { d: "2026-11-11", t: "Tennis in diretta", items: [
    "Tabellone dei set con set in corso evidenziato e cronaca dei game.",
    "Le partite in corso si aprono sempre, anche durante il match." ] },
  { d: "2026-11-11", t: "Modelli più precisi", items: [
    "Calcio: contano anche i tiri in porta, oltre a gol e gol attesi.",
    "Tennis: forza dei giocatori ritarata, specie sulle superfici." ] },
  { d: "2026-11-11", t: "Squadre, tendenze e nuovi campionati", items: [
    "Segui le tue squadre dalla loro pagina.",
    "Tendenze: le serie aperte (vittorie di fila, Over, Goal…) nelle partite, nelle squadre e in Migliori.",
    "Nuovi campionati: Serie B, Championship, Eredivisie, Süper Lig, Scozia e Belgio.",
    "Pagina del tennista con forma e superfici.",
    "Schedine salvate: ne tieni più di una e l'esito si controlla da solo." ] },
  { d: "2026-11-11", t: "Classifiche e multipla", items: [
    "Classifiche dei campionati e pagina di ogni squadra.",
    "Costruisci la multipla dalle giocate migliori e condividila con un link.",
    "Loghi dei campionati nell'elenco, nei filtri e nel Live.",
    "Giocatori anche nelle partite delle coppe europee." ] },
  { d: "2026-11-11", t: "Live e scheda partita", items: [
    "Live più veloce: ogni 8 secondi durante le partite.",
    "Cronaca (gol, cartellini, sostituzioni) e statistiche nella scheda.",
    "Formazioni ufficiali, che aggiornano le percentuali dei giocatori.",
    "Testa a testa tra le due squadre, forma più leggibile, riquadri apribili e chiudibili.",
    "Distanza tra modello e bookmaker anche dentro la partita; ricerca di squadre e tennisti." ] },
  { d: "2026-11-11", t: "Foto dei giocatori", items: [
    "Foto da ESPN, Wikipedia e TheSportsDB, cercate per tutte le rose." ] },
  { d: "2026-11-10", t: "Live, Migliori e Schedina", items: [
    "Sezione Live con link alle dirette gratuite e ai canali ufficiali.",
    "Migliori: le giocate più probabili, anche tutte quelle dal 70% in su.",
    "Schedina con stelline su ogni giocata e probabilità della multipla.",
    "Filtro per giorno, elenco raggruppato per campionato, tema chiaro e scuro." ] },
  { d: "2026-11-10", t: "Più campionati", items: [
    "Portogallo, Norvegia, MLS, Giappone, coppe europee e Champions femminile." ] },
  { d: "2026-11-09", t: "Prima versione", items: [
    "Probabilità per calcio, NBA e tennis, aggiornate in automatico più volte al giorno." ] },
];
const NEWS_KEY = "p_news_seen";
function newsUnseen() {
  let seen = "";
  try { seen = localStorage.getItem(NEWS_KEY) || ""; } catch (e) {}
  return NOVITA.length && (!seen || NOVITA[0].d + NOVITA[0].t !== seen);
}
function markNewsSeen() {
  try { localStorage.setItem(NEWS_KEY, NOVITA[0].d + NOVITA[0].t); } catch (e) {}
  newsDot();
}
function newsDot() {
  document.querySelector('[data-nav="info"]')?.classList.toggle("has-news", !!newsUnseen());
}
function newsSection() {
  const fmt = d => new Date(d + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  const item = (n, i) => `<div class="news-item${i === 0 ? " latest" : ""}"><div class="news-h"><b>${esc(n.t)}</b><small>${fmt(n.d)}</small></div>
    <ul>${n.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  const SHOW = 4;
  const rows = NOVITA.slice(0, SHOW).map(item).join("") + (NOVITA.length > SHOW
    ? `<details class="news-more"><summary>Novità precedenti (${NOVITA.length - SHOW})</summary>${NOVITA.slice(SHOW).map((n, i) => item(n, i + SHOW)).join("")}</details>` : "");
  return sec("Novità dell'app", rows, "cosa è stato aggiunto", "Info novita");
}
newsDot();
