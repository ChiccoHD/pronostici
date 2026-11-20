"use strict";
/* Pronostici — classifiche dei campionati e pagina squadra.
   Dati in data/leagues/<campionato>.json (scritti dal workflow). Usa funzioni di app.js. */

const TABLE_LEAGUES = [["serie-a", "Serie A"], ["premier-league", "Premier"], ["la-liga", "LaLiga"], ["bundesliga", "Bundesliga"],
  ["ligue-1", "Ligue 1"], ["serie-b", "Serie B"], ["championship", "Championship"], ["eredivisie", "Eredivisie"], ["super-lig", "Süper Lig"],
  ["scozia", "Scozia"], ["belgio", "Belgio"], ["primeira-liga", "Portogallo"], ["eliteserien", "Norvegia"], ["mls", "MLS"], ["j1", "Giappone"], ["brasileirao", "Brasile"], ["argentina", "Argentina"], ["nba", "NBA"]];
const LEAGUE_DATA = new Map();
/* nazionali con classifica a gironi (file scritto dalla pipeline solo se la competizione è in corso) */
const NAT_TABLE_KEYS = ["nations-league", "qual-mondiali", "qual-mondiali-sudamerica", "qual-mondiali-concacaf", "qual-mondiali-asia",
  "qual-mondiali-africa", "qual-europei", "mondiali", "europei", "copa-america", "coppa-africa", "qual-coppa-africa", "coppa-asia",
  "gold-cup", "concacaf-nations"];
const natName = k => (LEAGUES.soccer.find(([x]) => x === k) || [k, k])[1];
/* quelle con partite in elenco e un file di classifica */
async function natTables() {
  const keys = NAT_TABLE_KEYS.filter(k => (INDEX?.events || []).some(e => e.league === k));
  const got = await Promise.all(keys.map(async k => [k, await leagueData(k)]));
  return got.filter(([, L]) => L?.table?.length).map(([k]) => [k, natName(k)]);
}

async function leagueData(key) {
  if (!LEAGUE_DATA.has(key)) LEAGUE_DATA.set(key, getJSON(`data/leagues/${encodeURIComponent(key)}.json`).catch(() => null));
  return LEAGUE_DATA.get(key);
}
const teamHref = (lk, id) => lk && id ? `#/squadra/${encodeURIComponent(lk)}/${encodeURIComponent(id)}` : "";
const backBtn = label => `<button class="back" onclick="history.length > 1 ? history.back() : location.hash='#/'">‹ ${esc(label)}</button>`;

/* ------------------------------------------------------------------ classifiche */

