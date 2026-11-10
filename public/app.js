"use strict";
/* Pronostici — web app statica. Legge i file in data/ generati da GitHub Actions. */

const $app = document.getElementById("app");
const TZ = "Europe/Rome";
const UPDATE_TIMES = "7:15, 10:45, 13:45, 16:45, 19:45 e 23:15 (con l'ora legale un'ora dopo)";
const SPORTS = [
  { key: "all", label: "Tutto" },
  { key: "soccer", label: "Calcio" },
  { key: "nba", label: "Basket" },
  { key: "tennis", label: "Tennis" },
];
const LEAGUES = {
  soccer: [["serie-a", "Serie A"], ["premier-league", "Premier"], ["la-liga", "LaLiga"], ["bundesliga", "Bundesliga"], ["ligue-1", "Ligue 1"]],
  tennis: [["atp", "ATP"], ["wta", "WTA"]],
};
const state = { sport: load("sport", "all"), league: load("league", "all"), tab: {}, formN: 5, side: "home" };
let INDEX = null, META = null, REL = null;

/* ------------------------------------------------------------------ utilità */

function load(k, d) { try { return localStorage.getItem("p_" + k) || d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem("p_" + k, v); } catch { /* niente */ } }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = p => p == null ? "–" : Math.round(p * 100) + "%";
const num = (x, d = 1) => x == null ? "–" : Number(x).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const odd = p => p > 0.005 ? (1 / p).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–";
const line = s => String(s).replace(".", ",");
const surfaceIt = s => ({ Hard: "Cemento", Clay: "Terra rossa", Grass: "Erba" }[s] || s || "");
const statusIt = s => ({ "Out": "Fuori", "Day-To-Day": "In dubbio", "Questionable": "In dubbio", "Doubtful": "Improbabile", "Probable": "Probabile" }[s] || s || "");
const lastName = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p.slice(1).join(" ") : p[0]; };

function fmtTime(iso, valid = true) {
  if (valid === false) return "orario da definire";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
function dayKey(iso) { return new Date(iso).toLocaleDateString("it-IT", { timeZone: TZ }); }
function fmtDay(iso) {
  const d = new Date(iso), key = dayKey(iso);
  const rel = key === dayKey(Date.now()) ? "oggi" : key === dayKey(Date.now() + 864e5) ? "domani" : "";
  const label = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1), rel };
}
function fmtShort(iso) { return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" }); }
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 2) return "adesso";
  if (m < 60) return `${m} min fa`;
  if (m < 48 * 60) return `${Math.round(m / 60)} ore fa`;
  return `${Math.round(m / 1440)} giorni fa`;
}

