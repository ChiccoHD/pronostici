"use strict";
/* Pronostici — classifiche dei campionati e pagina squadra.
   Dati in data/leagues/<campionato>.json (scritti dal workflow). Usa funzioni di app.js. */

const TABLE_LEAGUES = [["serie-a", "Serie A"], ["premier-league", "Premier"], ["la-liga", "LaLiga"], ["bundesliga", "Bundesliga"],
  ["ligue-1", "Ligue 1"], ["serie-b", "Serie B"], ["championship", "Championship"], ["eredivisie", "Eredivisie"], ["super-lig", "Süper Lig"],
  ["scozia", "Scozia"], ["belgio", "Belgio"], ["primeira-liga", "Portogallo"], ["eliteserien", "Norvegia"], ["mls", "MLS"], ["j1", "Giappone"], ["nba", "NBA"]];
const LEAGUE_DATA = new Map();

async function leagueData(key) {
  if (!LEAGUE_DATA.has(key)) LEAGUE_DATA.set(key, getJSON(`data/leagues/${encodeURIComponent(key)}.json`).catch(() => null));
  return LEAGUE_DATA.get(key);
}
const teamHref = (lk, id) => lk && id ? `#/squadra/${encodeURIComponent(lk)}/${encodeURIComponent(id)}` : "";
const backBtn = label => `<button class="back" onclick="history.length > 1 ? history.back() : location.hash='#/'">‹ ${esc(label)}</button>`;

/* ------------------------------------------------------------------ classifiche */

