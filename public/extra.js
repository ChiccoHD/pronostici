"use strict";
/* Novità di fine novembre 2026: Sfida il modello, numero sull'icona, La tua settimana, simulatore della schedina,
   calendario delle squadre seguite. Grafico della probabilità e "momento della partita" stanno in live.js. */

/* ------------------------------------------------------------------ Sfida il modello */
/* Nella scheda della partita scegli il tuo 1X2 (o 1/2) prima del via; quando finisce si confronta con il modello
   (la scelta più probabile prima del via). Tutto resta sul telefono, in p_duel. */
function duels() { try { return JSON.parse(localStorage.getItem("p_duel") || "{}"); } catch { return {}; } }
function saveDuels(o) {
  const lim = Date.now() - 400 * 864e5;
  try { localStorage.setItem("p_duel", JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, x]) => Date.parse(x.date) > lim)))); } catch { /* niente */ }
}
const duelLabels = n => n === 3 ? ["1", "X", "2"] : ["1", "2"];
/* esito delle sfide aperte: dall'elenco, dagli esiti visti dal telefono o dall'archivio */
function duelResolve() {
  const all = duels(); let ch = false;
  const fin = typeof phoneFinals === "function" ? phoneFinals() : {};
  for (const [id, x] of Object.entries(all)) {
    if (x.r != null) continue;
    const e = INDEX?.events.find(v => v.id === id);
    const f = e?.final || fin[id];
    if (!f) continue;
    if (f.void) { x.r = -1; ch = true; continue; }
    const r = outcomeIx({ sport: x.sport, main: x.main }, f);
    if (r != null) { x.r = r; x.score = f.sets ? f.sets[0].map((g, i) => `${g}-${f.sets[1][i]}`).join(" ") : `${f.h}-${f.a}`; ch = true; }
  }
  if (ch) saveDuels(all);
  return all;
}
function duelBox(d) {
  if (!d || d.sport === "f1") return "";
  const ix = INDEX?.events.find(e => e.id === d.id), main = ix?.main || (d.markets?.["1x2"] || d.markets?.win);
  if (!main) return "";
  const labs = duelLabels(main.length), x = duelResolve()[d.id], started = Date.parse(d.date) <= Date.now();
  const H = d.home.short || d.home.name, A = d.away.short || d.away.name;
  const top = main.indexOf(Math.max(...main));
  const name = i => main.length === 3 ? [H, "pareggio", A][i] : [H, A][i];
  let foot;
  if (x?.r === -1) foot = "Partita non giocata: la sfida non conta.";
  else if (x?.r != null) {
    const you = x.s === x.r, mod = x.m === x.r;
    foot = `<b>${you && !mod ? "🏆 Hai battuto il modello!" : you && mod ? "✓ Presa da tutti e due" : !you && mod ? "Il modello ha avuto ragione" : "Sbagliata da tutti e due"}</b> · finita ${esc(x.score || "")}`;
  } else if (x) foot = started ? `Tu: <b>${labs[x.s]}</b> · modello: <b>${labs[x.m]}</b> (${pct(x.main[x.m])}). Si decide a fine partita.` : `Hai scelto <b>${labs[x.s]}</b>. Il modello dice <b>${labs[top]}</b> al ${pct(main[top])}${x.s === top ? ": siete d'accordo." : ": se hai ragione tu, vinci la sfida."}`;
  else foot = started ? "La partita è iniziata: le scelte sono chiuse." : `Il modello dice <b>${labs[top]}</b> al ${pct(main[top])}. E tu?`;
  return `<section class="sec duel-box" id="duel-box"><h2><span class="sec-t">⚔️ Sfida il modello</span><small><a href="#/tu" class="duel-link">la tua classifica</a></small></h2>
    <div class="duel-btns" style="--n:${main.length}">${labs.map((l, i) => `<button type="button" class="duel-b ${x?.s === i ? "on" : ""} ${x?.r != null && x.r === i ? "won" : ""}" data-duel="${i}" ${started ? "disabled" : ""}><b>${l}</b><small>${esc(name(i))}</small></button>`).join("")}</div>
    <p class="note duel-foot">${foot}</p></section>`;
}
function wireDuel(d) {
  const box = document.getElementById("duel-box");
  if (!box) return;
  box.querySelectorAll("[data-duel]").forEach(b => b.onclick = () => {
    if (Date.parse(d.date) <= Date.now()) return;
    const ix = INDEX?.events.find(e => e.id === d.id), main = ix?.main || d.markets?.["1x2"] || d.markets?.win;
    const all = duels(), i = Number(b.dataset.duel);
    if (all[d.id]?.s === i) delete all[d.id];
    else all[d.id] = { s: i, m: main.indexOf(Math.max(...main)), main, sport: d.sport, league: d.league, league_name: d.league_name || ix?.league_name,
      date: d.date, home: d.home.name, away: d.away.name, at: new Date().toISOString() };
    saveDuels(all);
    box.outerHTML = duelBox(d); wireDuel(d);
  });
}
function duelSection() {
  const all = Object.entries(duelResolve()).map(([id, x]) => ({ id, ...x }));
  if (!all.length) return sec(`${meIc("⚔️", "#7c3aed")}Tu contro il modello`, `<p class="note" style="margin:0">Nella scheda di una partita, prima del via, scegli il tuo <b>1 X 2</b> in «Sfida il modello». Qui vedrai chi indovina di più tra te e il modello, campionato per campionato.</p>`, "", "Tu sfida");
  const done = all.filter(x => x.r != null && x.r >= 0), open = all.filter(x => x.r == null);
  const you = done.filter(x => x.s === x.r).length, mod = done.filter(x => x.m === x.r).length;
  const beat = done.filter(x => x.s === x.r && x.m !== x.r).length, lost = done.filter(x => x.m === x.r && x.s !== x.r).length;
  const byL = {};
  for (const x of done) { const k = x.league_name || x.league || "Altro"; (byL[k] ||= { n: 0, y: 0, m: 0 }); byL[k].n++; if (x.s === x.r) byL[k].y++; if (x.m === x.r) byL[k].m++; }
  const lead = you > mod ? "Sei avanti tu" : you < mod ? "È avanti il modello" : "Siete pari";
  const rows = Object.entries(byL).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td class="${v.y > v.m ? "best" : ""}">${v.y}</td><td class="${v.m > v.y ? "best" : ""}">${v.m}</td></tr>`).join("");
  const last = done.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map(x => {
    const L = duelLabels(x.main.length);
    return `<div class="r"><span class="l">${esc(x.home)} – ${esc(x.away)} <span class="faint">${esc(x.score || "")}</span></span><span class="v"><span class="${x.s === x.r ? "ok" : "ko"}">tu ${L[x.s]}</span> · <span class="${x.m === x.r ? "ok" : "ko"}">mod. ${L[x.m]}</span></span></div>`;
  }).join("");
  return sec(`${meIc("⚔️", "#7c3aed")}Tu contro il modello`, `<div class="duel-score"><div><b>${you}</b><small>prese da te</small></div><div class="vs">${done.length ? `${lead}` : "In attesa dei risultati"}</div><div><b>${mod}</b><small>prese dal modello</small></div></div>
    ${done.length ? `<p class="note">${done.length} sfide finite: l'hai battuto ${beat} ${beat === 1 ? "volta" : "volte"} (tu giusto, lui sbagliato), lui ti ha battuto ${lost}.${open.length ? ` In attesa: ${open.length}.` : ""}</p>
    <table class="vs-table duel-t"><tr><th>Campionato</th><th>Sfide</th><th>Tu</th><th>Modello</th></tr>${rows}</table>
    <h3 class="lb-h3">Ultime sfide</h3><div class="rows">${last}</div>` : `<p class="note">${open.length} ${open.length === 1 ? "sfida aperta" : "sfide aperte"}: il punteggio arriva a fine partita.</p>`}
    <button type="button" class="btn-main alt duel-reset" id="duel-reset">Azzera e ricomincia</button>`, `${done.length}`, "Tu sfida");
}

/* ------------------------------------------------------------------ numero sull'icona dell'app */
/* partite seguite in corso + schedine in gioco (Android e iPhone con l'app sulla schermata Home) */
function updateAppBadge() {
  if (!("setAppBadge" in navigator)) return;
  let n = 0;
  try {
    const teams = typeof myTeams === "function" ? myTeams() : [];
    if (typeof LIVE_CACHE !== "undefined" && LIVE_CACHE) for (const ev of LIVE_CACHE.data.events) {
      if (ev.info.state !== "in") continue;
      const e = INDEX?.events.find(x => x.id === ev.id);
      if ((typeof isFollowed === "function" && isFollowed(ev.id)) || (e && teams.some(t => teamPlays(t, e)))) n++;
    }
    n += mySlips().filter(s => slipState(s).cls === "on").length;
  } catch { /* niente */ }
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => null);
}

/* ------------------------------------------------------------------ La tua settimana */
const weekStart = (off = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * off); return d; };
function weekStats(off = 0) {
  const a = weekStart(off).getTime(), b = a + 7 * 864e5, inW = iso => { const t = Date.parse(iso); return t >= a && t < b; };
  const plays = meClosed().filter(f => inW(f.date));
  const win = plays.filter(f => f.result === "win").length;
  const exp = plays.reduce((s, f) => s + (f.p || 0), 0);
  const slips = mySlips().filter(s => ["win", "lose"].includes(slipState(s).cls) && inW(s.legs.map(f => f.date).sort().pop()));
  const sw = slips.filter(s => slipState(s).cls === "win").length;
  const money = slips.filter(s => s.played && s.odds && s.stake);
  const spent = money.reduce((s, x) => s + Number(x.stake), 0), back = money.filter(s => slipState(s).cls === "win").reduce((s, x) => s + x.stake * x.odds, 0);
  const kinds = {};
  for (const f of plays) { const k = kindOf(f); (kinds[k] ||= [0, 0]); kinds[k][1]++; if (f.result === "win") kinds[k][0]++; }
  const best = Object.entries(kinds).filter(([, v]) => v[1] >= 2).sort((x, y) => y[1][0] / y[1][1] - x[1][0] / x[1][1] || y[1][1] - x[1][1])[0];
  const du = Object.values(duelResolve()).filter(x => x.r >= 0 && inW(x.date));
  return { a, b, plays: plays.length, win, exp, slips: slips.length, sw, money: money.length, spent, back, best, duelN: du.length, duelY: du.filter(x => x.s === x.r).length, duelM: du.filter(x => x.m === x.r).length };
}
const weekLabel = (s) => `${new Date(s.a).toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${new Date(s.b - 864e5).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;
function weekSection(off = Number(load("week_off", 0)) || 0) {
  const s = weekStats(off);
  const empty = !s.plays && !s.slips && !s.duelN;
  const luck = s.plays ? s.win - s.exp : 0;
  const cards = [
    [`${s.win}/${s.plays}`, "giocate prese", s.plays ? `attese ${num(s.exp, 1)} · ${luck >= 0.5 ? "meglio del previsto" : luck <= -0.5 ? "peggio del previsto" : "come previsto"}` : "nessuna chiusa"],
    [`${s.sw}/${s.slips}`, "schedine vinte", s.slips ? (s.sw ? "🎉" : "la prossima…") : "nessuna chiusa"],
    [s.money ? `${s.back - s.spent >= 0 ? "+" : "−"}${num(Math.abs(s.back - s.spent), 2)} €` : "–", "bilancio giocate", s.money ? `giocati ${num(s.spent, 2)} €` : "segna quota e puntata in Tu"],
    [s.duelN ? `${s.duelY}–${s.duelM}` : "–", "tu contro il modello", s.duelN ? `${s.duelN} sfide` : "nessuna sfida finita"],
  ];
  return sec(`${meIc("📅", "#0ea5e9")}La tua settimana`, `<div class="wk-tabs">${[[0, "Questa"], [1, "Scorsa"]].map(([v, l]) => `<button type="button" class="chip ${v === off ? "on" : ""}" data-week="${v}">${l}</button>`).join("")}<span>${esc(weekLabel(s))}</span></div>
    ${empty ? `<p class="note">Niente di chiuso in questa settimana: le giocate e le schedine finite compaiono qui.</p>` : `<div class="wk-grid">${cards.map(([v, l, n]) => `<div class="wk-c"><b>${v}</b><span>${l}</span><small>${n}</small></div>`).join("")}</div>
    ${s.best ? `<p class="note">Il tuo tipo di giocata migliore: <b>${esc(s.best[0])}</b>, ${s.best[1][0]} su ${s.best[1][1]}.</p>` : ""}
    <button type="button" class="btn-main alt" id="wk-img">Condividi come immagine</button>`}`, "", "Tu settimana");
}
function wireWeek() {
  document.querySelectorAll("[data-week]").forEach(b => b.onclick = () => { save("week_off", b.dataset.week); const el = b.closest("section"); if (el) { el.outerHTML = weekSection(Number(b.dataset.week)); wireWeek(); } });
  const im = document.getElementById("wk-img");
  if (im) im.onclick = () => { const off = Number(load("week_off", 0)) || 0; imageSheet(weekCanvas(weekStats(off)), "la-mia-settimana.png", "La mia settimana"); };
}
function weekCanvas(s) {
  const H = 1150, { c, x, C } = cvSetup(H);
  cvHeader(x, C, weekLabel(s));
  font(x, 54, 800); x.fillStyle = C.ink; x.textBaseline = "middle"; x.fillText("La mia settimana", 60, 210);
  const box = (X, Y, big, lab, sub, col) => {
    rrect(x, X, Y, 470, 250, 30); x.fillStyle = C.card; x.fill();
    font(x, 72, 800); x.fillStyle = col || C.ink; x.fillText(big, X + 36, Y + 90);
    font(x, 30, 700); x.fillStyle = C.ink2; x.fillText(lab, X + 36, Y + 165);
    font(x, 24, 600); x.fillStyle = C.ink3; x.fillText(fitText(x, sub, 400), X + 36, Y + 210);
  };
  const bal = s.back - s.spent;
  box(50, 290, `${s.win}/${s.plays}`, "giocate prese", `attese ${num(s.exp, 1)}`, C.go);
  box(560, 290, `${s.sw}/${s.slips}`, "schedine vinte", s.slips ? "" : "nessuna chiusa");
  box(50, 580, s.money ? `${bal >= 0 ? "+" : "−"}${num(Math.abs(bal), 2)}€` : "–", "bilancio", s.money ? `giocati ${num(s.spent, 2)} €` : "", s.money ? (bal >= 0 ? C.go : "#e5484d") : C.ink);
  box(560, 580, s.duelN ? `${s.duelY}–${s.duelM}` : "–", "io contro il modello", s.duelN ? `${s.duelN} sfide` : "");
  if (s.best) { font(x, 30, 700); x.fillStyle = C.ink2; x.fillText(fitText(x, `Giocata migliore: ${s.best[0]} (${s.best[1][0]} su ${s.best[1][1]})`, IMG_W - 120), 60, 920); }
  cvFooter(x, C, H);
  return c;
}

/* ------------------------------------------------------------------ simulatore della schedina */
/* "su 100 volte passa X": il prodotto delle probabilità disegnato come 100 pallini; la giocata che rischia di più
   e, se nella stessa partita c'è una giocata simile più sicura, il cambio che alza di più la schedina. */
const SIM_REL = { "1x2": ["dc", "dnb", "1x2"], dc: ["dc"], dnb: ["dc", "dnb"], ou: ["ou"], gg: ["ou", "gg"], combo: ["1x2", "dc", "combo"], exact: ["mg", "ou"], mg: ["mg"], mgt: ["mgt"] };
function simBox(legs) {
  const live = legs.filter(f => !f.result);
  if (live.length < 2) return "";
  const prod = legs.reduce((a, f) => a * (f.result === "win" || f.result === "void" ? 1 : f.p), 1), n = Math.round(prod * 100);
  const weak = live.slice().sort((a, b) => a.p - b.p)[0];
  const dots = Array.from({ length: 100 }, (_, i) => `<i class="${i < n ? "y" : ""}"></i>`).join("");
  return `<section class="sec sim-box" id="sim-box"><h2><span class="sec-t">🎲 Simulatore</span><small>${legs.length} giocate</small></h2>
    <div class="sim-top"><div class="sim-dots" aria-hidden="true">${dots}</div>
      <div class="sim-txt"><b>${n <= 0 ? "Meno di 1" : n} su 100</b><span>volte una schedina così passerebbe, secondo il modello</span></div></div>
    <p class="note">La più a rischio: <b>${esc(weak.label)}</b> (${esc(weak.match)}) al ${pct(weak.p)}. Da sola fa perdere la schedina ${Math.round((1 - weak.p) * 100)} volte su 100.</p>
    <div data-sim-sug></div></section>`;
}
async function wireSim(legs, onSwap) {
  const box = document.querySelector("#sim-box [data-sim-sug]");
  if (!box) return;
  const live = legs.filter(f => !f.result);
  const weak = live.slice().sort((a, b) => a.p - b.p)[0];
  if (!weak || weak.sport !== "soccer" || typeof rsCands !== "function") return;
  let d;
  try { d = await getJSON(`data/events/${encodeURIComponent(weak.event)}.json`); } catch { return; }
  const cands = rsCands(d, "all");
  const mine = cands.find(c => c.label === weak.label);
  const rel = SIM_REL[mine?.t] || [];
  const ok = cands.filter(c => c.label !== weak.label && c.p >= weak.p + 0.08 && c.p <= 0.95 && !legs.some(f => f.event === weak.event && f.label === c.label));
  const pickFrom = arr => arr.sort((a, b) => a.p - b.p)[0];
  const dir = c => c.label.split(" ")[0];      // Over resta Over, Under resta Under
  const alt = pickFrom(ok.filter(c => rel.includes(c.t) && (!/^(Over|Under)$/.test(dir(weak)) || dir(c) === dir(weak))))
    || pickFrom(ok.filter(c => rel.includes(c.t))) || pickFrom(ok.filter(c => ["dc", "ou", "mg"].includes(c.t)));
  if (!alt || !box.isConnected) return;
  const prod = legs.reduce((a, f) => a * (f.result === "win" || f.result === "void" ? 1 : f.p), 1), np = prod / weak.p * alt.p;
  box.innerHTML = `<div class="sim-sug"><span>💡 Cambia <b>${esc(weak.label)}</b> con <b>${esc(alt.label)}</b> (${pct(alt.p)}): la schedina passa da <b>${Math.round(prod * 100)}</b> a <b>${Math.round(np * 100)}</b> su 100.</span>
    ${onSwap ? `<button type="button" class="btn-main alt" data-sim-swap>Cambia</button>` : ""}</div>`;
  box.querySelector("[data-sim-swap]")?.addEventListener("click", () => onSwap(weak, alt));
}
/* nella pagina Schedina: sostituisce la giocata nella schedina in costruzione */
function simSwapFav(weak, alt) {
  const list = favs(), i = list.findIndex(f => f.key === weak.key);
  if (i < 0) return;
  list[i] = { ...list[i], key: `${weak.event}|${alt.label}`, label: alt.label, p: alt.p, book: null };
  saveFavs(list);
  toast(`Cambiata: ${alt.label}`);
  showSlip();
}

/* ------------------------------------------------------------------ calendario delle squadre seguite */
function showTeamCalendar() {
  const teams = myTeams();
  const back = backBtn("Tu", "#/tu");
  if (!teams.length) { $app.innerHTML = back + `<div class="empty"><b>Non segui ancora nessuna squadra</b>Apri la pagina di una squadra o di un tennista e tocca <b>Segui</b>.</div>`; return; }
  const evs = INDEX.events.filter(e => !e.final && Date.parse(e.date) > Date.now() - 3 * 3600e3 && teams.some(t => teamPlays(t, e))).sort((a, b) => a.date.localeCompare(b.date));
  const days = {};
  for (const e of evs) (days[isoDay(e.date)] ||= []).push(e);
  const chips = teams.map(t => `<span class="tc-chip" style="--tc:${t.color ? "#" + String(t.color).replace("#", "") : "#0a9b5a"}">${t.logo ? img(t.logo, t.kind === "player" ? "tflag" : "tlogo") : ""}${esc(t.short || t.name)}<small>${evs.filter(e => teamPlays(t, e)).length}</small></span>`).join("");
  $app.innerHTML = back + `<h1 class="page-h">Calendario delle tue squadre</h1><div class="tc-chips">${chips}</div>
    ${evs.length ? Object.entries(days).map(([k, list]) => `<h2 class="day">${esc(dayChipLabel(k))}<span>${new Date(k + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</span></h2><section class="group">${list.map(fixture).join("")}</section>`).join("")
      : `<div class="empty"><b>Nessuna partita nei prossimi giorni</b>Le partite compaiono qui quando entrano nell'elenco (fino a 10-14 giorni prima).</div>`}
    <p class="note">Con le notifiche attive (in Tu) la mattina del giorno della partita arriva un promemoria con l'orario e il pronostico.</p>`;
}

/* ------------------------------------------------------------------ Preferiti */
/* #/preferiti, dal tasto con la stella accanto a Classifiche: partite seguite con la campanella (anche in corso o appena
   finite), prossime partite delle squadre seguite e giocate salvate ancora aperte */
function favEvents() {
  const ids = new Set(typeof followed === "function" ? followed().map(x => x.id) : []);
  return INDEX.events.filter(e => ids.has(e.id)).sort((a, b) => a.date.localeCompare(b.date));
}
function favBtn() {
  // campanella vuota senza partite seguite, piena con il numero quando ce n'è almeno una
  const n = favEvents().length;
  return `<a class="std-btn fav-btn ${n ? "on" : ""}" id="fav-btn" href="#/preferiti" aria-label="Preferiti${n ? `: ${n} partite seguite` : ""}">${BELL_SVG}<span>Preferiti</span>${n ? `<em class="fav-n">${n}</em>` : ""}</a>`;
}
function updateFavBtn() {
  const b = document.getElementById("fav-btn");
  if (b) b.outerHTML = favBtn();
}
function showFavorites() {
  const back = backBtn("Partite", "#/");
  const evs = favEvents();
  const teams = typeof myTeams === "function" ? myTeams() : [];
  const seen = new Set(evs.map(e => e.id));
  const lim = Date.now() + 7 * 864e5;
  const teamEvs = INDEX.events.filter(e => !seen.has(e.id) && !e.final && Date.parse(e.date) > Date.now() - 3 * 3600e3 && Date.parse(e.date) < lim && teams.some(t => teamPlays(t, e)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const open = (typeof favs === "function" ? favs() : []).filter(f => !f.result);
  const group = (list, removable) => {
    const days = {};
    for (const e of list) (days[isoDay(e.date)] ||= []).push(e);
    return Object.entries(days).map(([k, l]) => `<h2 class="day">${esc(dayChipLabel(k))}<span>${new Date(k + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</span></h2><section class="group">${l.map(e => { BELL_KEEP = !!removable; try { return fixture(e); } finally { BELL_KEEP = false; } }).join("")}</section>`).join("");
  };
  $app.innerHTML = back + `<h1 class="page-h">Preferiti</h1>
    <h2 class="fav-h">🔔 Partite seguite <small>${evs.length}</small>${evs.length ? `<button type="button" class="fav-clear" id="fav-clear">Svuota</button>` : ""}</h2>
    ${evs.length ? group(evs, true) : `<div class="empty"><b>Nessuna partita seguita</b>Tocca la campanella 🔔 di una partita, nell'elenco o nella scheda: la ritrovi qui e ti arrivano gli avvisi.</div>`}
    ${teams.length ? `<h2 class="fav-h">⭐ Le tue squadre, prossimi 7 giorni <small>${teamEvs.length}</small></h2>${teamEvs.length ? group(teamEvs) : `<p class="note">Nessuna partita delle tue squadre nei prossimi giorni.</p>`}` : ""}
    ${open.length ? `<a class="std-link" href="#/schedina"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/></svg>${open.length} ${open.length === 1 ? "giocata salvata" : "giocate salvate"} nella schedina<span>›</span></a>` : ""}`;
  const drop = ids => {
    const keep = followed().filter(x => !ids.includes(x.id));
    localStorage.setItem("p_follow", JSON.stringify(keep));
    if (typeof notifySync === "function") notifySync();
  };
  document.getElementById("fav-clear")?.addEventListener("click", async () => {
    if (!(await askConfirm("Tutte le partite seguite escono dai preferiti e non ricevi più i loro avvisi. Le tue squadre restano.", { title: "Svuotare le partite seguite?", ok: "Svuota", danger: true }))) return;
    drop(evs.map(e => e.id).concat(followed().map(x => x.id)));
    toast("Partite seguite svuotate"); showFavorites();
  });
  // partite in corso: punteggio e percentuali di adesso, aggiornati finché la pagina resta aperta
  if (typeof liveData === "function" && evs.concat(teamEvs).some(e => !e.final && Date.parse(e.date) < Date.now())) {
    clearTimeout(FAV_T);
    // dati della diretta non ancora letti (app appena aperta o pagina ricaricata): subito, poi ogni 15 s
    const fresh = typeof LIVE_CACHE !== "undefined" && LIVE_CACHE && Date.now() - LIVE_CACHE.ts < 20000;
    FAV_T = setTimeout(() => liveData(7000).then(() => { if (location.hash === "#/preferiti" && !document.hidden) { const y = scrollY; showFavorites(); scrollTo(0, y); } }).catch(() => {}), fresh ? 15000 : 0);
  }
}
let FAV_T = 0;

/* ------------------------------------------------------------------ pagina del giocatore (NBA e calcio) */
/* #/giocatore/<partita>/<home|away>/<id ESPN>: dati della prossima partita (file della partita) e partita per partita
   dalla gamelog pubblica di ESPN (letta dal telefono, verificata con Verifica fonti modo giocatori). */
const plHref = (d, side, p) => `#/giocatore/${encodeURIComponent(d.id)}/${side}/${encodeURIComponent(p.pid)}`;
async function gamelog(sport, league, pid) {
  const path = sport === "nba" ? "basketball/nba" : `soccer/${(typeof ESPN_CODE !== "undefined" && ESPN_CODE[league]) || league}`;
  const js = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/${path}/athletes/${encodeURIComponent(pid)}/gamelog`).then(r => r.ok ? r.json() : null);
  if (!js || !js.events) return null;
  const rows = [];
  for (const st of js.seasonTypes || []) for (const cat of st.categories || []) for (const ev of cat.events || []) {
    const meta = js.events[ev.eventId];
    if (!meta || rows.some(r => r.id === ev.eventId)) continue;
    const s = {};
    (js.labels || []).forEach((l, i) => { s[l] = ev.stats?.[i]; });
    rows.push({ id: ev.eventId, date: meta.gameDate, opp: meta.opponent?.abbreviation || meta.opponent?.displayName || "", at: meta.atVs || "", res: meta.gameResult || "", score: meta.score || "", s });
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
async function showPlayer(eid, side, pid) {
  const back = `<button class="back" onclick="history.length > 1 ? history.back() : location.hash='#/e/${encodeURIComponent(eid)}'">‹ Partita</button>`;
  $app.innerHTML = back + `<p class="muted">Caricamento…</p>`;
  let d;
  try { d = await getJSON(`data/events/${encodeURIComponent(eid)}.json`); } catch { $app.innerHTML = back + `<div class="empty"><b>Partita non più disponibile</b></div>`; return; }
  const p = (d.players?.[side] || []).find(x => String(x.pid) === String(pid));
  if (!p) { $app.innerHTML = back + `<div class="empty"><b>Giocatore non trovato</b></div>`; return; }
  const T = d[side], O = d[side === "home" ? "away" : "home"], nba = d.sport === "nba";
  const [cH, cA] = teamColors(d.home, d.away), col = side === "home" ? cH : cA;
  CUR = { event: d.id, match: `${d.home.name} – ${d.away.name}`, date: d.date, time_valid: d.time_valid, league_name: d.league_name, sport: d.sport };
  const head = `<div class="pl-hero" style="--tc:${col}">${avatar(p.name, col, p.pos, nba ? headshot("nba", p.pid) : (p.photo ?? headshot("soccer", p.pid)))}
    <div><h1>${esc(p.name)}</h1><span>${esc(T.name)}${p.pos ? ` · ${esc(p.pos)}` : ""}${p.out ? ` · <b class="bad">fuori</b>` : ""}</span></div></div>
    <a class="pl-next" href="#/e/${encodeURIComponent(d.id)}"><span>Prossima partita</span><b>${side === "home" ? "contro" : "in casa di"} ${esc(O.name)}</b><small>${esc(fmtDay(d.date).label)}, ${esc(fmtTime(d.date, d.time_valid))} ›</small></a>`;
  let now = "", stats = "";
  if (nba) {
    now = Object.entries(p.props || {}).map(([k, v]) => `<div class="line"><span>${PROP_NAME[k]}<br><b>${num(v.mean)}</b> attesi</span><div class="chips">${Object.entries(v.p).map(([L, pr]) => {
      const key = favKey(`${p.name} almeno ${L} ${PROP_UNIT[k]}`, pr);
      return `<button type="button" class="chip ${pr >= .6 ? "hot" : ""} ${isFav(key) ? "on" : ""}" data-fav="${esc(key)}">${L}+<b>${pct(pr)}</b></button>`; }).join("")}</div></div>`).join("");
    const cols = [["avg5", "Ultime 5"], ["avg10", "Ultime 10"], ["avg15", "Ultime 15"], ["season", "Stagione"]].filter(([k]) => p[k]);
    const rowsDef = [["min", "Minuti"], ["pts", "Punti"], ["reb", "Rimbalzi"], ["ast", "Assist"], ["tpm", "Triple"], ["stl", "Recuperi"], ["blk", "Stoppate"], ["fg_pct", "% al tiro"]];
    stats = `<table class="vs-table pl-t"><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join("")}</tr>${rowsDef.map(([k, l]) => `<tr><td>${l}</td>${cols.map(([c]) => `<td>${p[c]?.[k] == null ? "–" : k === "fg_pct" ? Math.round(p[c][k] * 100) : num(p[c][k])}</td>`).join("")}</tr>`).join("")}</table>`;
  } else {
    const P = [["p_goal", "Segna"], ["p_assist", "Assist"], ["p_goal_or_assist", "Gol o assist"], ["p_sot", "Tiro in porta"], ["p_shot", "Almeno un tiro"], ["p_card", "Ammonito"]];
    now = `<div class="pl-probs">${P.filter(([k]) => p[k] != null).map(([k, l]) => `<div><b>${pct(p[k])}</b><span>${l}</span></div>`).join("")}</div>`;
    const t = p.tot || {};
    stats = `<div class="pl-probs">${[["apps", "Presenze"], ["starts", "Da titolare"]].map(([k, l]) => `<div><b>${p[k] ?? "–"}</b><span>${l}</span></div>`).join("")}${[["g", "Gol"], ["a", "Assist"], ["sh", "Tiri"], ["sot", "Tiri in porta"], ["yc", "Gialli"]].map(([k, l]) => `<div><b>${t[k] ?? "–"}</b><span>${l}</span></div>`).join("")}</div>`;
  }
  $app.innerHTML = back + head + sec(nba ? "Le sue giocate nella prossima partita" : "Nella prossima partita", now + `<p class="note">Stime del modello per questa partita. Tocca una soglia per metterla in schedina.</p>`)
    + sec(nba ? "Medie" : "In stagione", stats) + `<div id="pl-log">${sec("Partita per partita", `<p class="muted">Caricamento da ESPN…</p>`)}</div>`;
  let rows = null;
  try { rows = await gamelog(d.sport, d.league, p.pid); } catch { rows = null; }
  const box = document.getElementById("pl-log");
  if (!box) return;
  if (!rows?.length) { box.innerHTML = sec("Partita per partita", `<p class="note">Lo storico partita per partita non è disponibile ora.</p>`); return; }
  const last = rows.slice(0, 10);
  const K = nba ? [["MIN", "Min"], ["PTS", "Pt"], ["REB", "Rim"], ["AST", "Ass"], ["3PT", "3P"]] : [["G", "Gol"], ["A", "Ass"], ["SH", "Tiri"], ["ST", "In porta"], ["YC", "Gialli"]].map(([k, l]) => [Object.keys(last[0].s).find(x => x === k || (k === "SH" && /^SHOT|^SH$/.test(x)) || (k === "ST" && /^SOG|^SOT|^ST$/.test(x)) || (k === "G" && /^G$|^TG$/.test(x))) || k, l]);
  // quante volte sopra la soglia principale dei suoi mercati, nelle ultime 10
  const hits = nba ? Object.entries(p.props || {}).map(([k, v]) => {
    const lab = { pts: "PTS", reb: "REB", ast: "AST", tpm: "3PT", pra: null }[k];
    const L = Object.keys(v.p).map(Number).sort((a, b) => Math.abs(v.p[a] - .5) - Math.abs(v.p[b] - .5))[0];
    const val = r => k === "pra" ? ["PTS", "REB", "AST"].reduce((s, x) => s + (parseFloat(r.s[x]) || 0), 0) : parseFloat(String(r.s[lab]).split("-")[0]);
    const n = last.filter(r => val(r) >= L).length;
    return `<div><b>${n}/${last.length}</b><span>${PROP_NAME[k]} ${L}+</span></div>`;
  }).join("") : "";
  const ptsMax = nba ? Math.max(10, ...last.map(r => parseFloat(r.s.PTS) || 0)) : 0;
  const chart = nba ? `<div class="pl-bars">${last.slice().reverse().map(r => { const v = parseFloat(r.s.PTS) || 0; return `<span title="${v} punti"><i style="height:${Math.round(v / ptsMax * 100)}%"></i><small>${v}</small></span>`; }).join("")}</div>` : "";
  box.innerHTML = sec("Partita per partita", (hits ? `<div class="pl-probs">${hits}</div><p class="note">Quante volte nelle ultime ${last.length} partite ha raggiunto la soglia più equilibrata di ogni mercato.</p>` : "")
    + (chart ? `<h3 class="lb-h3">Punti nelle ultime ${last.length}</h3>${chart}` : "")
    + `<table class="vs-table pl-t pl-log"><tr><th>Data</th><th></th>${K.map(([, l]) => `<th>${l}</th>`).join("")}</tr>
      ${last.map(r => `<tr><td>${esc(new Date(r.date).toLocaleDateString("it-IT", { day: "numeric", month: "short" }))}</td><td>${esc(r.at)} ${esc(r.opp)} <span class="f ${r.res === "W" ? "V" : r.res === "L" ? "P" : "N"}">${r.res === "W" ? "V" : r.res === "L" ? "P" : r.res ? "N" : ""}</span></td>${K.map(([k]) => `<td>${esc(r.s[k] ?? "–")}</td>`).join("")}</tr>`).join("")}</table>
      <p class="note">Dati ESPN, ultime ${last.length} partite giocate.</p>`);
}