async function showStandings(key) {
  const nat = await natTables();
  const all = [...TABLE_LEAGUES, ["f1", "Formula 1"], ...nat];
  key = all.some(([k]) => k === key) ? key : load("table", "serie-a");
  if (!all.some(([k]) => k === key)) key = "serie-a";
  save("table", key);
  // scelta del campionato: pulsante con quello aperto + gli ultimi visti; tutti gli altri in una finestra con ricerca e gruppi
  let prev = [];
  try { prev = JSON.parse(localStorage.getItem("p_table_recent") || "[]"); } catch { prev = []; }
  const recent = [key, ...(Array.isArray(prev) ? prev : []).filter(k => k !== key && all.some(([x]) => x === k))].slice(0, 5);
  try { localStorage.setItem("p_table_recent", JSON.stringify(recent)); } catch { /* niente */ }
  const nameOf = k => (all.find(([x]) => x === k) || [k, k])[1];
  const chips = `<div class="tbl-pick"><button type="button" class="tbl-cur" id="tbl-open">${leagueMark(key)}<b>${esc(nameOf(key))}</b><span>Cambia ▾</span></button>
    <div class="leagues tbl-leagues tbl-recent" role="group" aria-label="Ultimi visti">${recent.slice(1).map(k =>
    `<a href="#/classifiche/${k}" class="chip-a">${leagueMark(k)}${esc(nameOf(k))}</a>`).join("")}</div></div>`;
  STD_ALL = all;
  $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Classifiche</h1>` + chips + `<p class="muted" style="padding:16px 4px">Caricamento…</p>`;
  $app.querySelector('.tbl-leagues [aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  const L = await leagueData(key);
  if (!location.hash.startsWith("#/classifiche")) return;
  if (key === "f1" && L?.drivers?.length) {
    $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Classifiche</h1>` + chips + f1Standings(L);
    wire("f1std");
    $app.querySelector('.tbl-leagues [aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
    return;
  }
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
  } else if (L.groups) {
    // nazionali: un riquadro per girone, niente pagina squadra
    body = L.groups.map(g => {
      const rows = L.table.filter(r => r.group === g);
      return sec(esc(g), `<div class="std nat"><div class="std-r head"><span>#</span><span>Squadra</span><span>G</span><span>DR</span><span>Pt</span></div>
        ${rows.map(r => `<div class="std-r"><span>${r.pos}</span><span class="std-t">${mark(r)}<b>${esc(r.name)}</b></span>
          <span>${r.p}</span><span>${r.gd > 0 ? "+" : ""}${r.gd}</span><span><b>${r.pts}</b></span></div>`).join("")}</div>`, "", `Classifica ${key} ${g}`);
    }).join("") + `<p class="note">Classifiche ufficiali dei gironi, da ESPN. G partite giocate, DR differenza reti.</p>`;
  } else {
    body = sec(L.name, `<div class="std"><div class="std-r head"><span>#</span><span>Squadra</span><span>G</span><span>DR</span><span>Pt</span><span>Forma</span></div>
      ${L.table.map(r => `<a class="std-r" href="${teamHref(key, r.id)}"><span>${r.pos}</span><span class="std-t">${mark(r)}<b>${esc(r.short || r.name)}</b></span>
        <span>${r.p}</span><span>${r.gd > 0 ? "+" : ""}${r.gd}</span><span><b>${r.pts}</b></span>${form(r.form)}</a>`).join("")}</div>`,
      `${L.table[0]?.p ?? 0} giornate`, `Classifica ${key}`)
      + `<p class="note">G partite giocate, DR differenza reti. Forma: ultime 5, la più recente a destra. La classifica è calcolata dai risultati: penalizzazioni e criteri di parità ufficiali possono cambiare qualche posizione.</p>`;
  }
  const rounds = L.rounds?.length ? roundsBox(key, L) : "";
  $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Classifiche</h1>` + chips + tabsView("std", [["tab", "Classifica", body + (L.groups ? "" : `<p class="note">Tocca una squadra per la sua pagina.</p>`)]].concat(rounds ? [["gio", "Giornate", rounds]] : []));
  if (rounds) { wire("std"); wireRounds(key, L); }
}

/* finestra con tutti i campionati: ricerca e gruppi (con tanti campionati la fila di bottoni diventava scomoda) */
let STD_ALL = [];
const STD_GROUPS = [["Italia", ["serie-a", "serie-b"]], ["Grandi campionati europei", ["premier-league", "la-liga", "bundesliga", "ligue-1"]],
  ["Altri campionati europei", ["championship", "eredivisie", "super-lig", "scozia", "belgio", "primeira-liga", "eliteserien"]],
  ["Americhe e Asia", ["mls", "brasileirao", "argentina", "j1"]], ["Basket", ["nba"]], ["Motori", ["f1"]]];
const STD_KW = { "serie-a": "italia calcio", "serie-b": "italia calcio cadetteria", "premier-league": "inghilterra england premier calcio", "championship": "inghilterra england calcio",
  "la-liga": "spagna liga calcio", "bundesliga": "germania calcio", "ligue-1": "francia calcio", "eredivisie": "olanda paesi bassi calcio", "super-lig": "turchia calcio",
  "scozia": "scozia premiership calcio", "belgio": "belgio pro league calcio", "primeira-liga": "portogallo calcio", "eliteserien": "norvegia calcio",
  "mls": "usa stati uniti america calcio", "j1": "giappone j league calcio", "brasileirao": "brasile serie a calcio", "argentina": "argentina liga profesional calcio",
  "nba": "basket pallacanestro usa", "f1": "formula 1 f1 motori auto piloti costruttori" };
function standingsSheet() {
  const nameOf = k => (STD_ALL.find(([x]) => x === k) || [k, k])[1];
  const known = new Set(STD_GROUPS.flatMap(([, ks]) => ks));
  const groups = [...STD_GROUPS.map(([g, ks]) => [g, ks.filter(k => STD_ALL.some(([x]) => x === k))]), ["Nazionali", STD_ALL.map(([k]) => k).filter(k => !known.has(k))]].filter(([, ks]) => ks.length);
  const cur = load("table", "");
  const { el, close } = openSheet(`<h3 class="sheet-t">Classifiche</h3>
    <input class="sheet-in" id="std-q" type="search" placeholder="Cerca campionato, paese o sport" autocomplete="off">
    <div class="std-list">${groups.map(([g, ks]) => `<div class="std-g" data-g><h4 class="av-h">${esc(g)}</h4><div class="std-gl">${ks.map(k =>
      `<a href="#/classifiche/${k}" class="std-item ${k === cur ? "on" : ""}" data-s="${esc(sfold(`${nameOf(k)} ${k} ${g} ${STD_KW[k] || "nazionali calcio"}`))}">${leagueMark(k)}<b>${esc(nameOf(k))}</b></a>`).join("")}</div></div>`).join("")}<p class="muted std-none" hidden>Nessun campionato trovato.</p></div>`, { label: "Scegli la classifica" });
  const q = el.querySelector("#std-q");
  q.oninput = () => { const v = sfold(q.value.trim());
    el.querySelectorAll(".std-item").forEach(a => a.hidden = v && !a.dataset.s.includes(v));
    el.querySelectorAll("[data-g]").forEach(g => g.hidden = ![...g.querySelectorAll(".std-item")].some(a => !a.hidden));
    el.querySelector(".std-none").hidden = [...el.querySelectorAll(".std-item")].some(a => !a.hidden); };
  el.querySelectorAll(".std-item").forEach(a => a.onclick = () => close());
}
document.addEventListener("click", e => { if (e.target.closest?.("#tbl-open")) standingsSheet(); });

/* giornate: risultati e partite in programma, una giornata alla volta (dal calendario ESPN della stagione) */
function roundsBox(key, L) {
  const R = L.rounds;
  const now = Date.now();
  const cur = R.find(r => r.m.some(m => m[3] == null && Date.parse(m[0]) > now - 3 * 3600e3)) || R[R.length - 1];
  return `<div class="rnd-nav"><button type="button" data-rnd="-1" aria-label="Giornata precedente">‹</button><b id="rnd-t"></b><button type="button" data-rnd="1" aria-label="Giornata successiva">›</button></div>
    <div id="rnd-box" data-cur="${R.indexOf(cur)}"></div>
    <a class="std-link" href="#/multipla/giornata" data-rs-from="${esc(key)}">🎯 Fai una schedina con questa giornata<span>›</span></a>
    <p class="note">Giornate ricostruite dal calendario della stagione: ogni partita sta nella prima giornata libera per entrambe le squadre, così i recuperi tornano al loro posto. Tocca una partita in programma per il pronostico.</p>`;
}
function wireRounds(key, L) {
  const box = document.getElementById("rnd-box");
  if (!box) return;
  const R = L.rounds, T = L.teams || {};
  const evs = new Set((INDEX?.events || []).map(e => e.id));
  const draw = i => {
    i = Math.max(0, Math.min(R.length - 1, i));
    box.dataset.cur = i;
    const r = R[i];
    document.getElementById("rnd-t").textContent = `Giornata ${r.n}`;
    const days = new Map();
    for (const m of [...r.m].sort((a, b) => a[0].localeCompare(b[0]))) { const k = isoDay(m[0]); if (!days.has(k)) days.set(k, []); days.get(k).push(m); }
    box.innerHTML = [...days].map(([d, ms]) => `<div class="rnd-day">${esc(new Date(d + "T12:00:00Z").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }))}</div>
      ${ms.map(([dt, h, a, hg, ag, id, hn, an]) => {
        const th = T[h] || {}, ta = T[a] || {}, played = hg != null, link = !played && evs.has(id) ? `#/e/${encodeURIComponent(id)}` : th.id ? teamHref(key, h) : null;
        const tm = (t, n) => `<span class="rnd-t">${t.logo ? img(t.logo, "tlogo") : ""}<b>${esc(t.short || n)}</b></span>`;
        return `<${link ? `a href="${link}"` : "div"} class="rnd-m ${played ? "done" : ""}">${tm(th, hn)}
          <span class="rnd-s">${played ? `<b class="${hg > ag ? "w" : ""}">${hg}</b>–<b class="${ag > hg ? "w" : ""}">${ag}</b>` : `<small>${fmtTime(dt)}</small>`}</span>${tm(ta, an)}</${link ? "a" : "div"}>`;
      }).join("")}`).join("");
  };
  document.querySelectorAll("[data-rnd]").forEach(b => b.onclick = () => draw(+box.dataset.cur + +b.dataset.rnd));
  document.querySelector("[data-rs-from]")?.addEventListener("click", () => { RS.league = key; RS.round = R[+box.dataset.cur]?.n ?? null; save("rs_league", key); });
  draw(+box.dataset.cur);
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
  // intestazione compatta: logo e nome affiancati sul colore della squadra, numeri in riquadri, azioni in una riga
  const tile = (v, l) => `<div class="tp-tile"><b>${v}</b><span>${l}</span></div>`;
  const tiles = nba
    ? tile(`${T.pos}<small>ª</small>`, `Conference ${esc(T.group)}`) + tile(`${T.record.w}-${T.record.l}`, "vinte-perse") + tile(num(S.pf, 1), "punti fatti") + tile(num(S.pa, 1), "punti subiti")
    : tile(`${T.pos}<small>ª</small>`, "in classifica") + tile(T.pts, "punti") + tile(`${S.w ?? 0}-${S.d ?? 0}-${S.l ?? 0}`, "V-N-P") + tile(`${num(S.gf, 1)}<small>/</small>${num(S.ga, 1)}`, "gol fatti/subiti");
  const ICON = { cls: '<path d="M5 20V10M12 20V4M19 20v-7"/>', cmp: '<path d="M12 4v16M5 8h14M7 8l-3 6h6zM17 8l-3 6h6z"/>' };
  const head = `<div class="board team-hero" style="--tc:${c}">
    <div class="tp-top"><div class="tp-logo">${T.logo ? img(T.logo, "") : `<span class="mono" style="background:${c};color:${onColor(c)}">${esc(initials(T.name))}</span>`}</div>
      <div class="tp-id"><span class="th-lg">${leagueMark(lk)}${esc(L.name)}</span><h1>${esc(T.name)}</h1>
        <div class="tp-form">${formSeq((T.form5?.seq || []).slice(0, 5))}<small>ultime 5</small></div></div></div>
    <div class="tp-tiles">${tiles}</div>
    <div class="tp-acts">${followBtn({ kind: "team", lk, id: T.id, name: T.name, short: T.short, logo: T.logo })}
      <a class="tp-act" href="#/classifiche/${encodeURIComponent(lk)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON.cls}</svg>Classifica</a>
      <a class="tp-act" href="#/confronta/${encodeURIComponent(`t:${lk}:${T.id}`)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON.cmp}</svg>Confronta</a></div>
  </div>`;

  // prossime partite (anche di coppa): dall'elenco delle partite in programma
  const next = INDEX.events.filter(e => teamPlays({ ...T, lk }, e));
  const upcoming = next.filter(e => !e.final), nextHtml = upcoming.length ? upcoming.map(e => `<section class="group">${fixture(e)}</section>`).join("") : `<p class="note">Nessuna partita nei prossimi giorni.</p>`;

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

  // la prossima partita subito sotto l'intestazione, il resto in schede (niente sezioni chiuse da aprire una a una)
  const first = upcoming[0];
  const nextBox = first ? `<div class="tp-next"><span class="tp-next-k">Prossima partita</span><section class="group">${fixture(first)}</section></div>` : "";
  const box = (inner, note = "") => `<section class="sec tp-pane">${inner}${note}</section>`;
  const tabs = [
    ["partite", "Partite", box(`${upcoming.length > 1 ? `<h3 class="lb-h3">In programma</h3>${upcoming.slice(1).map(e => `<section class="group">${fixture(e)}</section>`).join("")}` : ""}
      <h3 class="lb-h3">Ultime partite</h3>${last}`)],
    ["stagione", "Stagione", box(stats + (T.form10?.seq ? formChart(T.short || T.name, "", c, "transparent", T.form10.seq, []) : ""))],
    ["giocatori", "Giocatori", box(plHtml, nba ? `<p class="note">Medie a partita.</p>` : `<p class="note">In campionato.</p>`)],
  ];
  if (T.trends?.length) tabs.push(["tendenze", "Tendenze", box(trendsList(T.trends, nba ? "nba" : "soccer"), `<p class="note">Serie aperte nelle ultime partite. Prima o poi si interrompono: sono un'informazione, non un pronostico.</p>`)]);
  $app.innerHTML = backBtn("Indietro") + head + nextBox + tabsView("team", tabs)
    + `<p class="note">Dati aggiornati ${esc(ago(L.updated))}.</p>`;
  wire("team");
}

