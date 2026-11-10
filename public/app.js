"use strict";
/* Pronostici — web app statica. Legge i file in data/ generati ogni giorno da GitHub Actions. */

const $app = document.getElementById("app");
const TZ = "Europe/Rome";
const SPORTS = [
  { key: "all", label: "Tutti" },
  { key: "soccer", label: "Calcio" },
  { key: "nba", label: "Basket" },
  { key: "tennis", label: "Tennis" },
];
const LEAGUES = {
  soccer: [["serie-a", "Serie A"], ["premier-league", "Premier"], ["la-liga", "LaLiga"], ["bundesliga", "Bundesliga"], ["ligue-1", "Ligue 1"]],
  tennis: [["atp", "ATP"], ["wta", "WTA"]],
};
const state = { sport: load("sport", "all"), league: load("league", "all"), formN: 5 };
let INDEX = null, META = null, REL = null;

function load(k, d) { try { return localStorage.getItem("p_" + k) || d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem("p_" + k, v); } catch { /* niente */ } }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = p => p == null ? "–" : Math.round(p * 100) + "%";
const num = (x, d = 1) => x == null ? "–" : Number(x).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const odd = p => p ? (1 / p).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–";
const line = s => String(s).replace(".", ",");

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
function fmtDay(iso) {
  const d = new Date(iso);
  const key = d.toLocaleDateString("it-IT", { timeZone: TZ });
  const today = new Date().toLocaleDateString("it-IT", { timeZone: TZ });
  const tom = new Date(Date.now() + 864e5).toLocaleDateString("it-IT", { timeZone: TZ });
  const label = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return { key, label: key === today ? "Oggi · " + label : key === tom ? "Domani · " + label : label };
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${m} min fa`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h fa`;
  return `${Math.round(m / 1440)} giorni fa`;
}

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function boot() {
  try {
    [INDEX, META] = await Promise.all([getJSON("data/index.json"), getJSON("data/meta.json")]);
  } catch {
    $app.innerHTML = `<div class="empty">Nessun dato ancora disponibile. Il primo aggiornamento automatico creerà l'elenco delle partite.</div>`;
    return;
  }
  document.getElementById("updated").textContent = META.updated ? "Aggiornato " + ago(META.updated) : "";
  if (META.sample) {
    document.getElementById("banner").innerHTML = `<div class="banner">Dati di esempio inventati: l'aggiornamento automatico non è ancora partito.</div>`;
  }
  window.addEventListener("hashchange", route);
  route();
}

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [view, arg] = h.split("/");
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on",
    (view === "affidabilita" && a.dataset.nav === "affidabilita") || (view === "info" && a.dataset.nav === "info") ||
    (!["affidabilita", "info"].includes(view) && a.dataset.nav === "home")));
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
  let html = `<div class="tabs" role="tablist">${SPORTS.map(s =>
    `<button class="tab ${state.sport === s.key ? "on" : ""}" data-sport="${s.key}" role="tab" aria-selected="${state.sport === s.key}">${s.label} <span class="faint">${countSport(s.key)}</span></button>`).join("")}</div>`;
  if (LEAGUES[state.sport]) {
    html += `<div class="tabs chips">${[["all", "Tutti"], ...LEAGUES[state.sport]].map(([k, l]) =>
      `<button class="tab ${state.league === k ? "on" : ""}" data-league="${k}">${l}</button>`).join("")}</div>`;
  }
  if (!evs.length) {
    html += `<div class="empty">Nessuna partita in programma per questa selezione nei prossimi giorni.</div>`;
  }
  let lastDay = null;
  for (const e of evs) {
    const d = fmtDay(e.date);
    if (d.key !== lastDay) { html += `<div class="day">${esc(d.label)}</div>`; lastDay = d.key; }
    html += evCard(e);
  }
  $app.innerHTML = html;
  $app.querySelectorAll("[data-sport]").forEach(b => b.onclick = () => {
    state.sport = b.dataset.sport; state.league = "all"; save("sport", state.sport); save("league", "all"); showList();
  });
  $app.querySelectorAll("[data-league]").forEach(b => b.onclick = () => {
    state.league = b.dataset.league; save("league", state.league); showList();
  });
}

function countSport(k) {
  return INDEX.events.filter(e => k === "all" || e.sport === k).length;
}

