"use strict";
/* Pronostici — classifiche dei campionati e pagina squadra.
   Dati in data/leagues/<campionato>.json (scritti dal workflow). Usa funzioni di app.js. */

const TABLE_LEAGUES = [["serie-a", "Serie A"], ["premier-league", "Premier"], ["la-liga", "LaLiga"], ["bundesliga", "Bundesliga"],
  ["ligue-1", "Ligue 1"], ["primeira-liga", "Portogallo"], ["eliteserien", "Norvegia"], ["mls", "MLS"], ["j1", "Giappone"], ["nba", "NBA"]];
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
    `<a href="#/classifiche/${k}" class="chip-a" aria-pressed="${k === key}">${esc(l)}</a>`).join("")}</div>`;
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
  const posTxt = nba ? `${T.pos}ª nella Conference ${T.group}` : `${T.pos}ª in ${L.name}, ${T.pts} punti`;
  const head = `<div class="board team-head"><div class="th-logo">${T.logo ? img(T.logo, "") : `<span class="mono" style="background:${c};color:${onColor(c)}">${esc(initials(T.name))}</span>`}</div>
    <h1>${esc(T.name)}</h1><div class="th-sub">${esc(posTxt)}</div><div class="th-sub">${esc(rec)}</div>
    <div class="th-form">${formSeq((T.form5?.seq || []).slice(0, 5))}<small>ultime 5, la più recente a sinistra</small></div>
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
    + sec("Prossime partite", nextHtml, "", "Squadra prossime")
    + sec("Ultime partite", last, "", "Squadra ultime")
    + sec("In stagione", stats, "", "Squadra stagione")
    + sec(nba ? "Giocatori, medie a partita" : "Giocatori in stagione", plHtml, nba ? "" : "in campionato", "Squadra giocatori")
    + `<p class="note">Dati aggiornati ${esc(ago(L.updated))}.</p>`;
}
