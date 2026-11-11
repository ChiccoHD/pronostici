"use strict";
/* Pronostici — area personale ("Tu") e pagina Info (come funziona, affidabilità, stato dei dati). Usa funzioni di app.js. */

/* ------------------------------------------------------------------ area personale */

function showMe() {
  const teams = myTeams(), slips = mySlips(), hist = favs().filter(f => f.result);
  const st = s => slipState(s).cls;
  const openSlips = slips.filter(s => !["win", "lose"].includes(st(s))), won = slips.filter(s => st(s) === "win"), lost = slips.filter(s => st(s) === "lose");
  const tile = (n, l, href) => `<a class="me-tile" href="${href}"><b>${n}</b><span>${l}</span></a>`;
  let html = `<h1 class="page-h">La tua area</h1>
    <div class="me-tiles">${tile(teams.length, teams.length === 1 ? "squadra seguita" : "squadre seguite", "#/tu")}${tile(openSlips.length, "schedine aperte", "#/tu")}
      ${tile(`${won.length}<small>/${won.length + lost.length}</small>`, "schedine vinte", "#/tu")}</div>`;

  // squadre seguite e loro prossime partite
  const names = t => new Set([t.name, t.short].filter(Boolean));
  const evs = [], seen = new Set();
  for (const t of teams) for (const e of INDEX.events.filter(e => names(t).has(e.home) || names(t).has(e.away)).slice(0, 2))
    if (!seen.has(e.id)) { seen.add(e.id); evs.push(e); }
  evs.sort((a, b) => a.date.localeCompare(b.date));
  const href = t => t.kind === "player" ? playerHref(t.lk, t.id) : teamHref(t.lk, t.id);
  html += sec("Le mie squadre", teams.length
    ? `<div class="me-teams">${teams.map((t, i) => `<div class="me-team"><a href="${href(t)}">${t.logo ? img(t.logo, t.kind === "player" ? "tflag" : "tlogo") : ""}<b>${esc(t.name)}</b></a>
        <button type="button" class="me-x" data-unfollow="${i}" aria-label="Smetti di seguire ${esc(t.name)}">×</button></div>`).join("")}</div>
      <h3 class="lb-h3">Prossime partite</h3>${evs.length ? evs.slice(0, 8).map(e => `<section class="group">${fixture(e)}</section>`).join("") : `<p class="note">Nessuna loro partita nei prossimi giorni.</p>`}`
    : `<p class="note">Non segui ancora nessuna squadra. Apri la pagina di una squadra (dalle <a href="#/classifiche">Classifiche</a> o toccandone il nome in una partita) o di un tennista e tocca <b>Segui</b>: qui troverai le loro prossime partite.</p>`,
    "", "Tu squadre");

  // schedine salvate (complete, con quota, puntata ed esito) e storico delle giocate
  html += slips.length ? slipsSection() : sec("Le mie schedine", `<p class="note">Componi una schedina nella pagina Schedina e tocca <b>Salva come schedina</b>: la ritrovi qui, e l'app segna da sola se è vinta o persa.</p>
    <a class="btn-main" href="#/schedina" style="text-decoration:none">Vai alla schedina</a>`, "", "Tu schedine");
  html += playedHtml();

  // dati sul telefono
  html += sec("I tuoi dati", `<p class="note" style="margin-top:0">Squadre seguite, schedine e storico restano solo su questo telefono. Salvane una copia per non perderli se cambi telefono o cancelli i dati del browser.</p>
    <div class="me-acts"><button type="button" class="btn-main" id="me-export">Salva una copia</button>
    <label class="btn-main alt" style="cursor:pointer">Ripristina da una copia<input type="file" id="me-import" accept="application/json,.json" hidden></label></div>`, "", "Tu dati");
  $app.innerHTML = html;
  wireSlips(); wirePlayed(); attachSlipStatus();

  $app.querySelectorAll("[data-unfollow]").forEach(b => b.onclick = () => { const l = myTeams(); l.splice(Number(b.dataset.unfollow), 1); saveMyTeams(l); showMe(); });
  document.getElementById("me-export").onclick = () => {
    const data = {};
    for (const k of Object.keys(localStorage)) if (k.startsWith("p_")) data[k] = localStorage.getItem(k);
    const blob = new Blob([JSON.stringify({ app: "pronostici", saved: new Date().toISOString(), data }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `pronostici-copia-${isoDay(Date.now())}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  document.getElementById("me-import").onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const js = JSON.parse(await f.text());
      if (js.app !== "pronostici" || !js.data) throw new Error();
      if (!confirm("Sostituire i dati di questo telefono con quelli della copia?")) return;
      for (const [k, v] of Object.entries(js.data)) if (k.startsWith("p_")) localStorage.setItem(k, v);
      toast("Dati ripristinati"); updateFavBadge(); showMe();
    } catch { toast("Questo file non è una copia di Pronostici"); }
  };
}

/* ------------------------------------------------------------------ info: come funziona, affidabilità, stato */

const INFO_TABS = [["come", "Come funziona"], ["affidabilita", "Affidabilità"], ["dati", "Aggiornamenti"]];

async function showInfoHub(tab) {
  tab = INFO_TABS.some(([k]) => k === tab) ? tab : "come";
  const tabs = `<div class="info-tabs" role="tablist">${INFO_TABS.map(([k, l]) => `<a href="#/info/${k}" role="tab" aria-selected="${k === tab}">${l}</a>`).join("")}</div>`;
  $app.innerHTML = `<h1 class="page-h">Info</h1>${tabs}<p class="muted" style="padding:12px 4px">Caricamento…</p>`;
  let body = "";
  if (tab === "come") body = infoHow();
  if (tab === "affidabilita") body = await infoReliability();
  if (tab === "dati") body = infoStatus();
  if (!location.hash.startsWith("#/info")) return;
  $app.innerHTML = `<h1 class="page-h">Info</h1>${tabs}${body}`;
}

function infoHow() {
  const card = (ic, t, txt) => `<div class="how"><span class="how-ic">${ic}</span><div><b>${t}</b><p>${txt}</p></div></div>`;
  const term = (t, d) => `<div class="r"><span class="l"><b>${t}</b><br><span class="faint">${d}</span></span></div>`;
  return sec("In breve", `<div class="prose"><p>Per ogni partita l'app stima le probabilità di tutti gli esiti partendo dai dati delle partite già giocate. Sono <b>stime</b>, non certezze.</p>
      <p>I dati si aggiornano da soli sei volte al giorno (${UPDATE_TIMES}); il Live si aggiorna dal telefono ogni pochi secondi.</p></div>`, "", "Info breve")
    + sec("Come ragiona per ogni sport", card("⚽", "Calcio", "Quanto attacca e quanto difende ogni squadra, dalle ultime tre stagioni con più peso alle partite recenti. Usa gol, gol attesi (xG) e tiri in porta. Da lì calcola la probabilità di ogni risultato e tutti i mercati.")
      + card("🏆", "Coppe europee", "Un modello unico su più campionati europei e sulle partite di coppa, che dicono quanto vale una squadra rispetto a quelle di altri paesi.")
      + card("🏀", "NBA", "Valutazione di attacco e difesa in punti, fattore campo, stanchezza nelle partite in due sere di fila, incrociata con il modello di ESPN.")
      + card("🎾", "Tennis", "Punteggio Elo generale e per superficie, poi una simulazione punto per punto per game, set e tie-break."), "", "Info sport")
    + sec("Parole che trovi nell'app", `<div class="rows glossary">
      ${term("Quota equa", "La quota giusta secondo il modello (1 diviso la probabilità). Se il sito paga meno, la giocata è sfavorevole secondo il modello.")}
      ${term("Punti dalle quote", "Quanto la stima del modello si discosta da quella dei bookmaker, senza il loro margine.")}
      ${term("Affidabilità", "Quanto il modello ci ha preso sulle partite già giocate di quella competizione: buona, discreta, da verificare.")}
      ${term("Tendenze", "Serie aperte nelle ultime partite (per esempio Over da 6 partite). Sono un'informazione, non un pronostico.")}
      ${term("Multipla", "Più giocate insieme: la probabilità che escano tutte è il prodotto delle singole, quindi scende in fretta.")}</div>`, "", "Info parole")
    + sec("Da dove arrivano i dati", `<div class="rows glossary">
      ${term("ESPN", "Calendari, tabellini, formazioni, risultati in diretta, infortuni NBA, quote di confronto.")}
      ${term("football-data.co.uk", "Risultati e statistiche del calcio (tiri, angoli, cartellini, xG) e quote medie.")}
      ${term("Understat, Wikipedia, TheSportsDB", "Gol attesi quando disponibili e foto dei giocatori.")}</div>
      <p class="note">Tutte gratuite. Le quote dei bookmaker non entrano mai nel calcolo: servono solo come confronto.</p>`, "", "Info fonti")
    + `<div class="care"><b>Gioca responsabilmente</b><p>Battere le quote con costanza è molto difficile. Se il gioco smette di essere un divertimento, il Telefono Verde dell'Istituto Superiore di Sanità risponde all'<a href="tel:800558822">800 558 822</a>, gratis e in forma anonima.</p></div>`;
}

async function infoReliability() {
  if (!REL) { try { REL = await getJSON("data/affidabilita.json"); } catch { REL = {}; } }
  const names = { "1x2": "Esito 1X2", ou25: "Over/Under 2,5", win: "Vincente", total: "Punti totali" };
  const sportOf = k => k.startsWith("calcio") || k.startsWith("coppe") ? "Calcio" : k.startsWith("nba") ? "Basket" : k.startsWith("tennis") ? "Tennis" : "Altro";
  const groups = {};
  for (const [k, comp] of Object.entries(REL)) (groups[sportOf(k)] ||= []).push([k, comp]);
  if (!Object.keys(groups).length) return `<div class="empty"><b>Verifica non ancora disponibile</b>Compare dopo il primo aggiornamento dei dati.</div>`;
  const plain = s => {
    if (s.brier_book == null) return "Non ci sono quote con cui confrontarlo.";
    const d = s.brier - s.brier_book;
    return d <= 0.002 ? "Preciso quanto i bookmaker." : d <= 0.008 ? "Un po' meno preciso dei bookmaker." : "Meno preciso dei bookmaker: prendi le percentuali con cautela.";
  };
  let html = `<div class="prose rel-intro"><p>Il modello rifà le previsioni delle partite già giocate usando solo i dati di prima, e le confronta con com'è andata e con le quote dei bookmaker.</p>
    <p><span class="grade g2">buona</span> <span class="grade g1">discreta</span> <span class="grade g0">da verificare</span> &nbsp;Tocca una competizione per i dettagli.</p></div>`;
  for (const [sport, list] of Object.entries(groups)) {
    const rows = list.map(([k, comp]) => {
      const mk = Object.entries(comp).filter(([m, s]) => m !== "name" && m !== "espn" && s && s.n && s.brier != null);
      if (!mk.length) return "";
      const chips = mk.map(([m, s]) => `<span class="grade g${s.grade?.level ?? 0}" title="${esc(names[m] || m)}">${esc(names[m] || m)}</span>`).join("");
      const det = mk.map(([m, s]) => `<div class="rel-m"><b>${esc(names[m] || m)}</b> <span class="grade g${s.grade?.level ?? 0}">${esc(s.grade?.label || "")}</span>
        <p>${esc(plain(s))} Verificato su ${s.n} partite${s.calib_error != null ? `; quando dice una percentuale, in media sbaglia di ${num(s.calib_error * 100, 1)} punti` : ""}.</p>
        ${calibChart(s.calibration || [])}</div>`).join("");
      return `<details class="rel-row"><summary><span class="rel-n">${esc(comp.name || k)}</span><span class="rel-chips">${chips}</span></summary>${det}</details>`;
    }).join("");
    html += sec(sport, rows, "", `Affidabilità ${sport}`);
  }
  html += `<p class="note">Nei grafici, se i punti stanno sulla diagonale le percentuali sono ben tarate: quando il modello dice 60%, l'evento accade circa 6 volte su 10.</p>`;
  return html;
}

function infoStatus() {
  const st = META?.status || {};
  const label = { calcio: "Calcio", nba: "NBA", tennis: "Tennis", coppe: "Coppe europee" };
  const flat = v => Array.isArray(v) ? v.join(", ") : v && typeof v === "object" ? Object.entries(v).map(([a, b]) => `${a}: ${Array.isArray(b) ? b.join(", ") : b}`).join("; ") : String(v);
  const rows = Object.entries(st).map(([sport, s]) => {
    const parts = Object.entries(s).filter(([k]) => k !== "aggiornato");
    const bad = parts.some(([k, v]) => k === "errore" || /errore|non raggiungibile/i.test(flat(v)));
    return `<details class="rel-row"><summary><span class="rel-n">${esc(label[sport] || sport)}</span><span class="rel-chips"><span class="grade ${bad ? "g0" : "g2"}">${bad ? "con problemi" : "ok"}</span><small class="faint">${s.aggiornato ? esc(ago(s.aggiornato)) : ""}</small></span></summary>
      ${parts.map(([k, v]) => `<div class="status-line"><span>${esc(k.replace(/_/g, " "))}</span><span class="${/errore|non raggiungibile/i.test(flat(v)) || k === "errore" ? "err" : ""}">${esc(flat(v))}</span></div>`).join("")}</details>`;
  }).join("");
  return sec("Stato dei dati", `<p class="note" style="margin-top:0">Ultimo aggiornamento ${META?.updated ? esc(ago(META.updated)) : "non ancora eseguito"}. Prossimi verso le ${UPDATE_TIMES}.</p>${rows}`, "", "Info stato");
}