async function showStandings(key) {
  key = TABLE_LEAGUES.some(([k]) => k === key) ? key : load("table", "serie-a");
  save("table", key);
  const chips = `<div class="leagues tbl-leagues" role="group" aria-label="Campionato">${TABLE_LEAGUES.map(([k, l]) =>
    `<a href="#/classifiche/${k}" class="chip-a" aria-pressed="${k === key}">${leagueMark(k)}${esc(l)}</a>`).join("")}</div>`;
  $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Classifiche</h1>` + chips + `<p class="muted" style="padding:16px 4px">Caricamento…</p>`;
  $app.querySelector('.tbl-leagues [aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  const L = await leagueData(key);
  if (!location.hash.startsWith("#/classifiche")) return;
  if (!L || !L.table?.length) {
    $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Classifiche</h1>` + chips + `<div class="empty"><b>Classifica non ancora disponibile</b>Compare dopo il prossimo aggiornamento dei dati.</div>`;
    return;
  }
  const form = f => `<span class="mini-form">${(f || []).slice(0, 5).reverse().map(r => `<i class="${r}" title="${{ V: "vittoria", N: "pareggio", P: "sconfitta" }[r]}"></i>`).join("")}</span>`;
  const mark = t => t.logo ? img(t.logo, "tlogo") : `<span class="tdot" style="background:${t.color ? "#" + String(t.color).replace("#", "") : "var(--ink-3)"}"></span>`;
  let body;
  if (L.sport === "nba") {
    const grp = g => {
      const rows = L.table.filter(r => r.group === g);
      return sec(`Conference ${g}`, `<div class="std nba"><div class="std-r head"><span>#</span><span>Squadra</span><span>V</span><span>P</span><span>%</span><span>Forma</span></div>
        ${rows.map(r => `<a class="std-r ${r.pos <= 6 ? "z-top" : r.pos <= 10 ? "z-mid" : ""}" href="${teamHref("nba", r.id)}"><span>${r.pos}</span><span class="std-t">${mark(r)}<b>${esc(r.name)}</b></span>
          <span>${r.w}</span><span>${r.l}</span><span>${(r.pct * 100).toFixed(0)}</span>${form(r.form)}</a>`).join("")}</div>`, "", `Classifica NBA ${g}`);
    };
    body = grp("Est") + grp("Ovest") + `<p class="note">In verde le prime 6 di ogni conference (playoff diretti), in giallo dalla 7ª alla 10ª (play-in). Forma: ultime 5, la più recente a destra.</p>`;
  } else {
    body = sec(L.name, `<div class="std"><div class="std-r head"><span>#</span><span>Squadra</span><span>G</span><span>DR</span><span>Pt</span><span>Forma</span></div>
      ${L.table.map(r => `<a class="std-r" href="${teamHref(key, r.id)}"><span>${r.pos}</span><span class="std-t">${mark(r)}<b>${esc(r.short || r.name)}</b></span>
        <span>${r.p}</span><span>${r.gd > 0 ? "+" : ""}${r.gd}</span><span><b>${r.pts}</b></span>${form(r.form)}</a>`).join("")}</div>`,
      `${L.table[0]?.p ?? 0} giornate`, `Classifica ${key}`)
      + `<p class="note">G partite giocate, DR differenza reti. Forma: ultime 5, la più recente a destra. La classifica è calcolata dai risultati: penalizzazioni e criteri di parità ufficiali possono cambiare qualche posizione.</p>`;
  }
  $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Classifiche</h1>` + chips + body + `<p class="note">Tocca una squadra per la sua pagina.</p>`;
  $app.querySelector('.tbl-leagues [aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
}

/* ------------------------------------------------------------------ pagina squadra */

async function showTeam(lk, id) {
  $app.innerHTML = backBtn("Indietro") + `<p class="muted" style="padding:16px 4px">Caricamento…</p>`;
  const L = await leagueData(lk);
  if (!location.hash.startsWith("#/squadra")) return;
  const T = L?.teams?.[id];
  if (!T) { $app.innerHTML = backBtn("Indietro") + `<div class="empty"><b>Squadra non trovata</b>I dati delle squadre arrivano con l'aggiornamento dei dati.</div>`; return; }
  const nba = L.sport === "nba";
  const c = usable(T.color ? "#" + String(T.color).replace("#", "") : null) ? "#" + String(T.color).replace("#", "") : usable(T.alt ? "#" + String(T.alt).replace("#", "") : null) ? "#" + String(T.alt).replace("#", "") : "#6d5a6b";
  const S = T.season || {};
  const rec = nba ? `${T.record.w} vinte, ${T.record.l} perse` : `${S.w ?? 0} vinte, ${S.d ?? 0} pari, ${S.l ?? 0} perse`;
  const lgName = `<span class="th-lg">${leagueMark(lk)}${esc(L.name)}</span>`;
  const posTxt = nba ? `${T.pos}ª nella Conference ${T.group}` : `${T.pos}ª in ${L.name}, ${T.pts} punti`;
  const head = `<div class="board team-head"><div class="th-logo">${T.logo ? img(T.logo, "") : `<span class="mono" style="background:${c};color:${onColor(c)}">${esc(initials(T.name))}</span>`}</div>
    ${lgName}<h1>${esc(T.name)}</h1><div class="th-sub">${esc(posTxt)}</div><div class="th-sub">${esc(rec)}</div>
    <div class="th-form">${formSeq((T.form5?.seq || []).slice(0, 5))}<small>ultime 5, la più recente a sinistra</small></div>
    <div style="margin-top:10px">${followBtn({ kind: "team", lk, id: T.id, name: T.name, short: T.short, logo: T.logo })}</div>
    <a class="th-link" href="#/classifiche/${encodeURIComponent(lk)}">Classifica ${esc(L.name)} ›</a></div>`;

  // prossime partite (anche di coppa): dall'elenco delle partite in programma
  const names = new Set([T.name, T.short].filter(Boolean));
  const next = INDEX.events.filter(e => names.has(e.home) || names.has(e.away));
  const nextHtml = next.length ? next.map(e => `<section class="group">${fixture(e)}</section>`).join("") : `<p class="note">Nessuna partita nei prossimi giorni.</p>`;

  const oppName = o => nba ? ((L.names || {})[o] || o) : o;
  const last = `<div class="rows games">${(T.last || []).map(g => `<div class="r"><span class="l">${fmtShort(g.date)}, ${g.home ? "in casa con" : "fuori con"} ${esc(oppName(g.opp))}</span>
    <span class="v num"><span class="f ${g.res}">${g.res}</span> ${nba ? `${g.pf}-${g.pa}` : `${g.gf}-${g.ga}`}</span></div>`).join("")}</div>`;

  const H = T.home_season || {}, A = T.away_season || {};
  const col = (lab, f, fmt = x => x ?? "–") => `<tr><td>${lab}</td><td>${fmt(f(S))}</td><td>${fmt(f(H))}</td><td>${fmt(f(A))}</td></tr>`;
  const stats = `<table class="vs-table st3"><tr><th></th><th>Totale</th><th>Casa</th><th>Fuori</th></tr>
    ${col("Partite", x => x.n)}
    ${nba ? col("Vinte, perse", x => x.n ? `${x.w}-${x.l}` : null) : col("Vinte, pari, perse", x => x.n ? `${x.w}-${x.d}-${x.l}` : null)}
    ${nba ? col("Punti fatti", x => x.pf, v => num(v)) + col("Punti subiti", x => x.pa, v => num(v)) + col("Totale medio", x => x.total, v => num(v))
      : col("Gol fatti a partita", x => x.gf, v => num(v)) + col("Gol subiti a partita", x => x.ga, v => num(v)) + col("Over 2,5", x => x.over25, pct)
        + col("Goal", x => x.btts, pct) + col("Porta inviolata", x => x.clean, pct) + col("Senza segnare", x => x.fail, pct)
        + (S.corners_f != null ? col("Angoli fatti", x => x.corners_f, v => num(v)) : "") + (S.xg_f != null ? col("Gol attesi fatti", x => x.xg_f, v => num(v)) : "")}
  </table>`;

  const players = (T.players || []);
  const plHtml = !players.length ? `<p class="note">Dati dei giocatori non ancora disponibili.</p>` : nba
    ? `<div class="sp-row head nba-pl"><span></span><span>Giocatore</span><span>Punti</span><span>Rimb.</span><span>Assist</span><span>Min</span></div>` + players.map(p =>
      `<div class="sp-row nba-pl">${avatar(p.name, c, p.pos, headshot("nba", p.pid))}<span class="sp-name"><b>${esc(p.name)}</b><span>${p.gp} partite${p.fg_pct != null ? `, ${Math.round(p.fg_pct * 100)}% al tiro` : ""}</span></span>
        <span class="v">${num(p.pts)}</span><span class="v">${num(p.reb)}</span><span class="v">${num(p.ast)}</span><span class="v">${num(p.min, 0)}</span></div>`).join("")
    : `<div class="sp-row head"><span></span><span>Giocatore</span><span>Gol</span><span>Assist</span><span>Pres.</span><span>Gialli</span></div>` + players.map(p =>
      `<div class="sp-row">${avatar(p.name, c, null, p.photo ?? headshot("soccer", p.pid))}<span class="sp-name"><b>${esc(p.name)}</b><span>${esc(p.pos || "")} · ${p.starts} da titolare</span></span>
        <span class="v ${p.tot.g >= 5 ? "hot" : ""}">${p.tot.g}</span><span class="v">${p.tot.a}</span><span class="v">${p.apps}</span><span class="v">${p.tot.yc}</span></div>`).join("");

  $app.innerHTML = backBtn("Indietro") + head
    + (T.trends?.length ? sec("Tendenze in corso", trendsList(T.trends, nba ? "nba" : "soccer") + `<p class="note">Serie aperte nelle ultime partite. Prima o poi si interrompono: sono un'informazione, non un pronostico.</p>`, "", "Squadra tendenze") : "")
    + sec("Prossime partite", nextHtml, "", "Squadra prossime")
    + sec("Ultime partite", last, "", "Squadra ultime")
    + sec("In stagione", stats, "", "Squadra stagione")
    + sec(nba ? "Giocatori, medie a partita" : "Giocatori in stagione", plHtml, nba ? "" : "in campionato", "Squadra giocatori")
    + `<p class="note">Dati aggiornati ${esc(ago(L.updated))}.</p>`;
}

