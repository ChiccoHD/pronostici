"use strict";
/* Novità dell'app, dalla più recente. Ogni nuova funzione va aggiunta qui in cima, con data (AAAA-MM-GG) e testo breve. */
const NOVITA = [
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