/* colori squadra: leggibili sulla carta, distinti tra le due squadre */
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const v = parseInt(m[1], 16), c = [v >> 16, (v >> 8) & 255, v & 255].map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
function usable(hex) { const l = lum(hex); return l != null && l < .62 && l > .01; }
function teamColors(a, b) {
  const pick = (c, alt) => usable(c) ? c : usable(alt) ? alt : null;
  let ca = pick(a?.color, a?.alt) || "#6d5a6b", cb = pick(b?.color, b?.alt) || "#a08a9e";
  if (ca.toLowerCase() === cb.toLowerCase()) cb = usable(b?.alt) && b.alt.toLowerCase() !== ca.toLowerCase() ? b.alt : "#a08a9e";
  return [ca, cb];
}
const onColor = hex => (lum(hex) ?? 0) > .36 ? "#20162b" : "#ffffff";
function initials(name) {
  const p = String(name || "").replace(/[^\p{L}\s'-]/gu, "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : (p[0]?.[1] || ""))).toUpperCase();
}
function avatar(name, color, badge) {
  const c = color || "#6d5a6b";
  return `<span class="ava" style="background:${c};color:${onColor(c)}" aria-hidden="true">${esc(initials(name))}${badge ? `<small>${esc(badge)}</small>` : ""}</span>`;
}

function img(src, cls, alt = "") {
  return src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.remove()">` : "";
}

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

/* ------------------------------------------------------------------ avvio e navigazione */

function measureHeader() {
  const h = document.querySelector(".top");
  if (h) document.documentElement.style.setProperty("--head", h.offsetHeight + "px");
}

async function boot() {
  measureHeader();
  window.addEventListener("resize", measureHeader);
  try {
    [INDEX, META] = await Promise.all([getJSON("data/index.json"), getJSON("data/meta.json")]);
  } catch {
    $app.innerHTML = `<div class="empty"><b>Ancora nessun dato</b>Il primo aggiornamento automatico creerà l'elenco delle partite.</div>`;
    return;
  }
  if (META.updated) {
    document.getElementById("updated").innerHTML = `<b>${esc(ago(META.updated))}</b>ultimo aggiornamento`;
  }
  if (META.sample) {
    document.getElementById("banner").innerHTML = `<div class="banner">Stai guardando dati di esempio inventati: l'aggiornamento automatico non è ancora partito.</div>`;
  }
  measureHeader();
  window.addEventListener("hashchange", route);
  route();
}

function route() {
  const [view, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const navKey = view === "affidabilita" ? "affidabilita" : view === "info" ? "info" : "home";
  document.querySelectorAll("[data-nav]").forEach(a => a.dataset.nav === navKey ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  window.scrollTo(0, 0);
  if (view === "e" && arg) return showEvent(decodeURIComponent(arg));
  if (view === "affidabilita") return showReliability();
  if (view === "info") return showInfo();
  showList();
}

/* ------------------------------------------------------------------ elenco */

function showList() {
  const evs = INDEX.events.filter(e => (state.sport === "all" || e.sport === state.sport) &&
    (state.league === "all" || e.league === state.league));
  const count = k => INDEX.events.filter(e => k === "all" || e.sport === k).length;
  let html = `<div class="filters"><div class="sports" role="group" aria-label="Sport">${SPORTS.map(s =>
    `<button data-sport="${s.key}" aria-pressed="${state.sport === s.key}">${s.label}<small>${count(s.key)} partite</small></button>`).join("")}</div>`;
  if (LEAGUES[state.sport]) {
    html += `<div class="leagues" role="group" aria-label="Campionato">${[["all", "Tutti"], ...LEAGUES[state.sport]].map(([k, l]) =>
      `<button data-league="${k}" aria-pressed="${state.league === k}">${l}</button>`).join("")}</div>`;
  }
  html += `</div>`;
  if (!evs.length) {
    const why = state.sport === "soccer" ? "Nei prossimi 10 giorni non ci sono partite di questi campionati: succede durante le soste per le nazionali." : "Nei prossimi giorni non ci sono partite in programma per questa scelta.";
    html += `<div class="empty"><b>Nessuna partita in programma</b>${why}</div>`;
  }
  let last = null;
  for (const e of evs) {
    const d = fmtDay(e.date);
    if (d.key !== last) { html += `<h2 class="day">${esc(d.label)}${d.rel ? `<span>${d.rel}</span>` : ""}</h2>`; last = d.key; }
    html += fixture(e);
  }
  $app.innerHTML = html;
  $app.querySelectorAll("[data-sport]").forEach(b => b.onclick = () => {
    state.sport = b.dataset.sport; state.league = "all"; save("sport", state.sport); save("league", "all"); showList();
  });
  $app.querySelectorAll("[data-league]").forEach(b => b.onclick = () => {
    state.league = b.dataset.league; save("league", state.league); showList();
  });
}

function splitBar(parts) {
  return `<div class="split" aria-hidden="true">${parts.map(([p, c]) =>
    `<i ${c ? `style="flex:${Math.max(p, .02)} 1 0;background:${c}"` : `class="mid" style="flex:${Math.max(p, .02)} 1 0"`}></i>`).join("")}</div>`;
}

function fixture(e) {
  const three = e.main.length === 3;
  const pH = e.main[0], pA = e.main[three ? 2 : 1], pD = three ? e.main[1] : null;
  const [cH, cA] = teamColors({ color: e.home_color }, { color: e.away_color });
  const max = Math.max(...e.main);
  const team = (name, p, c, cc, logo, flag) => `<div class="fx-team"><span class="stripe" style="background:${c}"></span>
    <span class="fx-name">${img(logo, "logo")}${img(flag, "flag", cc || "")}${esc(name)}${cc && !flag ? `<span class="cc">${esc(cc)}</span>` : ""}</span><span class="fx-p pct ${p === max ? "lead" : ""}">${pct(p)}</span></div>`;
  const foot = [];
  if (three) foot.push(`Pareggio <b>${pct(pD)}</b>`);
  for (const [k, v] of Object.entries(e.extra || {})) if (v != null) foot.push(`${esc(line(k))} <b>${pct(v)}</b>`);
  if (e.sport === "soccer" && e.xg) foot.push(`Gol attesi <b>${num(e.xg[0])}–${num(e.xg[1])}</b>`);
  if (e.sport === "nba" && e.exp_score) foot.push(`Punteggio atteso <b>${Math.round(e.exp_score[0])}–${Math.round(e.exp_score[1])}</b>`);
  if (e.book) {
    const gap = Math.max(...e.main.map((p, i) => Math.abs(p - (e.book[i] ?? p))));
    if (gap >= 0.07) foot.push(`<span class="flag-gap">Lontano dalle quote: ${Math.round(gap * 100)} punti</span>`);
  }
  const where = e.sport === "tennis" ? `${esc(e.league_name.replace(/^(ATP|WTA) · /, "$1 "))}${e.surface ? `, ${surfaceIt(e.surface).toLowerCase()}` : ""}` : esc(e.league_name);
  return `<a class="fx" href="#/e/${encodeURIComponent(e.id)}">
    <div class="fx-meta"><b>${where}</b><span>${fmtTime(e.date, e.time_valid)}</span></div>
    ${team(e.home, pH, cH, e.sport === "tennis" ? e.home_short : "", e.home_logo, e.home_flag)}
    ${team(e.away, pA, cA, e.sport === "tennis" ? e.away_short : "", e.away_logo, e.away_flag)}
    ${splitBar(three ? [[pH, cH], [pD, null], [pA, cA]] : [[pH, cH], [pA, cA]])}
    <div class="fx-foot">${foot.map(x => `<span>${x}</span>`).join("")}</div>
  </a>`;
}

/* ------------------------------------------------------------------ mattoncini delle schede */

function sec(title, inner, right = "") {
  return `<section class="sec"><h2>${title}${right ? `<small>${right}</small>` : ""}</h2>${inner}</section>`;
}

function picks(items, book) {
  const max = Math.max(...items.map(x => x[1] ?? 0));
  return `<div class="picks" style="--n:${items.length}">${items.map(([lab, p], i) => `
    <div class="pick ${p === max ? "lead" : ""}"><b class="pct">${pct(p)}</b><span>${esc(lab)}</span>
    <em>quota equa ${odd(p)}${book && book[i] != null ? `<br>quote: ${pct(book[i])}` : ""}</em></div>`).join("")}</div>`;
}

function rows(obj, { label = k => k, book = null } = {}) {
  return `<div class="rows">${Object.entries(obj).filter(([, v]) => v != null).map(([k, v]) => {
    const hot = v >= 0.6;
    return `<div class="r"><span class="l">${esc(label(k))}</span><span class="v pct ${hot ? "hot" : ""}">${pct(v)}</span>
      <span class="x"><span class="meter"><i style="width:${Math.round(v * 100)}%"></i></span>quota equa ${odd(v)}${book && book[k] != null ? ` · quote ${pct(book[k])}` : ""}</span></div>`;
  }).join("")}</div>`;
}

const formSeq = seq => `<span class="form">${(seq || []).map(r => `<span class="f ${r}" title="${{ V: "vittoria", N: "pareggio", P: "sconfitta" }[r]}">${r}</span>`).join("")}</span>`;

function vsTable(hName, aName, cH, cA, lines) {
  return `<table class="vs-table"><tr><th></th><th><span class="thead-dot" style="background:${cH}"></span>${esc(hName)}</th><th><span class="thead-dot" style="background:${cA}"></span>${esc(aName)}</th></tr>
    ${lines.map(([lab, h, a, better = "none", f = x => x ?? "–"]) => {
      const hb = better !== "none" && h != null && a != null && (better === "hi" ? h > a : h < a);
      const ab = better !== "none" && h != null && a != null && (better === "hi" ? a > h : a < h);
      return `<tr><td>${lab}</td><td class="${hb ? "best" : ""}">${f(h)}</td><td class="${ab ? "best" : ""}">${f(a)}</td></tr>`;
    }).join("")}</table>`;
}

function seg(name, opts, cur) {
  return `<span class="seg" role="group" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join("")}</span>`;
}

function board(d, { subH = "", subA = "", pH, pA, pD, bookTxt = "", cH, cA, extra = "" }) {
  const max = Math.max(pH, pA, pD ?? 0);
  const team = (t, sub, p, c) => `<div class="board-team"><span class="stripe" style="background:${c}"></span>
    <div class="board-id">${img(t.logo, "board-logo")}${img(t.flag, "board-flag")}<div><div class="board-name">${esc(t.name)}</div>${sub ? `<div class="board-sub">${sub}</div>` : ""}</div></div>
    <div class="board-p pct ${p === max ? "lead" : ""}">${pct(p)}<small>quota equa ${odd(p)}</small></div></div>`;
  const when = `${fmtDay(d.date).label}, ${fmtTime(d.date, d.time_valid)}`;
  return `<div class="board">
    <div class="board-meta"><span>${esc(d.league_name)}</span><span>${esc(when)}</span></div>
    ${team(d.home, subH, pH, cH)}
    ${team(d.away, subA, pA, cA)}
    ${splitBar(pD != null ? [[pH, cH], [pD, null], [pA, cA]] : [[pH, cH], [pA, cA]])}
    ${pD != null || bookTxt || extra ? `<div class="board-draw"><span>${pD != null ? `Pareggio <b class="pct">${pct(pD)}</b>` : extra}</span><span>${bookTxt}</span></div>` : ""}
  </div>`;
}

function tabsView(id, tabs) {
  const cur = state.tab[id] && tabs.some(t => t[0] === state.tab[id]) ? state.tab[id] : tabs[0][0];
  return `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === cur}">${l}</button>`).join("")}</div>
    ${tabs.map(([k, , body]) => `<div role="tabpanel" data-pane="${k}" ${k !== cur ? "hidden" : ""}>${body}</div>`).join("")}`;
}

function wire(id) {
  $app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
    state.tab[id] = b.dataset.tab;
    $app.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x === b));
    $app.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
    const brd = $app.querySelector(".board"), head = document.querySelector(".top").offsetHeight;
    const y = brd ? brd.getBoundingClientRect().bottom + window.scrollY - head : 0;
    if (window.scrollY > y) window.scrollTo(0, y);
  });
  $app.querySelectorAll("[data-seg]").forEach(g => g.querySelectorAll("button").forEach(b => b.onclick = () => {
    const name = g.dataset.seg;
    g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    $app.querySelectorAll(`[data-segpane^="${name}:"]`).forEach(p => p.hidden = p.dataset.segpane !== `${name}:${b.dataset.v}`);
  }));
}

function reliabilityBlock(g) {
  if (!g) return `<p class="note">Non ancora calcolata.</p>`;
  return `<p style="margin:0"><span class="grade g${g.level}">${esc(g.label)}</span>${esc(g.text)}</p>
    <p class="note">La verifica rifà le previsioni sulle partite già giocate. <a href="#/affidabilita" style="color:var(--rosa);font-weight:600">Vedi i dettagli</a></p>`;
}

async function showEvent(id) {
  const back = `<button class="back" onclick="history.length > 1 ? history.back() : location.hash='#/'">‹ Partite</button>`;
  $app.innerHTML = back + `<p class="muted">Caricamento…</p>`;
  let d;
  try { d = await getJSON(`data/events/${encodeURIComponent(id)}.json`); }
  catch { $app.innerHTML = back + `<div class="empty"><b>Partita non più disponibile</b>Torna all'elenco per vedere quelle in programma.</div>`; return; }
  const body = d.sport === "soccer" ? soccerView(d) : d.sport === "nba" ? nbaView(d) : tennisView(d);
  $app.innerHTML = back + body + `<p class="note">Dati aggiornati ${esc(ago(d.updated))}. Le percentuali sono stime statistiche, non certezze.</p>`;
  wire(d.sport);
}

/* ------------------------------------------------------------------ calcio */

function soccerView(d) {
  const m = d.markets, b = d.book || {}, H = d.home, A = d.away;
  const [cH, cA] = teamColors(H, A);
  const pos = t => t.pos ? `${t.pos}ª in classifica, ${t.pts} punti` : "";
  const bookTxt = b["1x2"] ? `Quote: ${b["1x2"].map(pct).join(" / ")}` : "";
  let s = board(d, { subH: pos(H), subA: pos(A), pH: m["1x2"][0], pD: m["1x2"][1], pA: m["1x2"][2], cH, cA, bookTxt });

  const esito = sec("Esito finale", picks([["1 " + H.short, m["1x2"][0]], ["X", m["1x2"][1]], ["2 " + A.short, m["1x2"][2]]], b["1x2"]), `gol attesi ${num(m.xg[0], 2)}–${num(m.xg[1], 2)}`)
    + sec("Doppia chance", rows(m.dc))
    + sec("Combo", rows(m.combo))
    + sec("Risultato esatto", rows(Object.fromEntries(m.exact.map(x => [x.score, x.p]))), "i 10 più probabili")
    + sec("Primo tempo", picks([["1", m.ht["1x2"][0]], ["X", m.ht["1x2"][1]], ["2", m.ht["1x2"][2]]]) + rows(m.ht.ou, { label: k => `Over ${line(k)} nel primo tempo` }));

  const ouBook = b.ou25 ? { "2.5": b.ou25[0] } : null;
  const gol = sec("Under / Over", rows(m.ou, { label: k => `Over ${line(k)}`, book: ouBook }))
    + sec("Goal / No Goal", rows({ "Goal, segnano entrambe": m.btts, "No Goal": 1 - m.btts }))
    + sec("Multigol", rows(m.multigol, { label: k => `Multigol ${k}` }))
    + sec(`Gol di ${esc(H.short)}`, rows({ ...Object.fromEntries(Object.entries(m.team_ou.home).map(([k, v]) => [`Over ${line(k)}`, v])), "Porta inviolata": m.clean_sheet[0] }))
    + sec(`Gol di ${esc(A.short)}`, rows({ ...Object.fromEntries(Object.entries(m.team_ou.away).map(([k, v]) => [`Over ${line(k)}`, v])), "Porta inviolata": m.clean_sheet[1] }))
    + (d.corners ? sec("Calci d'angolo", rows(d.corners.ou, { label: k => `Over ${line(k)}` }), `attesi ${num(d.corners.exp[2])}`) : "")
    + (d.cards ? sec("Cartellini gialli", rows(d.cards.ou, { label: k => `Over ${line(k)}` }), `attesi ${num(d.cards.exp[2])}`) : "");

  const forma = sec("Forma recente", soccerForm(d, cH, cA), seg("form", [[5, "5"], [10, "10"], [15, "15"]], 5))
    + sec("In stagione", soccerSplit(d, cH, cA))
    + sec("Testa a testa", h2hSoccer(d), d.h2h.n ? `ultime ${d.h2h.n}` : "")
    + sec("Ultime partite", lastSoccer(d));

  const gioc = sec("Giocatori", soccerPlayers(d, cH, cA), seg("pl", [["home", H.short], ["away", A.short]], "home"));

  s += tabsView("soccer", [["esito", "Esito", esito], ["gol", "Gol e angoli", gol], ["forma", "Forma", forma], ["gioc", "Giocatori", gioc],
    ["mod", "Affidabilità", sec("Quanto fidarsi", reliabilityBlock(d.reliability))]]);
  return s;
}

function soccerForm(d, cH, cA) {
  const H = d.form.home, A = d.form.away;
  const pair = (h, a) => h != null ? `${num(h)} / ${num(a)}` : null;
  return [5, 10, 15].map(n => {
    const h = H["form" + n], a = A["form" + n];
    return `<div data-segpane="form:${n}" ${n !== 5 ? "hidden" : ""}>${vsTable(d.home.short, d.away.short, cH, cA, [
      ["Risultati", formSeq(h.seq?.slice(0, 5)), formSeq(a.seq?.slice(0, 5))],
      ["Vinte, pari, perse", `${h.w}-${h.d}-${h.l}`, `${a.w}-${a.d}-${a.l}`],
      ["Punti", h.pts, a.pts, "hi"],
      ["Gol fatti a partita", h.gf, a.gf, "hi", x => num(x)],
      ["Gol subiti a partita", h.ga, a.ga, "lo", x => num(x)],
      ["Over 2,5", h.over25, a.over25, "none", pct],
      ["Goal", h.btts, a.btts, "none", pct],
      ["Porta inviolata", h.clean, a.clean, "hi", pct],
      ["Senza segnare", h.fail, a.fail, "lo", pct],
      ["Tiri / in porta", pair(h.shots_f, h.sot_f), pair(a.shots_f, a.sot_f)],
      ["Angoli fatti / subiti", pair(h.corners_f, h.corners_a), pair(a.corners_f, a.corners_a)],
      ["Gialli a partita", h.yellow_f, a.yellow_f, "none", x => num(x)],
      ...(h.xg_f != null ? [["Gol attesi fatti / subiti", pair(h.xg_f, h.xg_a), pair(a.xg_f, a.xg_a)]] : []),
    ])}</div>`;
  }).join("");
}

function soccerSplit(d, cH, cA) {
  const h = d.form.home.home_season, a = d.form.away.away_season;
  const r = d.home.rating, ra = d.away.rating;
  return vsTable(`${d.home.short} in casa`, `${d.away.short} fuori`, cH, cA, [
    ["Vinte, pari, perse", h.n ? `${h.w}-${h.d}-${h.l}` : null, a.n ? `${a.w}-${a.d}-${a.l}` : null],
    ["Gol fatti a partita", h.gf, a.gf, "hi", x => num(x)],
    ["Gol subiti a partita", h.ga, a.ga, "lo", x => num(x)],
    ["Over 2,5", h.n ? h.over25 : null, a.n ? a.over25 : null, "none", pct],
    ["Goal", h.n ? h.btts : null, a.n ? a.btts : null, "none", pct],
  ]) + (r ? `<p class="note">Forza stimata dal modello (100 è la media del campionato): attacco ${Math.round(r.att * 100)} contro ${ra ? Math.round(ra.att * 100) : "–"}, difesa ${Math.round(r.def * 100)} contro ${ra ? Math.round(ra.def * 100) : "–"}. In difesa, meno è meglio.</p>` : "");
}

function h2hSoccer(d) {
  const h = d.h2h;
  if (!h.n) return `<p class="note">Nessun precedente nelle ultime tre stagioni.</p>`;
  return picks([[d.home.short, h.a / h.n], ["Pareggi", h.d / h.n], [d.away.short, h.b / h.n]]).replace(/quota equa [^<]*/g, "")
    + `<div class="rows games">${h.games.map(g => `<div class="r"><span class="l">${fmtShort(g.date)}, ${esc(g.home)} – ${esc(g.away)}</span><span class="v num">${g.hg}-${g.ag}</span></div>`).join("")}</div>
    <p class="note">Over 2,5 nel ${pct(h.over25)} dei precedenti, Goal nel ${pct(h.btts)}.</p>`;
}

function lastSoccer(d) {
  const list = (t, name) => `<h3>${esc(name)}</h3><div class="rows games">${t.last.slice(0, 6).map(g =>
    `<div class="r"><span class="l">${fmtShort(g.date)}, ${g.home ? "in casa con" : "fuori con"} ${esc(g.opp)}</span><span class="v num"><span class="f ${g.res}">${g.res}</span> ${g.gf}-${g.ga}</span></div>`).join("")}</div>`;
  return list(d.form.home, d.home.name) + list(d.form.away, d.away.name);
}

function soccerPlayers(d, cH, cA) {
  const tbl = (list, c) => list.length ? `<div class="sp-row head"><span></span><span>Giocatore</span><span>Segna</span><span>Assist</span><span>Tiro in porta</span><span>Giallo</span></div>
    ${list.map(p => `<div class="sp-row">${avatar(p.name, c)}<span class="sp-name"><b>${esc(p.name)}</b><span>${esc(p.pos || "")} · ${p.tot.g} gol, ${p.tot.a} assist</span></span>
      <span class="v ${p.p_goal >= .4 ? "hot" : ""}">${pct(p.p_goal)}</span><span class="v">${pct(p.p_assist)}</span><span class="v">${pct(p.p_sot)}</span><span class="v">${pct(p.p_card)}</span></div>`).join("")}`
    : `<p class="note">I dati sui giocatori arrivano con i tabellini delle prime partite.</p>`;
  return `<div data-segpane="pl:home">${tbl(d.players.home, cH)}</div><div data-segpane="pl:away" hidden>${tbl(d.players.away, cA)}</div>
    <p class="note">Stime da presenze, titolarità e gol attesi della squadra in questa partita. Con le formazioni ufficiali possono cambiare parecchio.</p>`;
}

/* ------------------------------------------------------------------ NBA */

const PROP_NAME = { pts: "Punti", reb: "Rimbalzi", ast: "Assist", tpm: "Triple", pra: "P+R+A" };

function nbaView(d) {
  const m = d.markets, H = d.home, A = d.away, b = d.book || {};
  const [cH, cA] = teamColors(H, A);
  const sub = t => `${t.record.w} vinte, ${t.record.l} perse${t.b2b ? ", seconda sera di fila" : ""}`;
  const bookTxt = b.p_home ? `${esc(b.provider || "Quote")}: ${pct(b.p_home)} / ${pct(b.p_away)}` : "";
  let s = board(d, { subH: sub(H), subA: sub(A), pH: m.win[0], pA: m.win[1], cH, cA, bookTxt,
    extra: `Punteggio atteso <b class="num">${Math.round(m.exp[0])}–${Math.round(m.exp[1])}</b>` });

  const esito = sec("Vincente", picks([[H.short || H.name, m.win[0]], [A.short || A.name, m.win[1]]], b.p_home ? [b.p_home, b.p_away] : null))
    + sec("Handicap", rows(m.spreads, { label: k => `${H.short || "Casa"} ${line(k)}` }), `margine atteso ${m.margin > 0 ? "+" : ""}${num(m.margin)}`)
    + sec("Margine di vittoria", rows(Object.fromEntries(Object.entries(m.bands).map(([k, v]) =>
      [k.replace("casa", `${H.short || "Casa"} vince di`).replace("ospite", `${A.short || "Ospite"} vince di`), v]))));
  const punti = sec("Punti totali", rows(m.totals, { label: k => `Over ${line(k)}` }), `attesi ${num(m.total)}, linea ${line(m.total_line)}`)
    + sec(`Punti di ${esc(H.name)}`, rows(m.team_totals.home, { label: k => `Over ${line(k)}` }))
    + sec(`Punti di ${esc(A.name)}`, rows(m.team_totals.away, { label: k => `Over ${line(k)}` }));
  const forma = sec("Forma recente", nbaForm(d, cH, cA), seg("form", [[5, "5"], [10, "10"], [15, "15"]], 5))
    + sec("Testa a testa", nbaH2h(d), d.h2h.n ? `ultime ${d.h2h.n}` : "")
    + sec("Infortuni", injuries(d));
  const gioc = sec("Giocatori", nbaPlayers(d, cH, cA), seg("pl", [["home", H.short || "Casa"], ["away", A.short || "Ospite"]], "home"));
  s += tabsView("nba", [["esito", "Esito", esito], ["punti", "Punti", punti], ["gioc", "Giocatori", gioc], ["forma", "Forma", forma],
    ["mod", "Affidabilità", sec("Quanto fidarsi", reliabilityBlock(d.reliability))]]);
  return s;
}

function nbaForm(d, cH, cA) {
  const H = d.form.home, A = d.form.away;
  return [5, 10, 15].map(n => {
    const h = H["form" + n], a = A["form" + n];
    return `<div data-segpane="form:${n}" ${n !== 5 ? "hidden" : ""}>${vsTable(d.home.short, d.away.short, cH, cA, [
      ["Risultati", formSeq(h.seq?.slice(0, 5)), formSeq(a.seq?.slice(0, 5))],
      ["Vinte, perse", `${h.w ?? 0}-${h.l ?? 0}`, `${a.w ?? 0}-${a.l ?? 0}`],
      ["Punti fatti", h.pf, a.pf, "hi", x => num(x)],
      ["Punti subiti", h.pa, a.pa, "lo", x => num(x)],
      ["Totale medio", h.total, a.total, "none", x => num(x)],
    ])}</div>`;
  }).join("") + `<h3>In stagione</h3>` + vsTable(`${d.home.short} in casa`, `${d.away.short} fuori`, cH, cA, [
    ["Vinte, perse", `${d.form.home.home_season.w ?? 0}-${d.form.home.home_season.l ?? 0}`, `${d.form.away.away_season.w ?? 0}-${d.form.away.away_season.l ?? 0}`],
    ["Punti fatti", d.form.home.home_season.pf, d.form.away.away_season.pf, "hi", x => num(x)],
    ["Punti subiti", d.form.home.home_season.pa, d.form.away.away_season.pa, "lo", x => num(x)],
  ]);
}

function nbaH2h(d) {
  const h = d.h2h;
  if (!h.n) return `<p class="note">Nessun precedente nelle ultime due stagioni.</p>`;
  const nm = id => (d.names || {})[id] || id;
  return `<div class="rows"><div class="r"><span class="l">Vittorie ${esc(d.home.short)} – ${esc(d.away.short)}</span><span class="v">${h.a}–${h.b}</span></div>
    <div class="r"><span class="l">Punti totali in media</span><span class="v">${num(h.avg_total)}</span></div></div>
    <div class="rows games">${h.games.map(g => `<div class="r"><span class="l">${fmtShort(g.date)}, ${esc(nm(g.home))} – ${esc(nm(g.away))}</span><span class="v num">${g.hs}-${g.as}</span></div>`).join("")}</div>`;
}

function injuries(d) {
  const list = t => t.injuries.length ? `<div class="rows">${t.injuries.map(i =>
    `<div class="r"><span class="l">${esc(i.name)} <span class="faint">${esc(i.detail || "")}</span></span><span class="v" style="font-size:17px">${esc(statusIt(i.status))}</span></div>`).join("")}</div>`
    : `<p class="note">Nessun infortunio segnalato.</p>`;
  return `<h3 style="margin-top:0">${esc(d.home.name)}</h3>${list(d.home)}<h3>${esc(d.away.name)}</h3>${list(d.away)}`;
}

function nbaPlayers(d, cH, cA) {
  const block = (list, c) => list.length ? list.map(p => {
    const a = p.avg5 || {}, a10 = p.avg10 || {}, a15 = p.avg15 || {};
    const props = Object.entries(p.props || {}).map(([k, v]) => {
      const chips = Object.entries(v.p).map(([L, pr]) => `<span class="chip ${pr >= .6 ? "hot" : ""}">${L}+<b>${pct(pr)}</b></span>`).join("");
      return chips ? `<div class="line"><span>${PROP_NAME[k]}<br><b>${num(v.mean)}</b> attesi</span><div class="chips">${chips}</div></div>` : "";
    }).join("");
    const tag = p.out ? `<span class="p-tag out">Fuori</span>` : `<span class="p-tag">${p.status ? esc(statusIt(p.status)) + ", " : ""}${num(p.min_proj, 0)} minuti attesi</span>`;
    return `<div class="player">${avatar(p.name, c, p.pos)}<div>
      <div class="p-head"><span class="p-name">${esc(p.name)}</span>${tag}</div>
      <div class="p-avg" aria-label="Medie nelle ultime 5 partite">
        <div><b>${num(a.pts)}</b><span>punti</span></div><div><b>${num(a.reb)}</b><span>rimbalzi</span></div>
        <div><b>${num(a.ast)}</b><span>assist</span></div><div><b>${num(a.tpm)}</b><span>triple</span></div>
        <div><b>${a.fg_pct != null ? Math.round(a.fg_pct * 100) : "–"}</b><span>% al tiro</span></div></div>
      <div class="p-trend">Medie ultime 5. Ultime 10: ${num(a10.pts)} punti, ${num(a10.reb)} rimbalzi, ${num(a10.ast)} assist. Ultime 15: ${num(a15.pts)}, ${num(a15.reb)}, ${num(a15.ast)}.</div>
      ${p.out ? "" : `<div class="lines">${props}</div>`}</div></div>`;
  }).join("") : `<p class="note">Tabellini non ancora disponibili.</p>`;
  return `<div data-segpane="pl:home">${block(d.players.home, cH)}</div><div data-segpane="pl:away" hidden>${block(d.players.away, cA)}</div>
    <p class="note">Ogni riquadro è la probabilità di arrivare almeno a quella soglia, da minuti attesi, medie recenti e avversario.</p>`;
}

/* ------------------------------------------------------------------ tennis */

function tennisView(d) {
  const m = d.markets, P = d.players;
  const cH = "#8a6aa8", cA = "#a08a9e";
  const sub = p => [p.country || (p.cc ? p.cc.toUpperCase() : ""), p.rank ? `testa di serie ${p.rank}` : "", p.elo ? `Elo ${p.elo}` : ""].filter(Boolean).join(", ");
  d = { ...d, home: { ...d.home, flag: P.home.flag }, away: { ...d.away, flag: P.away.flag } };
  let s = board(d, { subH: sub(P.home), subA: sub(P.away), pH: m.win[0], pA: m.win[1], cH, cA,
    extra: `${esc(d.round || "")}${d.round ? ", " : ""}${surfaceIt(d.surface).toLowerCase()}, al meglio dei ${m.best_of} set` });
  if (d.low_data) s += `<div class="warn">Uno dei due giocatori ha pochi incontri nello storico: queste percentuali sono meno affidabili.</div>`;
  const ln = n => lastName(n);
  const esito = sec("Vincente", picks([[ln(d.home.name), m.win[0]], [ln(d.away.name), m.win[1]]]))
    + sec("Risultato in set", rows(Object.fromEntries(Object.entries(m.sets).map(([k, v]) => {
      const [a, b] = k.split("-").map(Number);
      return [`${a > b ? ln(d.home.name) : ln(d.away.name)} ${Math.max(a, b)}-${Math.min(a, b)}`, v];
    }))))
    + sec("Tie-break e set decisivo", rows({ "Almeno un tie-break": m.tiebreak, "Si arriva al set decisivo": m.deciding_set }));
  const game = sec("Game totali", rows(m.totals, { label: k => `Over ${line(k)}` }), `attesi ${num(m.exp_games)}`)
    + sec("Handicap game", rows(m.handicap, { label: k => `${ln(d.home.name)} ${line(k)}` }))
    + `<p class="note">Game di servizio tenuti, stima: ${ln(d.home.name)} ${pct(m.hold[0])}, ${ln(d.away.name)} ${pct(m.hold[1])}.</p>`;
  const gioc = sec("Confronto", tennisPlayers(d, cH, cA)) + sec("Testa a testa", tennisH2h(d), d.h2h.n ? `${d.h2h.a}–${d.h2h.b}` : "")
    + sec("Ultimi incontri", tennisLast(d));
  s += tabsView("tennis", [["esito", "Esito", esito], ["game", "Game", game], ["gioc", "Giocatori", gioc],
    ["mod", "Affidabilità", sec("Quanto fidarsi", reliabilityBlock(d.reliability))]]);
  return s;
}

function tennisPlayers(d, cH, cA) {
  const A = d.players.home, B = d.players.away;
  const rec = r => r ? `${r.w}-${r.l}` : "–";
  const surf = surfaceIt(d.surface).toLowerCase();
  return vsTable(lastName(d.home.name), lastName(d.away.name), cH, cA, [
    [`Elo su ${surf}`, A.elo, B.elo, "hi"],
    ["Ultimi 5", formSeq((A.form10?.seq || []).slice(0, 5)), formSeq((B.form10?.seq || []).slice(0, 5))],
    ["Ultimi 10, vinte-perse", A.form10 ? `${A.form10.w}-${A.form10.n - A.form10.w}` : null, B.form10 ? `${B.form10.w}-${B.form10.n - B.form10.w}` : null],
    ["Quest'anno", rec(A.year), rec(B.year)],
    [`Su ${surf}, 12 mesi`, rec(A.surface12m), rec(B.surface12m)],
    ["Set finiti al tie-break", A.tb_rate, B.tb_rate, "none", pct],
    ["Game medi (3 set)", A.avg_games_bo3, B.avg_games_bo3, "none", x => num(x)],
  ]);
}

function tennisH2h(d) {
  const h = d.h2h;
  if (!h.n) return `<p class="note">Nessun precedente negli ultimi due anni.</p>`;
  return `<div class="rows games">${h.games.map(g => `<div class="r"><span class="l">${fmtShort(g.date)}, ${esc(g.tournament)}, ${esc(surfaceIt(g.surface).toLowerCase())}<br>vince ${esc(g.winner)}</span><span class="v num" style="font-size:16px">${esc(g.score)}</span></div>`).join("")}</div>`;
}

function tennisLast(d) {
  const list = (p, name) => `<h3>${esc(name)}</h3>` + ((p.last || []).length ? `<div class="rows games">${p.last.slice(0, 6).map(g =>
    `<div class="r"><span class="l">${fmtShort(g.date)}, con ${esc(g.opp)} <span class="faint">${esc(surfaceIt(g.surface).toLowerCase())}</span></span><span class="v num" style="font-size:16px"><span class="f ${g.res}">${g.res}</span> ${esc(g.score)}</span></div>`).join("")}</div>`
    : `<p class="note">Nessun incontro nello storico.</p>`);
  return list(d.players.home, d.home.name) + list(d.players.away, d.away.name);
}

/* ------------------------------------------------------------------ affidabilità */

async function showReliability() {
  if (!REL) { try { REL = await getJSON("data/affidabilita.json"); } catch { REL = {}; } }
  const names = { "1x2": "esito 1X2", ou25: "Over/Under 2,5", win: "vincente", total: "Over/Under punti" };
  let html = sec("Quanto ci prende il modello", `<div class="prose">
    <p>Per ogni partita già giocata il modello rifà la previsione usando solo i dati disponibili prima del fischio d'inizio, poi la confronta con il risultato e, dove ci sono, con le quote dei bookmaker senza il loro margine.</p>
    <p>Nei grafici, se i punti stanno sulla diagonale le percentuali sono ben tarate: quando il modello dice 60%, l'evento accade circa 6 volte su 10. L'errore medio (Brier) più basso è il migliore.</p></div>`);
  const entries = Object.entries(REL);
  if (!entries.length) html += `<div class="empty"><b>Verifica non ancora disponibile</b>Compare dopo il primo aggiornamento dei dati.</div>`;
  for (const [, comp] of entries) {
    for (const [mk, s] of Object.entries(comp)) {
      if (mk === "name" || !s || !s.n) continue;
      html += sec(`${esc(comp.name)}, ${names[mk] || mk}`, `
        <p style="margin:0 0 6px"><span class="grade g${s.grade?.level ?? 0}">${esc(s.grade?.label || "")}</span>${esc(s.grade?.text || "")}</p>
        <div class="rows">
          <div class="r"><span class="l">Partite verificate</span><span class="v">${s.n}</span></div>
          <div class="r"><span class="l">Errore medio del modello</span><span class="v">${num(s.brier, 3)}</span></div>
          ${s.brier_book != null ? `<div class="r"><span class="l">Errore medio delle quote</span><span class="v">${num(s.brier_book, 3)}</span></div>` : ""}
          ${s.calib_error != null ? `<div class="r"><span class="l">Scarto di taratura</span><span class="v">${num(s.calib_error * 100, 1)} punti</span></div>` : ""}
        </div>${calibChart(s.calibration || [])}`);
    }
  }
  $app.innerHTML = html;
}

function calibChart(bins) {
  if (!bins.length) return "";
  const W = 320, H = 180, p = 30;
  const x = v => p + v * (W - p - 10), y = v => H - p - v * (H - p - 10);
  const pts = bins.map(b => `<circle class="pt" cx="${x(b.pred)}" cy="${y(b.real)}" r="${Math.min(7, 2.5 + Math.sqrt(b.n) / 6)}"><title>Previsto ${pct(b.pred)}, successo ${pct(b.real)} su ${b.n}</title></circle>`).join("");
  return `<svg class="calib" viewBox="0 0 ${W} ${H}" role="img" aria-label="Taratura: probabilità prevista contro frequenza reale">
    <line class="ax" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(0)}"/><line class="ax" x1="${x(0)}" y1="${y(0)}" x2="${x(0)}" y2="${y(1)}"/>
    <line class="diag" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}"/>${pts}
    <text x="${x(0)}" y="${H - 10}">0%</text><text x="${x(1) - 26}" y="${H - 10}">100%</text>
    <text x="${x(.5) - 22}" y="${H - 10}">previsto</text><text x="2" y="${y(1) + 4}">100%</text><text x="2" y="${y(.5)}">reale</text></svg>`;
}

/* ------------------------------------------------------------------ info */

function showInfo() {
  const st = META?.status || {};
  const label = { calcio: "Calcio", nba: "NBA", tennis: "Tennis" };
  const flat = (k, v) => Array.isArray(v) ? v.join(", ") : typeof v === "object" ? Object.entries(v).map(([a, b]) => `${a}: ${Array.isArray(b) ? b.join(", ") : b}`).join("; ") : v;
  const status = Object.entries(st).map(([sport, s]) => `<h3>${esc(label[sport] || sport)}${s.aggiornato ? `, ${esc(ago(s.aggiornato))}` : ""}</h3>` +
    Object.entries(s).filter(([k]) => k !== "aggiornato").map(([k, v]) => {
      const txt = String(flat(k, v));
      return `<div class="status-line"><span>${esc(k)}</span><span class="${/errore|non raggiungibile/i.test(txt) || k === "errore" ? "err" : ""}">${esc(txt)}</span></div>`;
    }).join("")).join("");
  $app.innerHTML = sec("Come funziona", `<div class="prose">
    <p>I dati si aggiornano da soli sei volte al giorno, verso le ${UPDATE_TIMES}. A volte GitHub ritarda di qualche decina di minuti.</p>
    <ul>
      <li><b>Calcio</b>: forza d'attacco e di difesa di ogni squadra, ricavata dalle ultime tre stagioni con più peso alle partite recenti. Da lì si calcola la probabilità di ogni risultato e quindi tutti i mercati.</li>
      <li><b>NBA</b>: valutazione di attacco e difesa in punti, fattore campo e stanchezza per le partite in due sere di fila. Le soglie dei giocatori partono da minuti attesi e medie recenti.</li>
      <li><b>Tennis</b>: punteggio Elo generale e per superficie, poi una simulazione punto per punto per game, set e tie-break.</li>
    </ul>
    <p>Fonti gratuite: risultati, statistiche, infortuni e quote NBA da ESPN; risultati, statistiche e quote del calcio da football-data.co.uk; gol attesi da Understat quando è online. Carattere Barlow con licenza SIL Open Font.</p>
    <p>Sono stime statistiche, non certezze, e battere le quote con costanza è molto difficile. Se il gioco smette di essere un divertimento, il Telefono Verde nazionale dell'Istituto Superiore di Sanità risponde all'800 558 822, gratis e in forma anonima.</p></div>`)
    + sec("Stato delle fonti", status || `<p class="note">Nessun aggiornamento ancora eseguito.</p>`, META?.updated ? esc(ago(META.updated)) : "");
}

boot();