/* ------------------------------------------------------------------ squadre e giocatori preferiti */

function myTeams() { try { return JSON.parse(localStorage.getItem("p_myteams") || "[]"); } catch { return []; } }
function saveMyTeams(list) { try { localStorage.setItem("p_myteams", JSON.stringify(list)); } catch { /* niente */ } }
const isMine = (lk, id) => myTeams().some(t => t.lk === lk && String(t.id) === String(id));
function toggleMine(item) {
  const list = myTeams(), had = list.some(t => t.lk === item.lk && String(t.id) === String(item.id));
  saveMyTeams(had ? list.filter(t => !(t.lk === item.lk && String(t.id) === String(item.id))) : [...list, item]);
  toast(had ? "Tolta dalle tue squadre" : "Aggiunta alle tue squadre: le sue partite sono in cima all'elenco");
  return !had;
}
function followBtn(item) {
  const on = isMine(item.lk, item.id);
  return `<button type="button" class="follow ${on ? "on" : ""}" data-follow='${esc(JSON.stringify(item))}'><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>${on ? "La segui" : "Segui"}</button>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-follow]");
  if (!b) return;
  e.preventDefault();
  const on = toggleMine(JSON.parse(b.dataset.follow));
  b.classList.toggle("on", on);
  b.lastChild.textContent = on ? "La segui" : "Segui";
});

/* in cima all'elenco: le prossime partite delle squadre seguite */
function myTeamsBlock() {
  const list = myTeams();
  if (!list.length) return "";
  const names = t => new Set([t.name, t.short].filter(Boolean));
  const evs = [], seen = new Set();
  for (const t of list) {
    const ns = names(t);
    const next = INDEX.events.filter(e => ns.has(e.home) || ns.has(e.away));
    for (const e of next.slice(0, 2)) if (!seen.has(e.id)) { seen.add(e.id); evs.push(e); }
  }
  evs.sort((a, b) => a.date.localeCompare(b.date));
  const chips = list.map(t => `<a class="my-chip" href="${t.kind === "player" ? `#/tennista/${encodeURIComponent(t.lk)}/${encodeURIComponent(t.id)}` : teamHref(t.lk, t.id)}">${t.logo ? img(t.logo, t.kind === "player" ? "tflag" : "tlogo") : ""}${esc(t.short || t.name)}</a>`).join("");
  return `<section class="sec my-teams"><h2>Le mie squadre<small>${list.length}</small></h2><div class="my-chips">${chips}</div>
    ${evs.length ? `<div class="my-next">${evs.slice(0, 6).map(e => `<section class="group">${fixture(e)}</section>`).join("")}</div>` : `<p class="note">Nessuna loro partita nei prossimi giorni.</p>`}</section>`;
}

/* ------------------------------------------------------------------ tendenze */

const TREND_ICON = { pos: "▲", neg: "▼", gol: "⚽" };
function trendsList(list, sport) {
  return `<div class="trends">${list.map(t => `<div class="trend k-${t.k}"><span class="tr-ic">${sport === "nba" && t.k === "gol" ? "🏀" : TREND_ICON[t.k] || "•"}</span><span>${esc(t.t)}</span></div>`).join("")}</div>`;
}
function trendsSection(d, cH, cA) {
  const T = d.trends || {};
  if (!(T.home?.length || T.away?.length)) return "";
  const block = (t, list, c) => list?.length ? `<div class="tr-team">${tpill(t.short || t.name, c)}${trendsList(list, d.sport)}</div>` : "";
  return sec("Tendenze in corso", block(d.home, T.home, cH) + block(d.away, T.away, cA)
    + `<p class="note">Serie aperte nelle ultime partite (le più recenti per prime) e frequenze alte nelle ultime 10. Le serie prima o poi si interrompono: sono un'informazione, non un pronostico.</p>`, "", "Tendenze partita");
}