/* ------------------------------------------------------------------ squadre e giocatori preferiti */

/* una partita è della squadra seguita? Stesso nome, ma le squadre femminili sono un'altra squadra
   (es. Inter e Inter femminile): la Champions femminile vale solo per chi la segue da lì. */
const WOMEN_LEAGUES = new Set(["champions-femminile"]);
function teamPlays(t, e) {
  const ns = new Set([t.name, t.short].filter(Boolean));
  if (!ns.has(e.home) && !ns.has(e.away)) return false;
  return WOMEN_LEAGUES.has(e.league) === WOMEN_LEAGUES.has(t.lk);
}
function myTeams() { try { return JSON.parse(localStorage.getItem("p_myteams") || "[]"); } catch { return []; } }
function saveMyTeams(list) {
  try { localStorage.setItem("p_myteams", JSON.stringify(list)); } catch { /* niente */ }
  if (typeof notifySync === "function") notifySync();
}
const isMine = (lk, id) => myTeams().some(t => t.lk === lk && String(t.id) === String(id));
function toggleMine(item) {
  const list = myTeams(), had = list.some(t => t.lk === item.lk && String(t.id) === String(item.id));
  saveMyTeams(had ? list.filter(t => !(t.lk === item.lk && String(t.id) === String(item.id))) : [...list, item]);
  toast(had ? "Tolta dalle tue squadre" : "Aggiunta alle tue squadre: le sue partite le trovi in Tu");
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
  const photo = P.photo !== undefined ? P.photo : headshot("tennis", P.pid);
  const head = `<div class="board team-head"><span class="th-lg">${leagueMark(tour)}${tour.toUpperCase()}</span>
    <div class="th-logo">${photo ? `<span class="pl-ph">${img(photo, "pphoto")}${img(P.flag, "tflag")}</span>` : img(P.flag, "tflag big")}</div>
    <h1>${esc(P.name)}</h1><div class="th-sub">${[esc(P.country || ""), P.seed ? `testa di serie ${P.seed} nel torneo in corso` : ""].filter(Boolean).join(", ")}</div>
    <div class="th-sub">${P.year.w} vinte e ${P.year.l} perse quest'anno · Elo ${P.elo}</div>
    ${P.streak?.n >= 2 ? `<div class="th-sub"><b>${P.streak.res === "V" ? "Vince" : "Perde"} da ${P.streak.n} incontri</b></div>` : ""}
    <div class="th-form">${formSeq(P.last.slice(0, 10).map(x => x.res))}<small>ultimi 10, il più recente a sinistra</small></div>
    <div style="margin-top:10px">${followBtn({ kind: "player", lk: tour, id: P.name, name: P.name, short: lastName(P.name), logo: P.flag })}</div>
    <a class="th-link" href="#/confronta/${encodeURIComponent(`p:${tour}:${P.name}`)}">⚖️ Confronta con un altro tennista ›</a></div>`;
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

/* ------------------------------------------------------------------ classifica nella scheda della partita
   Le righe intorno alle due squadre (due sopra e due sotto ciascuna), evidenziate con il loro colore;
   il resto si apre con "Tutta la classifica". NBA: la conference di ciascuna squadra. */
async function matchTable(d) {
  if (!["soccer", "nba"].includes(d.sport) || !d.home?.id || !d.away?.id) return "";
  const natl = d.cup === "national";
  const lk = natl ? d.league : d.home.lk || d.league;
  if (natl ? !NAT_TABLE_KEYS.includes(lk) : (!lk || lk !== (d.away.lk || d.league) || !TABLE_LEAGUES.some(([k]) => k === lk))) return "";
  const L = await leagueData(lk);
  const tab = L?.table || [];
  const hi = { [d.home.id]: "home", [d.away.id]: "away" };
  if (!tab.some(r => hi[r.id])) return "";
  const nba = d.sport === "nba", grouped = nba || !!L.groups;
  const groups = grouped ? [...new Set(tab.filter(r => hi[r.id]).map(r => r.group))] : [null];
  const [cH, cA] = teamColors(d.home, d.away);
  const head = nba ? `<span>V</span><span>P</span><span>%</span>` : `<span>G</span><span>DR</span><span>Pt</span>`;
  const cells = r => nba ? `<span>${r.w}</span><span>${r.l}</span><span>${num(r.pct * 100, 0)}</span>`
    : `<span>${r.p}</span><span>${r.gd > 0 ? "+" : ""}${r.gd}</span><b>${r.pts}</b>`;
  const block = g => {
    const rows = tab.filter(r => !grouped || r.group === g);
    const keep = new Set();
    rows.forEach((r, i) => { if (hi[r.id]) for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < rows.length) keep.add(k); });
    if (!grouped) keep.add(0);                                     // la prima resta sempre in vista
    if (L.groups) rows.forEach((r, i) => keep.add(i));               // i gironi sono corti: tutti
    let out = "", last = -1;
    rows.forEach((r, i) => {
      if (!keep.has(i)) return;
      if (last >= 0 && i > last + 1) out += `<div class="mt-gap">⋯</div>`;
      last = i;
      const side = hi[r.id];
      const tag = natl ? "div" : "a";
      out += `<${tag} class="mt-row ${side ? "mt-" + side : ""}" ${natl ? "" : `href="${teamHref(lk, r.id)}"`} ${side ? `style="--tc:${side === "home" ? cH : cA}"` : ""}>
        <i>${r.pos}</i><span class="mt-n">${r.logo ? img(r.logo, "tlogo") : ""}${esc(nba ? r.name : r.short || r.name)}</span>${cells(r)}</${tag}>`;
    });
    if (last < rows.length - 1) out += `<div class="mt-gap">⋯ fino al ${rows.length}°</div>`;
    return `${nba ? `<div class="mt-grp">Conference ${esc(g)}</div>` : L.groups ? `<div class="mt-grp">${esc(g)}</div>` : ""}<div class="mt-row mt-head"><i>#</i><span class="mt-n">Squadra</span>${head}</div>${out}`;
  };
  const gap = (() => {
    if (nba || (L.groups && groups.length > 1)) return "";
    const h = tab.find(r => r.id === d.home.id), a = tab.find(r => r.id === d.away.id);
    if (!h || !a) return "";
    const diff = Math.abs(h.pts - a.pts), top = h.pts >= a.pts ? h : a;
    return diff ? `${esc(top.short || top.name)} è avanti di ${diff} ${diff === 1 ? "punto" : "punti"}` : "Sono appaiate";
  })();
  return sec(L.groups ? `Classifica del girone` : `Classifica ${esc(L.name || "")}`, `<div class="mtable">${groups.map(block).join("")}</div>
    <a class="mt-all" href="#/classifiche/${encodeURIComponent(lk)}">Tutta la classifica ›</a>`, gap, "Classifica");
}
