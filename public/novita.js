"use strict";
/* Novità dell'app, dalla più recente. Ogni nuova funzione va aggiunta qui in cima, con data (AAAA-MM-GG) e testo breve. */
const NOVITA = [
  { d: "2026-11-27", t: "Campionati anche con «Tutto»", items: [
    "La fila dei campionati sotto i filtri ora c'è anche con «Tutto»: raccoglie calcio, NBA, ATP/WTA e F1 del giorno scelto." ] },
  { d: "2026-11-27", t: "Arabia Saudita", items: [
    "Nuovo campionato: Saudi Pro League (quella di Cristiano Ronaldo), con pronostici, classifiche e diretta.",
    "Fila dei campionati nell'elenco: toccando un campionato la fila non torna più all'inizio, quello scelto resta al centro." ] },
  { d: "2026-11-27", t: "Esito delle schedine più sicuro", items: [
    "Corretto un errore: una partita sospesa (es. Beşiktaş–Hapoel Be'er, ferma sullo 0-0 e poi ripresa) veniva considerata finita e la giocata segnata come persa. Ora una partita sospesa resta «in corso» finché non riprende, e una rinviata o annullata non dà nessun esito.",
    "Le schedine salvate vengono ricontrollate con il risultato ufficiale dei dati: se l'esito segnato dal telefono era sbagliato si corregge da solo, e le giocate rimaste senza esito vengono chiuse." ] },
  { d: "2026-11-27", t: "Multipla per giornata più precisa", items: [
    "Costruisci la multipla → Per giornata: dopo il tipo di giocata scegli anche il dettaglio. Under/Over: la linea (0,5, 1,5, 2,5, 3,5, 4,5, 5,5) e se Over o Under. Multigol: la fascia (0-1, 1-2, 1-3, 2-3, 2-4, 3-5, 4-6). Multigol squadra: fascia e casa o ospite. E poi il segno per 1X2, Doppia chance, Draw No Bet, Goal/No Goal e la combo che vuoi. «Qualsiasi» lascia scegliere al modello." ] },
  { d: "2026-11-27", t: "Installa l'app", items: [
    "Chi apre il sito dal browser vede in basso «Installa Pronostici»: su Android il tasto Installa la mette sulla schermata Home, su iPhone spiega i due passaggi (Condividi → Aggiungi alla schermata Home). Si chiude con la X e non ricompare per 3 settimane; resta anche in Info → Come funziona." ] },
  { d: "2026-11-27", t: "Partite in corso più ordinate", items: [
    "Partite in corso nell'elenco: «adesso» più grande e attaccato ai cerchi (anche loro più grandi), «prima del via» su una riga intera sotto, così i nomi delle squadre non vengono più tagliati. In Preferiti, dopo aver ricaricato la pagina, le partite in corso tornano subito con punteggio e percentuali di adesso." ] },
  { d: "2026-11-27", t: "Tasto Preferiti con la campanella", items: [
    "Il tasto Preferiti in alto ora è una campanella: vuota se non segui partite, piena e con il numero delle partite seguite appena ne aggiungi una." ] },
  { d: "2026-11-27", t: "Formazioni a partita finita e preferiti più comodi", items: [
    "A partita iniziata o finita, nella scheda trovi le «Formazioni iniziali» con il campo, come prima del via.",
    "Preferiti: per togliere una partita tocca la sua campanella (c'è anche a partita finita), oppure «Svuota» per toglierle tutte insieme (le tue squadre restano). Campanella ridisegnata, ora centrata nel cerchio." ] },
  { d: "2026-11-27", t: "Preferiti, colori e formazioni", items: [
    "Nuovo tasto ⭐ Preferiti accanto a Classifiche: le partite che segui con la campanella (anche in corso, con il risultato) e le prossime partite delle tue squadre, a portata di tocco. Il numero sul tasto dice quante partite seguite devono ancora finire.",
    "Squadre con colori simili (es. Olympiakos–Milan, tutte e due rosse): la seconda ora prende la sua seconda maglia o un colore ben diverso.",
    "Formazioni ufficiali: i giocatori nel campo sono messi in base al ruolo indicato da ESPN (terzino, centrale, mediano, esterno, trequartista, punta), non più in base a un numero d'ordine che a volte li spostava fuori posizione. La formazione viene ricontrollata ogni 4 minuti fino al via: se ESPN la corregge, si aggiorna da sola. Se è incompleta o il modulo non torna, viene mostrata in elenco." ] },
  { d: "2026-11-26", t: "Partite in corso nell'elenco", items: [
    "Nell'elenco, per le partite in corso i cerchi a destra mostrano le percentuali di adesso (calcolate sul risultato e sul tempo che manca); sotto resta il pronostico di prima del via, es. «1: 45% · X: 28% · 2: 27%»." ] },
  { d: "2026-11-26", t: "Squadre con il nome italiano", items: [
    "Le squadre straniere ora hanno il nome che si usa in Italia: Marsiglia, Lione, Nizza, Bayern Monaco, Barcellona, Siviglia, Sporting Lisbona, Stella Rossa, Dinamo Zagabria, Copenaghen, Inter, Milan, Roma e altre. Squadre seguite e schedine salvate si aggiornano da sole." ] },
  { d: "2026-11-26", t: "Account e sincronizzazione", items: [
    "In Tu puoi accedere con Google o con email e password (come nelle altre app): schedine, squadre seguite, storico, sfide e impostazioni restano allineati su ogni telefono, tablet o computer in cui accedi. Le modifiche si sincronizzano da sole.",
    "Password dimenticata: ti arriva un'email per sceglierne una nuova.",
    "Tu contro il modello: nuovo tasto «Azzera e ricomincia»." ] },
  { d: "2026-11-26", t: "Coppe europee: pronostici più precisi", items: [
    "Ogni squadra delle coppe parte dal livello della sua nazione (coefficiente UEFA): così una squadra norvegese o croata non viene più considerata forte come una spagnola o inglese solo perché domina il suo campionato. Sulle partite di coppa già giocate l'errore del modello scende da 0,987 a 0,941 (log-loss) e le percentuali si avvicinano molto a quelle dei bookmaker.",
    "Le squadre di cui non abbiamo il campionato (Andorra, Malta, Ucraina, Croazia, Serbia...) partono dal livello della loro nazione; quelle di serie B (es. Torreense) un po' più in basso." ] },
  { d: "2026-11-26", t: "Coppe europee: squadre abbinate meglio", items: [
    "Corretto un errore nelle coppe: l'Inter d'Escaldes (Andorra) veniva presa per l'Inter, così il Copenaghen sembrava sfavorito. Ora ogni squadra viene cercata solo nel suo campionato, e Copenaghen, AGF, Rapid Vienna e Craiova usano anche lo storico del loro campionato." ] },
  { d: "2026-11-26", t: "Partita del giorno, quote nel tempo e altro", items: [
    "Le migliori di oggi: carte di nuovo leggibili, la Partita del giorno è larga il doppio con i nomi interi.",
    "Partita del giorno: la prima carta della fila «Le migliori di oggi» è la partita più interessante del giorno (competizione importante, equilibrio, la tua squadra, modello lontano dalle quote), con le percentuali. Toccala per aprirla con il «Perché».",
    "Pagina squadra: «Il modello con questa squadra», quante volte ha preso il risultato più probabile nelle partite già giocate e se ci si può fidare.",
    "Costruisci la multipla: in cima c'è una proposta «Con le quote dei bookmaker», che arriva alla quota pagata davvero con giocate dove il modello è più ottimista del mercato.",
    "Notifica del gol: dice anche come cambiano le percentuali (es. «ora 1 83% X 13% 2 4%»).",
    "Scheda Esito: grafico «Quote nel tempo», come si sono mosse le percentuali dei bookmaker con il modello tratteggiato. Si riempie man mano che arrivano gli aggiornamenti.",
    "Home: «⭐ Solo le mie» accanto a «Filtra per giocata» mostra solo le partite delle squadre e dei tennisti che segui o con la campanella.",
    "NBA, scheda Giocatori: «La squadra con e senza», margine medio della squadra nelle partite con lui in campo e senza." ] },
  { d: "2026-11-26", t: "Campionati più ricchi, il tuo conto e la schedina a sistema", items: [
    "Classifiche dei campionati di calcio: le zone colorate (titolo, Champions o promozione, retrocessione) e quattro schede nuove. Proiezione: probabilità di titolo, posto europeo e retrocessione simulando 10.000 volte le partite che mancano, con i punti attesi. Altre classifiche: in casa, in trasferta, forma delle ultime 10 e gol attesi. Marcatori: capocannonieri e assist. Calendario: le prossime 5 partite di ogni squadra colorate per difficoltà.",
    "Pagina squadra: le prossime 5 partite in tutte le competizioni (verde facile, giallo equilibrata, rosso difficile, grigio le coppe) e «Come può finire» la stagione.",
    "Tu → Il tuo conto: saldo, resa sulle puntate, grafico nel tempo e risultati per sport, numero di giocate e quota, dalle schedine segnate come giocate.",
    "Schedina → Schedina a sistema: con 3 o più giocate vedi la probabilità di prenderne almeno 2, 3… e la quota minima di ogni sistema.",
    "Migliori: filtro per quota equa (1,10–1,40, 1,40–1,80, 1,80–2,50, 2,50+).",
    "Notifica delle formazioni ufficiali: ora dice chi manca tra i giocatori importanti e quanto cambia la percentuale (es. «Il 1 passa dal 62% al 57%»).",
    "Home: sport e stato delle partite più compatti, su una riga sola." ] },
  { d: "2026-11-26", t: "Classifiche delle coppe europee", items: [
    "In Classifiche ci sono Champions League, Europa League e Conference League (gruppo «Coppe europee»). La classifica della fase a campionato ha le zone colorate: verde le prime 8 (ottavi diretti), giallo dalla 9ª alla 24ª (playoff), rosso le eliminate, con la forma delle ultime 5.",
    "Scheda Proiezione: il modello gioca 10.000 volte le partite che mancano e dice per ogni squadra la probabilità di finire tra le prime 8, ai playoff o fuori, con i punti attesi a fine fase.",
    "Scheda Numeri: gol a partita, Over 2,5, gol di entrambe, vittorie in casa, pareggi, miglior attacco e difesa, squadre ancora imbattute. E la scheda Giornate con tutte le partite.",
    "Nella scheda di una partita di coppa compare la classifica intorno alle due squadre; toccando una squadra si apre la sua pagina nel campionato.",
    "Le fasce orarie hanno il colore del cielo: blu la notte, giallo la mattina, arancione il pomeriggio, viola la sera." ] },
  { d: "2026-11-26", t: "Fasce orarie", items: [
    "Scelto un giorno, sotto il calendario trovi le fasce orarie: Notte (0–9), Mattina (9–15), Pomeriggio (15–21) e Sera (21–24), ognuna con il numero di partite. Così vedi solo quelle che ti interessano, per esempio per farti la schedina del pomeriggio.",
    "Le fasce ci sono anche in Migliori, e i numeri di sport e stato seguono la fascia scelta. Gli orari sono quelli del telefono.", "Quattro bottoni piccoli in una riga: tocca di nuovo la fascia scelta per tornare a tutto il giorno." ] },
  { d: "2026-11-26", t: "Controllo del mese", items: [
    "Il primo giorno di ogni mese l'app rilegge da sola le partite finite negli ultimi 90 giorni e scrive in Info → Archivio cosa ha trovato: dove il modello è troppo sicuro o troppo prudente, dove i bookmaker sono stati più precisi e in quali campionati fidarsi meno.",
    "Da ora l'archivio ricorda anche le partite segnalate per possibile turnover, così tra qualche mese si potrà misurare quanto pesa davvero." ] },
  { d: "2026-11-25", t: "Perché: l'esito spiegato a parole", items: [
    "In cima alla scheda Esito di ogni partita non iniziata c'è la sezione «Perché»: l'esito più probabile (o la doppia chance, se la favorita è sotto il 45%) con i motivi in elenco: forza in attacco e difesa, gol attesi, classifica, forma, casa e trasferta, precedenti, serie aperte e cosa dicono i bookmaker.",
    "Sotto, «Cosa può andare storto»: i numeri contro, come un avversario in forma, bookmaker meno convinti, possibile turnover o un campionato dove il modello è meno preciso. Vale per calcio, NBA e tennis." ] },
  { d: "2026-11-25", t: "Migliori completa e avviso turnover", items: [
    "Migliori: prima teneva solo le 40 giocate più probabili di tutta la settimana, così le partite di oggi (Inter, Atlético…) restavano fuori dietro a quelle dei giorni dopo. Ora per ogni giorno entrano anche le sue migliori 15 (dal 50% in su), quindi filtrando «Oggi» le trovi.",
    "Calcio, possibile turnover: se una squadra ha una partita più importante nei giorni subito dopo (una finale, una semifinale, un turno a eliminazione o la Champions), nella scheda compare l'avviso, per esempio «Palmeiras ha la finale di Copa Libertadores sabato 28 (tra 4 giorni)». Il modello non lo sa, i bookmaker sì: è il caso in cui guardare le loro percentuali. Le giocate di quelle partite hanno l'avviso anche in Migliori e non entrano nel riquadro Oggi." ] },
  { d: "2026-11-25", t: "Le più probabili, in cima alla partita", items: [
    "Aprendo una partita non ancora iniziata, sotto il riquadro delle squadre trovi i cartellini delle giocate più probabili (dal 70% in su, al massimo 8): percentuale, quota equa e, se c'è, il confronto con i bookmaker. Quelle dall'80% in su sono in verde.",
    "Tocca un cartellino: la pagina apre da sola la sezione giusta (Esito, Punti, Giocatori…), apre il giocatore se è chiuso e illumina in giallo la riga della giocata. La stella invece la mette in schedina." ] },
  { d: "2026-11-24", t: "Giocatori NBA: minuti giocati e medie più chiare", items: [
    "Accanto ai minuti attesi compaiono quelli giocati davvero: «29' attesi · 33' giocati» a fine partita, «finora» durante la diretta.",
    "Le medie del giocatore sono in una tabellina: una riga per le ultime 5, 10 e 15 partite, una colonna per punti, rimbalzi, assist, triple e % al tiro." ] },
  { d: "2026-11-24", t: "Giocatori a finestra e tema chiaro più colorato", items: [
    "NBA, scheda Giocatori: ogni giocatore si apre e si chiude toccando il nome o la freccia. Chiuso mostra solo punti, rimbalzi e assist attesi; in alto «Apri tutti» e «Chiudi tutti».",
    "Il bollino «Finita» delle partite concluse ora è rosso, così si nota subito.",
    "Tema chiaro: nella scheda della partita i colori delle due squadre sono più pieni e gli stemmi sullo sfondo più visibili." ] },
  { d: "2026-11-24", t: "Partite finite: com'è andata ogni giocata", items: [
    "Quando una partita è finita il riquadro delle squadre si riduce e al centro c'è il risultato finale; spariscono i cerchi e gli avvisi sulle quote, che servono solo prima del via.",
    "In ogni sezione (esito, gol, combo, risultato esatto, punti, multigol, angoli…) al posto della stella c'è ✓ o ✗, con scritto quanto è finita: per esempio «uscita: 228 punti» o «non uscita: finita con 117 punti».",
    "Giocatori NBA: accanto a ogni statistica c'è quanti ne ha fatti davvero, e le soglie si colorano (✓ raggiunta, ✗ no). Nel calcio i marcatori dicono se hanno segnato.",
    "NBA: le linee intere dei punti totali finite pari alla linea risultano «rimborsate».",
    "Il risultato finale sta nel riquadro in alto, in trasparenza sopra lo sfondo, con il bollino «Finita» in alto a destra (niente più riquadro separato). Nei giocatori ogni statistica mostra «attesi → fatti», la differenza e una barra con il segno dell'atteso." ] },
  { d: "2026-11-24", t: "Draw No Bet", items: [
    "Nella scheda del calcio c'è il Draw No Bet (pareggio rimborsato): la probabilità che vinca una squadra tolto il pareggio, con quota equa e quote dei bookmaker. Si aggiunge alla schedina con la stella e compare anche in Migliori e nella schedina della giornata.",
    "Se la partita finisce pari la giocata è «Rimborsata» e vale quota 1: la schedina resta in gioco con le altre. Se avevi segnato quota e puntata, l'app ti chiede di correggere la quota totale." ] },
  { d: "2026-11-23", t: "Partita in diretta più in evidenza", items: [
    "Quando apri una partita in corso, il riquadro delle squadre si riduce: stemmi piccoli, risultato e minuto al centro al posto del «vs», il pronostico di prima del via solo come barra sottile. Subito sotto trovi diretta, probabilità, momentum e cronaca." ] },
  { d: "2026-11-23", t: "Pronostici più precisi (prove sulle partite giocate)", items: [
    "NBA: quando un giocatore importante è fuori, una parte dei suoi minuti va ai compagni. Le loro percentuali su punti e assist sono più giuste (provato su oltre mille casi di questa stagione).",
    "NBA: gli Over/Under dei punti totali sono meno sicuri di prima, perché il modello lo era troppo rispetto alla linea dei bookmaker.",
    "Tennis: il totale dei game era sovrastimato di circa 2 game; corretto. E le qualificazioni degli Slam maschili ora sono al meglio dei 3 set, come nella realtà.",
    "Provati senza guadagno, quindi non cambiati: riposo e viaggi nell'NBA oltre al back-to-back, il peso del tempo per ogni campionato di calcio, la taratura di Over 2,5 e Goal." ] },
  { d: "2026-11-22", t: "Schede della partita che ricordano dove eri", items: [ "Passando tra Esito, Gol, Forma, Giocatori e le altre schede, ognuna riparte dal punto in cui l'avevi lasciata; una scheda nuova si apre dal suo inizio, senza riportarti in cima alla pagina." ] },
  { d: "2026-11-22", t: "Formazioni in campo", items: [ "Quando escono le formazioni ufficiali, in cima a Esito compaiono le due squadre schierate sul campo con il modulo, i numeri di maglia e i cognomi (tocca un giocatore per la sua pagina), più le panchine. Toccando il titolo «Formazioni ufficiali» il riquadro si chiude e resta chiuso finché non lo riapri." ] },
  { d: "2026-11-22", t: "Conteggi dell'elenco allineati", items: [ "I numeri sotto Calcio, Basket, Tennis e F1 e quelli di Tutte, Da giocare e Concluse ora seguono il giorno scelto, lo stato e il filtro per giocata: con «Oggi» contano solo le partite di oggi." ] },
  { d: "2026-11-22", t: "Notifiche dei gol con il marcatore e «Solo da giocare»", items: [ "Notifiche dei gol: se ESPN non ha ancora scritto chi ha segnato, l'avviso aspetta fino a 2 minuti e mezzo per arrivare con il nome.", "Elenco: «Da giocare» (in alto, accanto a Tutte) toglie le partite iniziate o finite, ora tiene il giorno scelto e resta attivo alla prossima apertura. Anche nella barra compatta c'è «Solo da giocare»." ] },
  { d: "2026-11-22", t: "Scorrimento dell'elenco più fluido", items: [ "I filtri non si restringono più mentre scorri (era quello che faceva «impazzire» la pagina): ora scorrono via e sotto l'intestazione compare una barra fissa con i giorni e i campionati in piccolo, più «Filtri» per tornare su." ] },
  { d: "2026-11-22", t: "Dove fidarsi, quote convenienti, pagina giocatore e altro", items: [
    "Info → Archivio: «Dove fidarsi» (campionato per campionato, esito, Under/Over e Goal colorati per quanto il modello mantiene le promesse) e «Modello contro mercati nel tempo» (chi sbaglia meno, anche in F1).",
    "Migliori: nuovo filtro «💰 Quote convenienti», le giocate in cui il modello dà un po' più del bookmaker (da 3 a 11 punti).",
    "Pagina del giocatore (NBA e calcio): tocca il nome nella scheda Giocatori. Medie, giocate della prossima partita, partita per partita dalle ultime 10 e quante volte ha superato la soglia.",
    "Testa a testa del calcio fino a 10 stagioni indietro (si completa nei prossimi aggiornamenti) e risultati più frequenti.",
    "Cerca a voce: tocca il microfono e di' una squadra o una partita («Inter Milan»).",
    "Quote in movimento: nella scheda un avviso quando le quote si spostano molto dalla prima volta che l'app le ha viste; per le partite seguite arriva anche una notifica." ] },
  { d: "2026-11-22", t: "Tu più pulito", items: [ "Tolti i Traguardi dal profilo." ] },
  { d: "2026-11-22", t: "Vai dritto alla giocata e capisci quando fidarti dei mercati", items: [ "Toccando una giocata nelle Migliori o nel riquadro «Le migliori di oggi» la scheda si apre già sulla scheda giusta, con la riga illuminata.", "Quando modello e mercati (o bookmaker) sono lontani almeno 12 punti, un avviso rosso dice di dare più peso ai mercati: in cima alla Gara della F1 (con i piloti in disaccordo), sulle card delle Migliori e nella scheda delle partite. Quelle giocate non finiscono più tra «Le migliori di oggi»." ] },
  { d: "2026-11-22", t: "F1: il passo in qualifica entra nel pronostico", items: [ "Le percentuali della gara ora considerano anche quanto è stato veloce ogni pilota in qualifica, non solo la posizione in griglia: utile per chi parte indietro per penalità. Provato su 17 GP del 2026: previsione del vincitore migliore di circa il 4%. Nuovo riquadro «Passo in qualifica» nella Gara." ] },
  { d: "2026-11-22", t: "F1: griglia ufficiale e quote da due mercati", items: [ "La griglia di partenza ora è quella ufficiale con le penalità (FIA tramite OpenF1, controllata con ESPN): chi è penalizzato è segnato in rosso, con la posizione in qualifica e quella di partenza. Se la griglia ufficiale non è ancora uscita, lo dice. Le percentuali della gara partono dalla griglia vera.", "Quote F1 da due mercati di previsione gratuiti, Polymarket e Kalshi, ripulite dal margine e mediate. Nuovo riquadro «Quote a confronto» nella Gara: modello, ogni mercato e quota media per vittoria e podio." ] },
  { d: "2026-11-22", t: "F1: griglia di partenza", items: [ "Dopo la qualifica la griglia di partenza compare in cima alla scheda Gara (e in Qualifica), su due file sfalsate con foto, squadra e distacco in qualifica.", "Corretto il nome di Verstappen nei tempi delle sessioni (prima compariva «V…»)." ] },
  { d: "2026-11-22", t: "Ritocchi", items: [ "Il «vs» nella scheda della partita ora è centrato tra i due stemmi.", "Su computer l'elenco delle partite a sinistra è più largo e cresce con lo schermo." ] },
  { d: "2026-11-21", t: "Computer più ordinato", items: [ "Su computer l'intestazione occupa tutta la larghezza, l'elenco delle partite a sinistra è più largo (cresce con lo schermo) e sugli schermi grandi le pagine sfruttano più spazio." ] },
  { d: "2026-11-21", t: "Sfida il modello, grafici in diretta e altre novità", items: [
    "⚔️ Sfida il modello: nella scheda della partita scegli il tuo 1X2 prima del via. In Tu c'è la classifica «Tu contro il modello», anche campionato per campionato.",
    "📈 Probabilità minuto per minuto: nella scheda in diretta (e a fine partita) un grafico mostra come cambiano 1, X e 2 a ogni gol; nel basket azione per azione, nel tennis game per game.",
    "🔥 Momento della partita (calcio): chi sta spingendo, con tiri, angoli e gol a blocchi di 5 minuti dalla cronaca ESPN.",
    "🔴 Numero sull'icona dell'app: partite seguite in corso e schedine in gioco (Android e iPhone con l'app nella schermata Home).",
    "📅 La tua settimana in Tu: giocate prese, schedine, bilancio in euro e sfide, con immagine da condividere.",
    "🎲 Simulatore nella Schedina: «su 100 volte passa X», la giocata più a rischio e il cambio che rende la schedina più sicura (con il pulsante Cambia).",
    "⛅ Meteo all'ora della partita nella scheda del calcio (solo informazione, non cambia le percentuali).",
    "🗓️ Calendario completo delle tue squadre (da Tu) e, con le notifiche attive, promemoria alle 8:30 nel giorno della partita." ] },
  { d: "2026-11-21", t: "Risultati in diretta nell'elenco", items: [
    "Nell'elenco delle partite, quelle in corso mostrano il bollino rosso «Live» lampeggiante, il minuto (o quarto, o set) e il punteggio, aggiornati ogni pochi secondi per calcio, basket e tennis. A fine partita passano da sole a «Finale». Un lampo sul punteggio segnala il gol appena arrivato. In F1 la sessione o la gara in corso ha il bollino «Live»." ] },
  { d: "2026-11-21", t: "Multigol, A-League e schedina giocata più chiara", items: [
    "Calcio: oltre al Multigol totale ci sono il Multigol della squadra di casa e di quella ospite (0-1, 1-2, 1-3, 2-3, 2-4), nella scheda (Gol), in Migliori, nella schedina della giornata e con l'esito controllato da solo.",
    "Nuovo campionato: A-League australiana (pronostici, classifica, giornate e diretta).",
    "Schedina giocata: in Tu diventa un riquadro con quota, puntata e vincita; «Modifica» riapre i campi. Il riquadro Schedine in home conta a parte quelle già giocate." ] },
  { d: "2026-11-21", t: "Segna la schedina come giocata", items: [
    "Nelle schedine salvate (in Tu) scrivi quota e puntata del tuo sito: il conto della vincita si aggiorna mentre scrivi. Poi tocca «✓ Segna come giocata»: la schedina diventa «Giocata» e il bilancio in euro la conta quando finisce. L'app non scommette: la giocata la fai sul tuo sito." ] },
  { d: "2026-11-21", t: "Rigioca una schedina", items: [
    "In Tu, ogni schedina salvata ha «🔁 Rigioca»: scegli le giocate da rimettere nella schedina. Se la partita è già stata giocata, l'app usa la prossima partita delle stesse squadre con la stessa giocata e la probabilità aggiornata." ] },
  { d: "2026-11-20", t: "Undici miglioramenti", items: [
    "F1: il pronostico della gara tiene conto del passo nelle prove libere del weekend (provato su 17 GP del 2026: previsioni migliori). In Gara la sezione «Passo nelle prove libere».",
    "F1: «Strategia più probabile» in Gomme (soste, mescole, giro della prima sosta, costo della sosta) e, in Testa a testa, il confronto dei due piloti sessione per sessione.",
    "Info → Archivio: «Per tipo di giocata», quante volte esce la scelta del modello per 1X2, doppia chance, Under/Over, Goal, vincente, punti e game totali, F1.",
    "Tu: storico con barre per sport, dove vai meglio o peggio del previsto e quante schedine salvate hai vinto.",
    "Costruisci la multipla: quote obiettivo fino a 50, filtro per tipo di giocata e preferenza per le giocate dove il modello vede valore sui bookmaker.",
    "Notifiche → Altri avvisi: «Giocata della schedina a rischio», quando durante la partita una giocata scende sotto la soglia che scegli (20–50%).",
    "Scheda della partita a tema con i colori delle due squadre e gli stemmi grandi in trasparenza.",
    "Tennis: tabellone del torneo con i turni e la stima di chi vince il torneo (dalla scheda di ogni incontro).",
    "Scorciatoie: tieni premuta l'icona dell'app (Android) per aprire subito Migliori, Diretta, Multipla o Tu.",
    "Calcio: provata la correzione per la stanchezza (poco riposo tra due partite): non migliora i pronostici, quindi non è stata aggiunta." ] },
  { d: "2026-11-20", t: "Meteo della gara in vista", items: [
    "F1: il meteo della gara (temperatura e pioggia) è nel riquadro in alto del GP; nella scheda Meteo la gara viene per prima, le sessioni già corse in fondo." ] },
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