/* ------------------------------------------------------------------ pagina del tennista */

const TENNIS_DATA = new Map();
async function tennisData(tour) {
  if (!TENNIS_DATA.has(tour)) TENNIS_DATA.set(tour, getJSON(`data/tennis/${encodeURIComponent(tour)}.json`).catch(() => null));
  return TENNIS_DATA.get(tour);
}
const playerHref = (tour, name) => `#/tennista/${encodeURIComponent(tour)}/${encodeURIComponent(name)}`;

async function showPlayer(tour, name) {
  $app.innerHTML = backBtn("Indietro") + `<p class="muted" style="padding:16px 4px">Caricamento…</p>`;
  const D = await tennisData(tour);
  if (!location.hash.startsWith("#/tennista")) return;
  const P = D?.players?.[name];
  if (!P) { $app.innerHTML = backBtn("Indietro") + `<div class="empty"><b>Scheda non disponibile</b>Le schede dei giocatori ci sono per chi ha un incontro in programma nei prossimi giorni.</div>`; return; }
  const SURF_IT = { Hard: "Cemento", Clay: "Terra rossa", Grass: "Erba" };
  const pctW = r => r.w + r.l ? `${Math.round(100 * r.w / (r.w + r.l))}%` : "–";
  const photo = headshot("tennis", P.pid);
  const head = `<div class="board team-head"><span class="th-lg">${leagueMark(tour)}${tour.toUpperCase()}</span>
    <div class="th-logo">${photo ? `<span class="pl-ph">${img(photo, "pphoto")}${img(P.flag, "tflag")}</span>` : img(P.flag, "tflag big")}</div>
    <h1>${esc(P.name)}</h1><div class="th-sub">${[esc(P.country || ""), P.seed ? `testa di serie ${P.seed} nel torneo in corso` : ""].filter(Boolean).join(", ")}</div>
    <div class="th-sub">${P.year.w} vinte e ${P.year.l} perse quest'anno · Elo ${P.elo}</div>
    ${P.streak?.n >= 2 ? `<div class="th-sub"><b>${P.streak.res === "V" ? "Vince" : "Perde"} da ${P.streak.n} incontri</b></div>` : ""}
    <div class="th-form">${formSeq(P.last.slice(0, 10).map(x => x.res))}<small>ultimi 10, il più recente a sinistra</small></div>
    <div style="margin-top:10px">${followBtn({ kind: "player", lk: tour, id: P.name, name: P.name, short: lastName(P.name), logo: P.flag })}</div></div>`;
  const surf = `<table class="vs-table st3"><tr><th></th><th>Elo</th><th>Ultimi 12 mesi</th><th>Nello storico</th></tr>
    ${["Hard", "Clay", "Grass"].map(s => { const x = P.surfaces[s]; return `<tr><td>${SURF_IT[s]}</td><td>${x.elo}</td><td>${x.y.w}-${x.y.l} <small class="faint">${pctW(x.y)}</small></td><td>${x.all.w}-${x.all.l}</td></tr>`; }).join("")}</table>
    <p class="note">L'Elo misura la forza stimata: 1500 è la media del circuito, sopra i 2000 i migliori.</p>`;
  const ns = new Set([P.name]);
  const next = INDEX.events.filter(e => ns.has(e.home) || ns.has(e.away));
  const last = `<div class="rows games">${P.last.map(m => `<div class="r"><span class="l">${fmtShort(m.date)}, con ${esc(m.opp)}<br><span class="faint">${esc(m.tournament)}, ${esc(roundIt(m.round))}, ${esc(SURF_IT[m.surface] || m.surface)}</span></span>
    <span class="v num" style="font-size:15px"><span class="f ${m.res}">${m.res}</span> ${esc(m.score)}</span></div>`).join("")}</div>`;
  const tours = P.tournaments.length ? `<div class="rows games">${P.tournaments.map(t => `<div class="r"><span class="l">${esc(t.tournament)}<br><span class="faint">${esc(SURF_IT[t.surface] || t.surface)}, ${fmtShort(t.date)}</span></span>
    <span class="v">${t.title ? `<b class="title-win">🏆 Vinto</b>` : esc(roundIt(t.last_round))}<br><small class="faint">${t.w}-${t.l}</small></span></div>`).join("")}</div>` : `<p class="note">Nessun torneo quest'anno nello storico.</p>`;
  $app.innerHTML = backBtn("Indietro") + head
    + sec("Prossimi incontri", next.length ? next.map(e => `<section class="group">${fixture(e)}</section>`).join("") : `<p class="note">Nessun incontro nei prossimi giorni.</p>`, "", "Tennista prossimi")
    + sec("Per superficie", surf, "", "Tennista superfici")
    + sec("Ultimi incontri", last, `${P.last.length}`, "Tennista ultimi")
    + sec(`Tornei del ${new Date().getFullYear()}`, tours, "", "Tennista tornei")
    + `<p class="note">Dati da ESPN, solo singolare, circuito ${tour.toUpperCase()}. Aggiornati ${esc(ago(D.updated))}.</p>`;
}
function roundIt(r) {
  const s = String(r || "");
  const map = { "Final": "Finale", "Semifinal": "Semifinale", "Quarterfinal": "Quarti", "Round of 16": "Ottavi", "Round 1": "1° turno", "Round 2": "2° turno",
    "Round 3": "3° turno", "Round 4": "4° turno", "Qualifying Final": "Qualificazioni", "Qualifying 1st Round": "Qualificazioni", "Qualifying 2nd Round": "Qualificazioni",
    "Round Robin": "Girone", "1st Round": "1° turno", "2nd Round": "2° turno", "3rd Round": "3° turno", "4th Round": "4° turno",
    "Semifinals": "Semifinale", "Quarterfinals": "Quarti", "Finals": "Finale" };
  return map[s] || s.replace("Qualifying", "Qualificazioni");
}