function logo(url, cls = "logo") { return url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">` : ""; }

function evCard(e) {
  const labels = e.main_labels;
  const segs = e.main.map((p, i) => {
    const lab = labels.length === 2 ? (p >= 0.3 ? (i === 0 ? short(e.home) : short(e.away)) : "") : labels[i];
    return `<div class="s${labels.length === 2 && i === 1 ? 2 : i}" style="flex:${Math.max(p, 0.08)}">${esc(lab)} ${pct(p)}</div>`;
  }).join("");
  const extras = Object.entries(e.extra || {}).filter(([, v]) => v != null)
    .map(([k, v]) => `<span class="pill">${esc(line(k))} ${pct(v)}</span>`).join("");
  let gap = "";
  if (e.book) {
    const diffs = e.main.map((p, i) => p - (e.book[i] ?? p));
    const mx = Math.max(...diffs.map(Math.abs));
    if (mx >= 0.07) gap = `<span class="pill warn">Scarto con le quote ${Math.round(mx * 100)} punti</span>`;
  }
  const right = e.sport === "soccer" ? `xG ${num(e.xg[0], 2)}` : e.sport === "nba" ? `${Math.round(e.exp_score[0])}` : (e.surface ? surfaceIt(e.surface) : "");
  const right2 = e.sport === "soccer" ? `${num(e.xg[1], 2)}` : e.sport === "nba" ? `${Math.round(e.exp_score[1])}` : "";
  return `<a class="ev" href="#/e/${encodeURIComponent(e.id)}">
    <div class="ev-top"><span>${esc(e.league_name)}</span><span>${e.time_valid === false ? "orario da definire" : fmtTime(e.date)}</span></div>
    <div class="ev-teams">
      <div>${logo(e.home_logo)}${esc(e.home)}</div><div class="xs">${esc(right)}</div>
      <div>${logo(e.away_logo)}${esc(e.away)}</div><div class="xs">${esc(right2)}</div>
    </div>
    <div class="seg">${segs}</div>
    <div class="ev-extra">${extras}${gap}</div>
  </a>`;
}

function short(name) {
  const parts = String(name).split(" ");
  return parts.length > 1 ? parts[parts.length - 1] : name;
}
const surfaceIt = s => ({ Hard: "Cemento", Clay: "Terra", Grass: "Erba" }[s] || s);

/* ------------------------------------------------------------------ scheda evento */

async function showEvent(id) {
  $app.innerHTML = `<button class="back" onclick="history.length > 1 ? history.back() : location.hash='#/'">‹ Partite</button><p class="muted">Caricamento…</p>`;
  let d;
  try { d = await getJSON(`data/events/${encodeURIComponent(id)}.json`); }
  catch { $app.innerHTML = `<button class="back" onclick="location.hash='#/'">‹ Partite</button><div class="empty">Questa partita non è più disponibile.</div>`; return; }
  const body = d.sport === "soccer" ? soccerView(d) : d.sport === "nba" ? nbaView(d) : tennisView(d);
  $app.innerHTML = `<button class="back" onclick="history.length > 1 ? history.back() : location.hash='#/'">‹ Partite</button>${body}
    <p class="note center">Aggiornato ${esc(ago(d.updated))}. Le percentuali sono stime statistiche, non certezze.</p>`;
  wireToggles(d);
}

function hero(d, subH, subA, meta) {
  return `<div class="hero">
    <div class="meta">${esc(d.league_name)} · ${esc(fmtDay(d.date).label)} · ${d.time_valid === false ? "orario da definire" : fmtTime(d.date)}</div>
    <div class="vs">
      <div class="t">${logo(d.home.logo)}${esc(d.home.name)}<div class="sub">${subH || ""}</div></div>
      <div class="mid">vs</div>
      <div class="t">${logo(d.away.logo)}${esc(d.away.name)}<div class="sub">${subA || ""}</div></div>
    </div>
    ${meta ? `<div class="meta">${meta}</div>` : ""}
  </div>`;
}

function bigs(items, book) {
  const best = Math.max(...items.map(x => x[1] ?? 0));
  return `<div class="grid${items.length}">${items.map(([lab, p], i) => `
    <div class="big ${p === best ? "best" : ""}"><b>${pct(p)}</b><span>${esc(lab)}</span>
    ${book && book[i] != null ? `<span class="cmp">quote ${pct(book[i])} · quota equa ${odd(p)}</span>` : `<span class="cmp">quota equa ${odd(p)}</span>`}</div>`).join("")}</div>`;
}

function rows(obj, { label = k => k, book = null, bar = true } = {}) {
  return Object.entries(obj).filter(([, v]) => v != null).map(([k, v]) => `
    <div class="row"><div class="l">${esc(label(k))}${bar ? `<div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>` : ""}</div>
    ${book && book[k] != null ? `<div class="bk">quote ${pct(book[k])}</div>` : ""}
    <div class="v num">${pct(v)}</div></div>`).join("");
}

function formSeq(seq) {
  return `<span class="form">${(seq || []).map(r => `<span class="f ${r}">${r}</span>`).join("")}</span>`;
}

function gradeBadge(g) {
  if (!g) return "";
  return `<span class="grade g${g.level}">${esc(g.label)}</span>`;
}

function card(title, inner, right = "") {
  return `<section class="card"><h2>${title}${right ? `<small>${right}</small>` : ""}</h2>${inner}</section>`;
}

function segCtl(name, opts, cur) {
  return `<span class="seg-ctl" data-ctl="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? "on" : ""}">${l}</button>`).join("")}</span>`;
}

function wireToggles(d) {
  $app.querySelectorAll("[data-ctl]").forEach(ctl => {
    ctl.querySelectorAll("button").forEach(b => b.onclick = () => {
      const name = ctl.dataset.ctl;
      ctl.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
      $app.querySelectorAll(`[data-pane^="${name}:"]`).forEach(p => p.hidden = p.dataset.pane !== `${name}:${b.dataset.v}`);
    });
  });
}

/* --------------------------------------------------------- calcio */

function soccerView(d) {
  const m = d.markets, b = d.book || {};
  const H = d.home, A = d.away;
  const subH = H.pos ? `${H.pos}º · ${H.pts} pt` : "";
  const subA = A.pos ? `${A.pos}º · ${A.pts} pt` : "";
  let s = hero(d, subH, subA, `Gol attesi ${num(m.xg[0], 2)} – ${num(m.xg[1], 2)}${d.venue ? " · " + esc(d.venue) : ""}`);

  s += card("Esito finale", bigs([["1 · " + H.short, m["1x2"][0]], ["X · pareggio", m["1x2"][1]], ["2 · " + A.short, m["1x2"][2]]], b["1x2"])
    + `<h3>Doppia chance</h3>${rows(m.dc)}`, b["1x2"] ? "modello e quote senza margine" : "");

  const ouBook = b.ou25 ? { "2.5": b.ou25[0] } : null;
  s += card("Gol", rows(m.ou, { label: k => "Over " + line(k), book: ouBook })
    + `<div class="row"><div class="l">Goal (entrambe segnano)<div class="bar"><i style="width:${Math.round(m.btts * 100)}%"></i></div></div><div class="v">${pct(m.btts)}</div></div>`
    + `<div class="row"><div class="l">No Goal</div><div class="v">${pct(1 - m.btts)}</div></div>`
    + `<h3>Multigol</h3>${rows(m.multigol, { label: k => "Multigol " + k })}`
    + `<h3>Gol di ${esc(H.short)}</h3>${rows(m.team_ou.home, { label: k => "Over " + line(k) })}`
    + `<div class="row"><div class="l">Porta inviolata</div><div class="v">${pct(m.clean_sheet[0])}</div></div>`
    + `<h3>Gol di ${esc(A.short)}</h3>${rows(m.team_ou.away, { label: k => "Over " + line(k) })}`
    + `<div class="row"><div class="l">Porta inviolata</div><div class="v">${pct(m.clean_sheet[1])}</div></div>`);

  s += card("Combo", rows(m.combo));
  s += card("Risultato esatto", rows(Object.fromEntries(m.exact.map(x => [x.score, x.p]))));
  s += card("Primo tempo", bigs([["1", m.ht["1x2"][0]], ["X", m.ht["1x2"][1]], ["2", m.ht["1x2"][2]]])
    + rows(m.ht.ou, { label: k => "Over " + line(k) + " primo tempo" }));

  if (d.corners) s += card("Calci d'angolo", rows(d.corners.ou, { label: k => "Over " + line(k) }),
    `attesi ${num(d.corners.exp[0])} + ${num(d.corners.exp[1])} = ${num(d.corners.exp[2])}`);
  if (d.cards) s += card("Cartellini gialli", rows(d.cards.ou, { label: k => "Over " + line(k) }),
    `attesi ${num(d.cards.exp[0])} + ${num(d.cards.exp[1])} = ${num(d.cards.exp[2])}`);

  s += card("Forma", soccerForm(d), segCtl("form", [[5, "5"], [10, "10"], [15, "15"]], 5));
  s += card("Rendimento in stagione", soccerSplit(d));
  s += card("Testa a testa", h2hSoccer(d), d.h2h.n ? `ultime ${d.h2h.n}` : "");
  s += card("Giocatori", soccerPlayers(d), segCtl("pl", [["home", esc(H.short)], ["away", esc(A.short)]], "home"));
  s += card("Affidabilità del modello", reliabilityLine(d.reliability, d.league));
  return s;
}

function soccerForm(d) {
  const H = d.form.home, A = d.form.away;
  return [5, 10, 15].map(n => {
    const h = H["form" + n], a = A["form" + n];
    const r = (lab, x, y, f = v => num(v), better = "hi") => {
      const hx = x != null && y != null && (better === "hi" ? x > y : x < y), ay = x != null && y != null && (better === "hi" ? y > x : y < x);
      return `<tr><td>${lab}</td><td class="${hx ? "hi" : ""}">${f(x)}</td><td class="${ay ? "hi" : ""}">${f(y)}</td></tr>`;
    };
    return `<div data-pane="form:${n}" ${n !== 5 ? "hidden" : ""}>
      <table class="cmp"><tr><th></th><th>${esc(d.home.short)}</th><th>${esc(d.away.short)}</th></tr>
      <tr><td>Risultati</td><td>${formSeq(h.seq?.slice(0, 5))}</td><td>${formSeq(a.seq?.slice(0, 5))}</td></tr>
      ${r("V-N-P", `${h.w}-${h.d}-${h.l}`, `${a.w}-${a.d}-${a.l}`, v => v, "none")}
      ${r("Punti", h.pts, a.pts, v => v ?? "–")}
      ${r("Gol fatti / partita", h.gf, a.gf)}
      ${r("Gol subiti / partita", h.ga, a.ga, v => num(v), "lo")}
      ${r("xG fatti / subiti", h.xg_f != null ? `${num(h.xg_f)} / ${num(h.xg_a)}` : null, a.xg_f != null ? `${num(a.xg_f)} / ${num(a.xg_a)}` : null, v => v ?? "–", "none")}
      ${r("Over 2,5", h.over25, a.over25, pct, "none")}
      ${r("Goal", h.btts, a.btts, pct, "none")}
      ${r("Porta inviolata", h.clean, a.clean, pct)}
      ${r("Senza segnare", h.fail, a.fail, pct, "lo")}
      ${r("Tiri / in porta", h.shots_f != null ? `${num(h.shots_f)} / ${num(h.sot_f)}` : null, a.shots_f != null ? `${num(a.shots_f)} / ${num(a.sot_f)}` : null, v => v ?? "–", "none")}
      ${r("Angoli fatti / subiti", h.corners_f != null ? `${num(h.corners_f)} / ${num(h.corners_a)}` : null, a.corners_f != null ? `${num(a.corners_f)} / ${num(a.corners_a)}` : null, v => v ?? "–", "none")}
      ${r("Gialli", h.yellow_f, a.yellow_f, v => num(v), "none")}
      </table></div>`;
  }).join("") + `<h3>Ultime partite</h3>${lastGamesSoccer(d)}`;
}

function lastGamesSoccer(d) {
  const side = (t, name) => t.last.slice(0, 6).map(g =>
    `<div class="row"><div class="l small">${fmtDate(g.date)} · ${g.home ? "casa" : "fuori"} vs ${esc(g.opp)}</div><div class="v num"><span class="f ${g.res}">${g.res}</span> ${g.gf}-${g.ga}</div></div>`).join("");
  return `<div class="grid2" style="grid-template-columns:1fr"><div><div class="small muted">${esc(d.home.short)}</div>${side(d.form.home)}</div>
    <div><div class="small muted" style="margin-top:8px">${esc(d.away.short)}</div>${side(d.form.away)}</div></div>`;
}

function soccerSplit(d) {
  const h = d.form.home.home_season, a = d.form.away.away_season;
  const fmt = x => x.n ? `${x.w}-${x.d}-${x.l} · ${num(x.gf)}–${num(x.ga)}` : "–";
  return `<table class="cmp"><tr><th></th><th>${esc(d.home.short)} in casa</th><th>${esc(d.away.short)} fuori</th></tr>
    <tr><td>V-N-P · gol</td><td>${fmt(h)}</td><td>${fmt(a)}</td></tr>
    <tr><td>Over 2,5</td><td>${h.n ? pct(h.over25) : "–"}</td><td>${a.n ? pct(a.over25) : "–"}</td></tr>
    <tr><td>Goal</td><td>${h.n ? pct(h.btts) : "–"}</td><td>${a.n ? pct(a.btts) : "–"}</td></tr></table>
    ${d.home.rating ? `<p class="note">Indice attacco/difesa del modello (100 = media del campionato, difesa sotto 100 = migliore): ${esc(d.home.short)} ${Math.round(d.home.rating.att * 100)}/${Math.round(d.home.rating.def * 100)}, ${esc(d.away.short)} ${d.away.rating ? Math.round(d.away.rating.att * 100) + "/" + Math.round(d.away.rating.def * 100) : "nuova"}.</p>` : ""}`;
}

function h2hSoccer(d) {
  const h = d.h2h;
  if (!h.n) return `<p class="muted small">Nessun precedente nelle ultime stagioni.</p>`;
  return bigs([[d.home.short, h.a / h.n], ["Pareggi", h.d / h.n], [d.away.short, h.b / h.n]]).replace(/quota equa [^<]*/g, "")
    + `<div class="row"><div class="l">Over 2,5 · Goal</div><div class="v">${pct(h.over25)} · ${pct(h.btts)}</div></div>`
    + h.games.map(g => `<div class="row"><div class="l small">${fmtDate(g.date)} · ${esc(g.home)} – ${esc(g.away)}</div><div class="v num">${g.hg}-${g.ag}</div></div>`).join("");
}

function soccerPlayers(d) {
  const tbl = list => list.length ? `<div class="scroll-x"><table class="players">
    <tr><th>Giocatore</th><th>Segna</th><th>Assist</th><th>Tiro in porta</th><th>Giallo</th><th>G/A stag.</th></tr>
    ${list.map(p => `<tr><td>${esc(p.name)}<span class="pos">${esc(p.pos || "")}</span></td><td>${pct(p.p_goal)}</td><td>${pct(p.p_assist)}</td>
      <td>${pct(p.p_sot)}</td><td>${pct(p.p_card)}</td><td>${p.tot.g}/${p.tot.a}</td></tr>`).join("")}</table></div>` : `<p class="muted small">Dati sui giocatori non ancora disponibili.</p>`;
  return `<div data-pane="pl:home">${tbl(d.players.home)}</div><div data-pane="pl:away" hidden>${tbl(d.players.away)}</div>
    <p class="note">Stime basate su presenze, titolarità e gol attesi della squadra in questa partita. Le formazioni ufficiali possono cambiarle molto.</p>`;
}

/* --------------------------------------------------------- NBA */

function nbaView(d) {
  const m = d.markets, H = d.home, A = d.away, b = d.book || {};
  const rec = t => `${t.record.w}-${t.record.l}${t.b2b ? " · 2ª sera di fila" : ""}`;
  let s = hero(d, rec(H), rec(A), `Punteggio atteso ${Math.round(m.exp[0])} – ${Math.round(m.exp[1])}`);
  s += card("Vincente", bigs([[H.short || H.name, m.win[0]], [A.short || A.name, m.win[1]]], b.p_home ? [b.p_home, b.p_away] : null),
    b.provider ? `quote ${esc(b.provider)}` : "");
  s += card("Punti totali", rows(m.totals, { label: k => "Over " + line(k) }), `attesi ${num(m.total)} · linea ${line(m.total_line)}`);
  s += card("Handicap", rows(m.spreads, { label: k => `${H.short || "Casa"} ${line(k)}` }), `margine atteso ${m.margin > 0 ? "+" : ""}${num(m.margin)}`);
  s += card("Punti per squadra", `<h3>${esc(H.name)}</h3>${rows(m.team_totals.home, { label: k => "Over " + line(k) })}
    <h3>${esc(A.name)}</h3>${rows(m.team_totals.away, { label: k => "Over " + line(k) })}`);
  s += card("Margine di vittoria", rows(Object.fromEntries(Object.entries(m.bands).map(([k, v]) =>
    [k.replace("casa", H.short || "Casa").replace("ospite", A.short || "Ospite"), v]))));
  s += card("Forma", nbaForm(d), segCtl("form", [[5, "5"], [10, "10"], [15, "15"]], 5));
  s += card("Testa a testa", nbaH2h(d), d.h2h.n ? `ultime ${d.h2h.n}` : "");
  s += card("Infortuni", injuries(d));
  s += card("Giocatori", nbaPlayers(d), segCtl("pl", [["home", esc(H.short || "Casa")], ["away", esc(A.short || "Ospite")]], "home"));
  s += card("Affidabilità del modello", reliabilityLine(d.reliability, "nba"));
  return s;
}

function nbaForm(d) {
  const H = d.form.home, A = d.form.away;
  return [5, 10, 15].map(n => {
    const h = H["form" + n], a = A["form" + n];
    return `<div data-pane="form:${n}" ${n !== 5 ? "hidden" : ""}><table class="cmp">
      <tr><th></th><th>${esc(d.home.short)}</th><th>${esc(d.away.short)}</th></tr>
      <tr><td>Risultati</td><td>${formSeq(h.seq?.slice(0, 5))}</td><td>${formSeq(a.seq?.slice(0, 5))}</td></tr>
      <tr><td>V-P</td><td>${h.w ?? 0}-${h.l ?? 0}</td><td>${a.w ?? 0}-${a.l ?? 0}</td></tr>
      <tr><td>Punti fatti</td><td class="${h.pf > a.pf ? "hi" : ""}">${num(h.pf)}</td><td class="${a.pf > h.pf ? "hi" : ""}">${num(a.pf)}</td></tr>
      <tr><td>Punti subiti</td><td class="${h.pa < a.pa ? "hi" : ""}">${num(h.pa)}</td><td class="${a.pa < h.pa ? "hi" : ""}">${num(a.pa)}</td></tr>
      <tr><td>Totale medio</td><td>${num(h.total)}</td><td>${num(a.total)}</td></tr></table></div>`;
  }).join("") + `<table class="cmp" style="margin-top:8px"><tr><th>Stagione</th><th>${esc(d.home.short)} in casa</th><th>${esc(d.away.short)} fuori</th></tr>
    <tr><td>V-P</td><td>${d.form.home.home_season.w ?? 0}-${d.form.home.home_season.l ?? 0}</td><td>${d.form.away.away_season.w ?? 0}-${d.form.away.away_season.l ?? 0}</td></tr>
    <tr><td>Punti fatti–subiti</td><td>${num(d.form.home.home_season.pf)}–${num(d.form.home.home_season.pa)}</td><td>${num(d.form.away.away_season.pf)}–${num(d.form.away.away_season.pa)}</td></tr></table>`;
}

function nbaH2h(d) {
  const h = d.h2h;
  if (!h.n) return `<p class="muted small">Nessun precedente nelle ultime due stagioni.</p>`;
  const nm = id => (d.names || {})[id] || id;
  return `<div class="row"><div class="l">Vittorie ${esc(d.home.short)} – ${esc(d.away.short)}</div><div class="v">${h.a} – ${h.b}</div></div>
    <div class="row"><div class="l">Totale medio</div><div class="v">${num(h.avg_total)}</div></div>`
    + h.games.map(g => `<div class="row"><div class="l small">${fmtDate(g.date)} · ${esc(nm(g.home))} – ${esc(nm(g.away))}</div><div class="v num">${g.hs}-${g.as}</div></div>`).join("");
}

function injuries(d) {
  const list = (t) => t.injuries.length ? t.injuries.map(i =>
    `<div class="row"><div class="l">${esc(i.name)} <span class="faint small">${esc(i.detail || "")}</span></div><div class="v small">${esc(statusIt(i.status))}</div></div>`).join("")
    : `<p class="muted small">Nessun infortunio segnalato.</p>`;
  return `<h3 style="margin-top:0">${esc(d.home.name)}</h3>${list(d.home)}<h3>${esc(d.away.name)}</h3>${list(d.away)}`;
}
const statusIt = s => ({ "Out": "Fuori", "Day-To-Day": "In dubbio", "Questionable": "In dubbio", "Doubtful": "Improbabile", "Probable": "Probabile" }[s] || s || "");

const PROP_NAME = { pts: "Punti", reb: "Rimbalzi", ast: "Assist", tpm: "Triple", pra: "Punti+Rimb+Ast" };

function nbaPlayers(d) {
  const block = list => list.length ? list.map(p => {
    const a = p.avg5 || {}, a10 = p.avg10 || {}, a15 = p.avg15 || {};
    const props = Object.entries(p.props || {}).map(([k, v]) => {
      const chips = Object.entries(v.p).map(([L, pr]) => `<span class="prop ${pr >= 0.6 ? "hi" : ""}">${L}+ <b>${pct(pr)}</b></span>`).join("");
      return chips ? `<div class="small muted" style="margin:6px 0 3px">${PROP_NAME[k]} · attesi ${num(v.mean)}</div><div class="props">${chips}</div>` : "";
    }).join("");
    return `<div class="pcard"><div class="nm"><span>${esc(p.name)} <span class="faint small">${esc(p.pos || "")}</span></span>
      <span class="small ${p.out ? "" : "muted"}">${p.status ? esc(statusIt(p.status)) + " · " : ""}${num(p.min_proj, 0)} min attesi</span></div>
      <div class="avg">Ultime 5: ${num(a.pts)} pt · ${num(a.reb)} rimb · ${num(a.ast)} ast · ${num(a.tpm)} triple${a.fg_pct != null ? " · " + pct(a.fg_pct) + " dal campo" : ""}<br>
      Ultime 10: ${num(a10.pts)} · ${num(a10.reb)} · ${num(a10.ast)} — ultime 15: ${num(a15.pts)} · ${num(a15.reb)} · ${num(a15.ast)}</div>
      ${p.out ? `<p class="small muted">Fuori per questa partita.</p>` : props}</div>`;
  }).join("") : `<p class="muted small">Tabellini non ancora disponibili.</p>`;
  return `<div data-pane="pl:home">${block(d.players.home)}</div><div data-pane="pl:away" hidden>${block(d.players.away)}</div>
    <p class="note">Probabilità di raggiungere almeno quella soglia, da minuti attesi, medie recenti e avversario.</p>`;
}

/* --------------------------------------------------------- tennis */

function tennisView(d) {
  const m = d.markets, P = d.players;
  const sub = p => [p.rank ? `n. ${p.rank}` : "", p.elo ? `Elo ${p.elo}` : ""].filter(Boolean).join(" · ");
  let s = hero(d, sub(P.home), sub(P.away), `${esc(d.round || "")}${d.round ? " · " : ""}${surfaceIt(d.surface)} · al meglio dei ${m.best_of} set`);
  if (d.low_data) s += `<div class="warnbox">Uno dei due giocatori ha pochi incontri nei dati: le percentuali sono meno affidabili.</div>`;
  s += card("Vincente", bigs([[short(d.home.name), m.win[0]], [short(d.away.name), m.win[1]]]));
  s += card("Risultato in set", rows(Object.fromEntries(Object.entries(m.sets).map(([k, v]) => {
    const [a, b] = k.split("-").map(Number);
    return [`${a > b ? short(d.home.name) : short(d.away.name)} ${Math.max(a, b)}-${Math.min(a, b)}`, v];
  }))));
  s += card("Game totali", rows(m.totals, { label: k => "Over " + line(k) }), `attesi ${num(m.exp_games)}`);
  s += card("Handicap game", rows(m.handicap, { label: k => `${short(d.home.name)} ${line(k)}` }));
  s += card("Tie-break e set decisivo", `<div class="row"><div class="l">Almeno un tie-break</div><div class="v">${pct(m.tiebreak)}</div></div>
    <div class="row"><div class="l">Si arriva al set decisivo</div><div class="v">${pct(m.deciding_set)}</div></div>
    <div class="row"><div class="l">Game di servizio tenuti (stima)</div><div class="v">${pct(m.hold[0])} · ${pct(m.hold[1])}</div></div>`);
  s += card("Giocatori", tennisPlayers(d));
  s += card("Testa a testa", tennisH2h(d), d.h2h.n ? `${d.h2h.a} – ${d.h2h.b}` : "");
  s += card("Affidabilità del modello", reliabilityLine(d.reliability, d.league));
  return s;
}

function tennisPlayers(d) {
  const A = d.players.home, B = d.players.away;
  const rec = r => r ? `${r.w}-${r.l}` : "–";
  const tbl = `<table class="cmp"><tr><th></th><th>${esc(short(d.home.name))}</th><th>${esc(short(d.away.name))}</th></tr>
    <tr><td>Classifica</td><td>${A.rank ?? "–"}</td><td>${B.rank ?? "–"}</td></tr>
    <tr><td>Elo su ${surfaceIt(d.surface).toLowerCase()}</td><td class="${A.elo > B.elo ? "hi" : ""}">${A.elo ?? "–"}</td><td class="${B.elo > A.elo ? "hi" : ""}">${B.elo ?? "–"}</td></tr>
    <tr><td>Ultime 10</td><td>${formSeq((A.form10?.seq || []).slice(0, 5))}</td><td>${formSeq((B.form10?.seq || []).slice(0, 5))}</td></tr>
    <tr><td>V-P ultime 10</td><td>${A.form10 ? `${A.form10.w}-${A.form10.n - A.form10.w}` : "–"}</td><td>${B.form10 ? `${B.form10.w}-${B.form10.n - B.form10.w}` : "–"}</td></tr>
    <tr><td>Anno in corso</td><td>${rec(A.year)}</td><td>${rec(B.year)}</td></tr>
    <tr><td>Su ${surfaceIt(d.surface).toLowerCase()}, 12 mesi</td><td>${rec(A.surface12m)}</td><td>${rec(B.surface12m)}</td></tr>
    <tr><td>Set al tie-break</td><td>${pct(A.tb_rate)}</td><td>${pct(B.tb_rate)}</td></tr>
    <tr><td>Game medi (3 set)</td><td>${num(A.avg_games_bo3)}</td><td>${num(B.avg_games_bo3)}</td></tr></table>`;
  const last = (p, name) => (p.last || []).slice(0, 5).map(g =>
    `<div class="row"><div class="l small">${fmtDate(g.date)} · vs ${esc(g.opp)} <span class="faint">${esc(surfaceIt(g.surface))}</span></div><div class="v small num"><span class="f ${g.res}">${g.res}</span> ${esc(g.score)}</div></div>`).join("");
  return tbl + `<h3>Ultimi incontri · ${esc(short(d.home.name))}</h3>${last(A) || '<p class="muted small">Nessun dato.</p>'}
    <h3>Ultimi incontri · ${esc(short(d.away.name))}</h3>${last(B) || '<p class="muted small">Nessun dato.</p>'}`;
}

function tennisH2h(d) {
  const h = d.h2h;
  if (!h.n) return `<p class="muted small">Nessun precedente negli ultimi tre anni.</p>`;
  return h.games.map(g => `<div class="row"><div class="l small">${fmtDate(g.date)} · ${esc(g.tournament)} · ${esc(surfaceIt(g.surface))}<br>vince ${esc(g.winner)}</div><div class="v small num">${esc(g.score)}</div></div>`).join("");
}

/* ------------------------------------------------------------------ affidabilità */

function reliabilityLine(g, key) {
  if (!g) return `<p class="muted small">Non ancora calcolata.</p>`;
  return `<p style="margin:0">${gradeBadge(g)} <span class="small">${esc(g.text)}</span></p>
    <p class="note"><a href="#/affidabilita" style="color:var(--accent)">Come è stata misurata</a></p>`;
}

async function showReliability() {
  if (!REL) { try { REL = await getJSON("data/affidabilita.json"); } catch { REL = {}; } }
  const names = { "1x2": "Esito 1X2", ou25: "Over/Under 2,5", win: "Vincente", total: "Over/Under punti (sulla linea delle quote)" };
  let html = `<section class="card prose"><h2>Come si misura</h2>
    <p>Per ogni partita già giocata il modello rifà la previsione usando solo i dati disponibili prima del fischio d'inizio, poi la confronta con il risultato vero e con le quote dei bookmaker (senza il loro margine).</p>
    <p>Il grafico mostra la taratura: se i punti stanno sulla diagonale, quando il modello dice 60% l'evento accade davvero circa 6 volte su 10. Il punteggio di Brier è l'errore medio: più basso è, meglio è.</p></section>`;
  const entries = Object.entries(REL);
  if (!entries.length) html += `<div class="empty">La verifica comparirà dopo il primo aggiornamento.</div>`;
  for (const [key, comp] of entries) {
    for (const [mk, s] of Object.entries(comp)) {
      if (mk === "name" || !s || !s.n) continue;
      html += card(`${esc(comp.name)} · ${names[mk] || mk}`, `
        <p style="margin:0 0 6px">${gradeBadge(s.grade)} <span class="small">${esc(s.grade?.text || "")}</span></p>
        <div class="row"><div class="l">Partite verificate</div><div class="v">${s.n}</div></div>
        <div class="row"><div class="l">Errore (Brier) modello</div><div class="v num">${num(s.brier, 3)}</div></div>
        ${s.brier_book != null ? `<div class="row"><div class="l">Errore (Brier) quote</div><div class="v num">${num(s.brier_book, 3)}</div></div>` : ""}
        ${s.calib_error != null ? `<div class="row"><div class="l">Scarto medio di taratura</div><div class="v num">${num(s.calib_error * 100, 1)} punti</div></div>` : ""}
        ${calibChart(s.calibration || [])}`);
    }
  }
  $app.innerHTML = html;
}

function calibChart(bins) {
  if (!bins.length) return "";
  const W = 300, Hh = 170, p = 26;
  const x = v => p + v * (W - p - 8), y = v => Hh - p - v * (Hh - p - 8);
  const pts = bins.map(b => `<circle class="pt" cx="${x(b.pred)}" cy="${y(b.real)}" r="${Math.min(7, 2.5 + Math.sqrt(b.n) / 6)}"><title>Previsto ${pct(b.pred)}, accaduto ${pct(b.real)} (${b.n})</title></circle>`).join("");
  return `<svg class="calib" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Taratura: probabilità prevista contro frequenza reale">
    <line class="ax" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(0)}"/><line class="ax" x1="${x(0)}" y1="${y(0)}" x2="${x(0)}" y2="${y(1)}"/>
    <line class="diag" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}"/>${pts}
    <text x="${x(0)}" y="${Hh - 8}">0%</text><text x="${x(1) - 22}" y="${Hh - 8}">100%</text>
    <text x="${x(0.5) - 26}" y="${Hh - 8}">previsto</text><text x="2" y="${y(1) + 4}">100%</text><text x="2" y="${y(0.5)}">reale</text></svg>`;
}

/* ------------------------------------------------------------------ info */

function showInfo() {
  const st = META?.status || {};
  const statusRows = Object.entries(st).map(([sport, s]) => {
    const parts = Object.entries(s).filter(([k]) => k !== "aggiornato").map(([k, v]) =>
      typeof v === "object" && !Array.isArray(v) ? `<div class="small"><b>${esc(k)}</b>: ${esc(Object.entries(v).map(([a, b]) => `${a} ${Array.isArray(b) ? b.join(", ") : b}`).join(" · "))}</div>`
        : `<div class="small"><b>${esc(k)}</b>: ${esc(Array.isArray(v) ? v.join(", ") : v)}</div>`).join("");
    return `<h3>${esc(sport)}${s.aggiornato ? ` · ${esc(ago(s.aggiornato))}` : ""}</h3>${parts}`;
  }).join("");
  $app.innerHTML = `<section class="card prose"><h2>Come funziona</h2>
    <p>Ogni giorno un processo automatico scarica risultati, statistiche e quote, ricalcola i modelli e aggiorna queste pagine.</p>
    <ul>
      <li><b>Calcio</b>: forza d'attacco e difesa di ogni squadra dalle ultime stagioni (le partite recenti pesano di più, con gli xG quando disponibili). Da lì si ottiene la probabilità di ogni punteggio e quindi 1X2, Over/Under, Goal, multigol, combo e risultati esatti.</li>
      <li><b>NBA</b>: rating di attacco e difesa in punti, fattore campo e partite in due sere consecutive. Soglie dei giocatori da minuti attesi, medie recenti e avversario.</li>
      <li><b>Tennis</b>: Elo generale e per superficie, poi una simulazione esatta punto per punto per game, set e tie-break.</li>
    </ul>
    <p>Fonti gratuite: ESPN, football-data.co.uk e Understat (quando è online). Le fonti non ufficiali possono cambiare senza preavviso: in quel caso qui sotto compare l'errore.</p>
    <p><b>Attenzione</b>: sono stime statistiche, non certezze. Battere le quote con costanza è molto difficile. Se il gioco diventa un problema, il Telefono Verde nazionale dell'Istituto Superiore di Sanità è l'800 558 822 (gratuito e anonimo).</p>
    </section>
    <section class="card"><h2>Stato delle fonti<small>${META?.updated ? esc(ago(META.updated)) : ""}</small></h2>${statusRows || '<p class="muted small">Nessun aggiornamento ancora eseguito.</p>'}</section>`;
}

boot();
