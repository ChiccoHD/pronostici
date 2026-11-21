"use strict";
/* Pronostici — costruisci la multipla e condividi la schedina. Usa funzioni di app.js. */

/* ------------------------------------------------------------------ costruisci la multipla */

const MP = { target: Number(load("mp_target", "3")), sport: load("mp_sport", "all"), when: load("mp_when", "2"), kind: load("mp_kind", "all") };
const MP_TARGETS = [1.5, 2, 3, 5, 10, 20, 50];
/* tipi di giocata per filtrare le proposte (categorie di migliori.json) */
const MP_KINDS = [["all", "Qualsiasi"], ["esito", "Esiti"], ["gol", "Gol e punti"], ["giocatori", "Giocatori"], ["f1", "F1"]];
const MP_KIND_OF = { "Esito 1X2": "esito", "Doppia chance": "esito", "Vincente NBA": "esito", "Vincente tennis": "esito", "Gol": "gol", "Multigol": "gol", "Angoli": "gol",
  "Punti totali": "gol", "Game nel tennis": "gol", "Marcatori": "giocatori", "Punti": "giocatori", "Rimbalzi": "giocatori", "Assist": "giocatori", "Triple": "giocatori",
  "Punti + rimbalzi + assist": "giocatori", "Vincente F1": "f1", "Podio F1": "f1", "Punti F1": "f1", "Pole F1": "f1", "Testa a testa F1": "f1" };
const MP_WHEN = [["1", "Oggi"], ["2", "Entro domani"], ["3", "3 giorni"], ["all", "Tutte"]];

/* quanto fidarsi di una giocata: dove modello e bookmaker sono d'accordo la stima è più solida;
   dove sono molto lontani, o il modello ha pochi dati, lo è meno */
function trust(it) {
  if (it.low) return 0.4;
  if (it.book == null) return 0.7;
  const gap = Math.abs(it.p - it.book);
  return gap <= 0.05 ? 1 : gap <= 0.1 ? 0.8 : 0.45;
}
const TRUST_LABEL = t => t >= 1 ? "modello e bookmaker d'accordo" : t >= 0.8 ? "vicina alle quote" : t >= 0.7 ? "senza quote di confronto" : "stima incerta";

function mpCandidates() {
  const now = Date.now(), endDay = MP.when === "all" ? Infinity : (() => {
    const d = new Date(); d.setHours(23, 59, 59, 999); d.setDate(d.getDate() + Number(MP.when) - 1); return d.getTime();
  })();
  const seen = new Set(), out = [];
  for (const c of BEST.categories) for (const it of c.items) {
    const t = new Date(it.date).getTime();
    if (t < now + 5 * 60e3 || t > endDay) continue;
    if (MP.sport !== "all" && it.sport !== MP.sport) continue;
    if (MP.kind !== "all" && MP_KIND_OF[c.name] !== MP.kind) continue;
    if (it.p < 0.3 || it.p > 0.97) continue;
    const k = `${it.event}|${it.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...it, cat: c.name, tr: trust(it) });
  }
  return out;
}

/* per k giocate su partite diverse: le più affidabili con probabilità vicina a quella che serve a ogni giocata */
function mpPropose(cands, target, k) {
  const goal = 1 / target, perLeg = goal ** (1 / k);
  const picked = [], used = new Set();
  for (let i = 0; i < k; i++) {
    const have = picked.reduce((a, x) => a * x.p, 1);
    const need = i === k - 1 ? goal / have : perLeg;
    let best = null, bestScore = Infinity;
    for (const c of cands) {
      if (used.has(c.event)) continue;
      const miss = Math.abs(Math.log(c.p / need));
      // a parità di quota la probabilità di vincere è la stessa: si preferiscono le giocate più affidabili
      // e quelle dove il modello vede valore rispetto ai bookmaker (probabilità più alta della loro)
      const value = c.book != null ? Math.max(-0.1, Math.min(0.15, c.p - c.book)) : 0;
      const score = miss * 3 + (1 - c.tr) - value * 4;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    if (!best) return null;
    picked.push(best); used.add(best.event);
  }
  const prod = picked.reduce((a, x) => a * x.p, 1);
  const odds = 1 / prod;
  if (Math.abs(Math.log(odds / target)) > Math.log(1.25)) return null;   // troppo lontana dalla quota chiesta
  return { legs: picked, prod, odds, trust: picked.reduce((a, x) => a + x.tr, 0) / k };
}

async function showMultipla() {
  if (!BEST) { try { BEST = await getJSON("data/migliori.json"); } catch { BEST = { categories: [] }; } }
  if (!location.hash.startsWith("#/multipla")) return;
  const cands = mpCandidates();
  const props = [2, 3, 4].map(k => mpPropose(cands, MP.target, k)).filter(Boolean);
  const chip = (group, v, l, cur) => `<button data-mp="${group}" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`;
  let html = backBtn("Schedina") + `<h1 class="page-h">Costruisci la multipla</h1>
    <div class="mp-modes"><a class="on" href="#/multipla">Per quota</a><a href="#/multipla/giornata">Per giornata</a></div>
    <section class="sec mp-ctrl">
      <div class="mp-lab">Quota che vuoi raggiungere</div><div class="mp-chips">${MP_TARGETS.map(t => chip("target", t, odd(1 / t), MP.target)).join("")}</div>
      <div class="mp-lab">Sport</div><div class="mp-chips">${SPORTS.map(s => chip("sport", s.key, s.label, MP.sport)).join("")}</div>
      <div class="mp-lab">Tipo di giocata</div><div class="mp-chips">${MP_KINDS.map(([v, l]) => chip("kind", v, l, MP.kind)).join("")}</div>
      <div class="mp-lab">Partite</div><div class="mp-chips">${MP_WHEN.map(([v, l]) => chip("when", v, l, MP.when)).join("")}</div>
    </section>`;
  if (!props.length) html += `<div class="empty"><b>Nessuna combinazione adatta</b>Con questi filtri non ci sono abbastanza giocate su partite diverse. Prova con più giorni, tutti gli sport o un'altra quota.</div>`;
  props.forEach((pr, i) => {
    const legs = pr.legs.map(it => {
      const key = favKey(it.label, it.p, it.book, { event: it.event, match: it.match, date: it.date, time_valid: it.time_valid, league_name: it.league_name, sport: it.sport });
      const when = `${fmtDay(it.date).rel || fmtShort(it.date)}, ${fmtTime(it.date, it.time_valid)}`;
      return `<div class="pk mp-leg">${ring(it.p, it.p >= .75)}<a class="pk-txt" href="#/e/${encodeURIComponent(it.event)}"><b>${esc(it.label)}</b>
        <span>${esc(SPORT_NAME[it.sport] || "")} · ${esc(it.match)}, ${esc(when)}</span><span class="mp-tr t${Math.round(it.tr * 10)}">${esc(TRUST_LABEL(it.tr))}${it.book != null ? `, bookmaker ${pct(it.book)}` : ""}</span></a>${star(key)}</div>`;
    }).join("");
    html += `<section class="sec mp-prop"><h2>${pr.legs.length} giocate<small>quota equa ${odd(pr.prod)}</small></h2>
      <div class="slip-nums"><div>${ring(pr.prod, pr.prod >= .5)}<span>probabilità stimata che escano tutte</span></div>
      <div class="big-odd"><b>${odd(pr.prod)}</b><span>quota equa</span></div></div>
      ${legs}
      <button type="button" class="btn-main" data-mp-save="${i}">Salva come schedina</button>
      <button type="button" class="btn-main alt" data-mp-add="${i}">Aggiungi alla schedina in costruzione</button></section>`;
  });
  html += `<p class="note">A parità di quota la probabilità stimata è sempre la stessa (circa 1 diviso la quota), qualunque giocate contenga: per questo le proposte scelgono, tra le giocate della classifica Migliori su partite diverse, quelle su cui il modello è più solido, cioè d'accordo con i bookmaker e con abbastanza dati. Meno giocate vuol dire meno errori del modello che si sommano. Restano stime, non certezze, e il bookmaker paga meno della quota equa.</p>`;
  $app.innerHTML = html;
  $app.querySelectorAll("[data-mp]").forEach(b => b.onclick = () => {
    const g = b.dataset.mp; MP[g] = g === "target" ? Number(b.dataset.v) : b.dataset.v; save("mp_" + g, b.dataset.v); showMultipla();
  });
  $app.querySelectorAll("[data-mp-save]").forEach(b => b.onclick = async () => {
    const pr = props[Number(b.dataset.mpSave)];
    const name = await askText("Nome della schedina", `Multipla ${odd(pr.prod)} (${pr.legs.length} giocate)`, { hint: "La ritrovi in Tu, dove l'app segna da sola com'è andata." });
    if (name === null) return;
    saveAsSlip(pr.legs, name.trim() || undefined);
    toast("Schedina salvata: la trovi in Tu");
  });
  $app.querySelectorAll("[data-mp-add]").forEach(b => b.onclick = () => {
    const pr = props[Number(b.dataset.mpAdd)];
    let list = favs(), n = 0;
    for (const it of pr.legs) {
      const key = `${it.event}|${it.label}`;
      if (list.some(f => f.key === key)) continue;
      list.push({ key, event: it.event, match: it.match, date: it.date, time_valid: it.time_valid, league_name: it.league_name, sport: it.sport, label: it.label, p: it.p, book: it.book, added: new Date().toISOString() });
      n++;
    }
    saveFavs(list);
    showMultipla();
    if (!n) toast("Erano già tutte nella schedina");
    if (typeof showSlipSheet === "function") showSlipSheet();     // la schedina si apre qui sotto, senza cambiare pagina
  });
}

/* ------------------------------------------------------------------ schedina di una giornata */
/* Scegli campionato e giornata, quante partite e che tipo di giocata: per ogni partita prende la giocata più probabile
   di quel tipo (dai file delle partite), poi tiene le partite più sicure. Le etichette sono quelle della scheda della partita,
   così l'esito si controlla da solo come per le altre giocate. */
const RS_TYPES = [["mix", "Le più sicure"], ["1x2", "1X2"], ["dc", "Doppia chance"], ["ou", "Under/Over"], ["gg", "Goal/No Goal"], ["mg", "Multigol"], ["mgt", "Multigol squadra"], ["combo", "Combo"], ["exact", "Risultato esatto"]];
const RS = { league: load("rs_league", "serie-a"), round: null, n: Number(load("rs_n", 4)), type: load("rs_type", "mix") };
function rsCands(d, type) {
  const m = d.markets || {}, H = d.home.short || d.home.name, A = d.away.short || d.away.name, out = [];
  const add = (t, label, p) => { if (p != null && p < 0.985) out.push({ t, label, p }); };
  if (m["1x2"]) { add("1x2", `${H} vince`, m["1x2"][0]); add("1x2", "Pareggio", m["1x2"][1]); add("1x2", `${A} vince`, m["1x2"][2]); }
  for (const [k, p] of Object.entries(m.dc || {})) add("dc", { "1X": `${H} o pareggio`, "X2": `${A} o pareggio`, "12": "Una delle due vince" }[k] || k, p);
  for (const l of ["1.5", "2.5", "3.5"]) if (m.ou?.[l] != null) { const L = l.replace(".", ","); add("ou", `Over ${L}`, m.ou[l]); add("ou", `Under ${L}`, 1 - m.ou[l]); }
  if (m.btts != null) { add("gg", "Goal, segnano entrambe", m.btts); add("gg", "No Goal", 1 - m.btts); }
  for (const [k, p] of Object.entries(m.combo || {})) add("combo", k, p);
  if (m.exact?.[0]) add("exact", m.exact[0].score, m.exact[0].p);
  for (const [k, p] of Object.entries(m.multigol || {})) add("mg", `Multigol ${k}`, p);
  for (const [k, p] of Object.entries(m.multigol_team?.home || {})) add("mgt", `Multigol ${H} ${k}`, p);
  for (const [k, p] of Object.entries(m.multigol_team?.away || {})) add("mgt", `Multigol ${A} ${k}`, p);
  return type === "mix" ? out.filter(c => !["exact", "mg", "mgt"].includes(c.t)) : out.filter(c => c.t === type);
}
async function showRoundSlip() {
  $app.innerHTML = backBtn("Schedina") + `<h1 class="page-h">Costruisci la multipla</h1><p class="muted" style="padding:16px 4px">Caricamento…</p>`;
  const leagues = TABLE_LEAGUES.filter(([k]) => k !== "nba");
  if (!leagues.some(([k]) => k === RS.league)) RS.league = "serie-a";
  const L = await leagueData(RS.league);
  if (!location.hash.startsWith("#/multipla/giornata")) return;
  const R = L?.rounds || [];
  const next = R.find(r => r.m.some(m => m[3] == null && Date.parse(m[0]) > Date.now())) || R[R.length - 1];
  if (RS.round == null || !R.some(r => r.n === RS.round)) RS.round = next?.n ?? null;
  const round = R.find(r => r.n === RS.round);
  const chip = (g, v, l, cur) => `<button data-rs="${g}" data-v="${v}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`;
  let html = backBtn("Schedina") + `<h1 class="page-h">Costruisci la multipla</h1>
    <div class="mp-modes"><a href="#/multipla">Per quota</a><a class="on" href="#/multipla/giornata">Per giornata</a></div>
    <section class="sec mp-ctrl">
      <div class="mp-lab">Campionato</div><select class="rs-sel" id="rs-league">${leagues.map(([k, l]) => `<option value="${k}" ${k === RS.league ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <div class="mp-lab">Giornata</div><select class="rs-sel" id="rs-round">${R.filter(r => r.m.some(m => m[3] == null)).map(r => `<option value="${r.n}" ${r.n === RS.round ? "selected" : ""}>Giornata ${r.n} · ${esc(fmtShort(r.m[0][0]))}</option>`).join("") || `<option>Nessuna giornata da giocare</option>`}</select>
      <div class="mp-lab">Quante partite</div><div class="mp-chips">${[2, 3, 4, 5, 6, 8, 10].map(n => chip("n", n, String(n), RS.n)).join("")}</div>
      <div class="mp-lab">Tipo di giocata</div><div class="mp-chips">${RS_TYPES.map(([v, l]) => chip("type", v, l, RS.type)).join("")}</div>
    </section><div id="rs-out"><p class="muted" style="padding:8px 4px">Calcolo…</p></div>`;
  $app.innerHTML = html;
  $app.querySelector("#rs-league").onchange = e => { RS.league = e.target.value; RS.round = null; save("rs_league", RS.league); showRoundSlip(); };
  $app.querySelector("#rs-round").onchange = e => { RS.round = Number(e.target.value); showRoundSlip(); };
  $app.querySelectorAll("[data-rs]").forEach(b => b.onclick = () => { const g = b.dataset.rs; RS[g] = g === "n" ? Number(b.dataset.v) : b.dataset.v; save("rs_" + g, b.dataset.v); showRoundSlip(); });
  const out = $app.querySelector("#rs-out");
  if (!round) { out.innerHTML = `<div class="empty"><b>Giornate non disponibili</b>Arrivano con il prossimo aggiornamento dei dati.</div>`; return; }
  // partite della giornata che hanno già il pronostico (di solito quelle dei prossimi 7-10 giorni)
  const ev = round.m.filter(m => m[3] == null && Date.parse(m[0]) > Date.now())
    .map(m => (INDEX?.events || []).find(e => e.league === RS.league && e.id.endsWith(`-${m[5]}`))).filter(Boolean);
  if (!ev.length) { out.innerHTML = `<div class="empty"><b>Pronostici non ancora pronti</b>Per questa giornata le percentuali arrivano qualche giorno prima delle partite.</div>`; return; }
  const files = await Promise.all(ev.map(e => getJSON(`data/events/${encodeURIComponent(e.id)}.json`).catch(() => null)));
  if (!location.hash.startsWith("#/multipla/giornata")) return;
  const best = files.filter(Boolean).map(d => { const c = rsCands(d, RS.type).sort((a, b) => b.p - a.p)[0]; return c && { ...c, d }; }).filter(Boolean)
    .sort((a, b) => b.p - a.p).slice(0, RS.n);
  const legs = best.map(b => ({ event: b.d.id, match: `${b.d.home.name} – ${b.d.away.name}`, date: b.d.date, time_valid: b.d.time_valid, league_name: b.d.league_name, sport: "soccer",
    label: b.label, p: b.p, book: null }));
  const prod = legs.reduce((a, l) => a * l.p, 1);
  out.innerHTML = `<section class="sec mp-prop"><h2>${legs.length} ${legs.length === 1 ? "giocata" : "giocate"}<small>quota equa ${odd(prod)}</small></h2>
      <div class="slip-nums"><div>${ring(prod, prod >= .5)}<span>probabilità stimata che escano tutte</span></div><div class="big-odd"><b>${odd(prod)}</b><span>quota equa</span></div></div>
      ${legs.map(it => `<div class="pk mp-leg">${ring(it.p, it.p >= .75)}<a class="pk-txt" href="#/e/${encodeURIComponent(it.event)}"><b>${esc(it.label)}</b>
        <span>${esc(it.match)}, ${esc(fmtDay(it.date).rel || fmtShort(it.date))} ${esc(fmtTime(it.date, it.time_valid))}</span><span class="mp-tr">quota equa ${odd(it.p)}</span></a>${star(favKey(it.label, it.p, null, it))}</div>`).join("")}
      <button type="button" class="btn-main" id="rs-save">Salva come schedina</button>
      <button type="button" class="btn-main alt" id="rs-add">Aggiungi alla schedina in costruzione</button></section>
    ${legs.length < RS.n ? `<p class="note">Solo ${legs.length} partite della giornata hanno già il pronostico: le altre arrivano più avanti.</p>` : ""}
    <p class="note">Per ogni partita la giocata più probabile del tipo scelto, poi le ${RS.n} partite più sicure. Più partite e giocate più difficili (risultato esatto, combo) alzano la quota ma abbassano molto la probabilità. Restano stime, non certezze; il bookmaker paga meno della quota equa.</p>`;
  out.querySelector("#rs-save").onclick = async () => {
    const name = await askText("Nome della schedina", `${(TABLE_LEAGUES.find(([k]) => k === RS.league) || ["", ""])[1]} · giornata ${RS.round}`, { hint: "La ritrovi in Tu, dove l'app segna da sola com'è andata." });
    if (name === null) return;
    saveAsSlip(legs, name.trim() || undefined);
    toast("Schedina salvata: la trovi in Tu");
  };
  out.querySelector("#rs-add").onclick = () => {
    const list = favs();
    for (const it of legs) { const key = `${it.event}|${it.label}`; if (!list.some(f => f.key === key)) list.push({ key, ...it, added: new Date().toISOString() }); }
    saveFavs(list);
    if (typeof showSlipSheet === "function") showSlipSheet();
  };
}

/* ------------------------------------------------------------------ condividi la schedina */

const SHARE_FIELDS = ["event", "match", "date", "league_name", "sport", "label", "p", "book", "time_valid"];
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

async function shareSlip(list) {
  const data = b64urlEncode(JSON.stringify(list.map(f => SHARE_FIELDS.map(k => f[k] ?? null))));
  const url = `${location.origin}${location.pathname}#/condividi/${data}`;
  const text = `La mia schedina (${list.length} ${list.length === 1 ? "giocata" : "giocate"}) su Pronostici`;
  try {
    if (navigator.share) { await navigator.share({ title: "Schedina", text, url }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); toast("Link copiato: incollalo in un messaggio"); }
  catch { askText("Copia questo link", url, { readonly: true, hint: "Tienilo premuto per copiarlo e incollalo in un messaggio." }); }
}

function showShared(data) {
  let list = [];
  try { list = JSON.parse(b64urlDecode(data)).map(a => Object.fromEntries(SHARE_FIELDS.map((k, i) => [k, a[i]]))); } catch { list = []; }
  if (!list.length) { $app.innerHTML = backBtn("Partite") + `<div class="empty"><b>Link non valido</b>Il link della schedina è incompleto o danneggiato.</div>`; return; }
  const now = Date.now();
  const mine = new Set(favs().map(f => f.key));
  const rows = list.map(f => {
    f.key = `${f.event}|${f.label}`;
    const started = new Date(f.date).getTime() <= now;
    const when = `${fmtDay(f.date).rel || fmtShort(f.date)}, ${fmtTime(f.date, f.time_valid)}`;
    return `<div class="pk slip ${started ? "faded" : ""}">${ring(f.p, f.p >= .75)}<a class="pk-txt" href="#/e/${encodeURIComponent(f.event)}"><b>${esc(f.label)}</b>
      <span>${esc(f.match)}</span><span>${esc(f.league_name || "")}, ${esc(when)}${started ? ", già iniziata" : mine.has(f.key) ? ", già nella tua schedina" : ""}</span></a></div>`;
  }).join("");
  const addable = list.filter(f => new Date(f.date).getTime() > now && !mine.has(f.key));
  const prod = list.reduce((a, f) => a * (f.p || 1), 1);
  $app.innerHTML = backBtn("Partite") + `<section class="sec slip-sum"><h2>Schedina condivisa<small>${list.length} ${list.length === 1 ? "giocata" : "giocate"}</small></h2>
    <div class="slip-nums"><div>${ring(prod, prod >= .5)}<span>probabilità che escano tutte</span></div><div class="big-odd"><b>${odd(prod)}</b><span>quota equa della multipla</span></div></div>
    <p class="note">Le percentuali sono quelle del momento in cui è stata salvata: aprendo una partita vedi quelle aggiornate.</p></section>
    <section class="sec">${rows}</section>
    ${addable.length ? `<button type="button" class="btn-main" id="shared-add">Aggiungi ${addable.length === list.length ? "tutte" : `le ${addable.length} ancora da giocare`} alla mia schedina</button>` : `<p class="note">Non c'è niente da aggiungere: sono già nella tua schedina o sono partite già iniziate.</p>`}`;
  const b = document.getElementById("shared-add");
  if (b) b.onclick = () => {
    const cur = favs();
    for (const f of addable) cur.push({ ...f, added: new Date().toISOString() });
    saveFavs(cur);
    toast(`${addable.length} ${addable.length === 1 ? "giocata aggiunta" : "giocate aggiunte"}`);
    location.hash = "#/schedina";
  };
}

/* ------------------------------------------------------------------ schedine salvate */
/* Ogni schedina salvata tiene le sue giocate e, quando le partite finiscono, il loro esito.
   Quota e puntata del sito dove la giochi sono facoltative: servono solo a vedere la vincita possibile. */

function mySlips() { try { return JSON.parse(localStorage.getItem("p_slips") || "[]"); } catch { return []; } }
function saveMySlips(list) {
  try { localStorage.setItem("p_slips", JSON.stringify(list.slice(-60))); } catch { /* niente */ }
  if (typeof notifySync === "function") notifySync();
}

function saveAsSlip(legs, name) {
  const list = mySlips();
  const n = list.length + 1;
  const sl = { id: Date.now().toString(36), name: name || `Schedina ${n}`, created: new Date().toISOString(),
    legs: legs.map(f => ({ key: f.key || `${f.event}|${f.label}`, event: f.event, match: f.match, date: f.date, time_valid: f.time_valid,
      league_name: f.league_name, sport: f.sport, label: f.label, p: f.p, book: f.book ?? null })) };
  list.push(sl);
  saveMySlips(list);
  return sl;
}

function slipState(sl) {
  if (sl.legs.some(f => f.result === "lose")) return { cls: "lose", txt: "Persa" };
  if (sl.legs.every(f => f.result === "win")) return { cls: "win", txt: "Vinta" };
  const now = Date.now();
  if (sl.legs.some(f => new Date(f.date).getTime() <= now)) return { cls: "on", txt: "In corso" };
  return { cls: sl.played ? "played" : "", txt: sl.played ? "Giocata" : "Da giocare" };
}

/* giocata chiusa: risultato finale e una frase chiara (presa / persa e perché) */
function closedLegHtml(f) {
  let score = f.final_score;
  if (!score) {     // giocate chiuse prima di questa versione: il risultato si prende dall'elenco o dagli esiti già visti
    const e = INDEX?.events.find(x => x.id === f.event), fin = e?.final || (typeof phoneFinals === "function" ? phoneFinals()[f.event] : null);
    if (fin && !fin.void) score = fin.sets ? fin.sets[0].map((g, i) => `${g}-${fin.sets[1][i]}`).join(" ") : `${fin.h}-${fin.a}`;
  }
  let why = f.result_why;
  if (why == null && f.result === "lose") {     // ricostruisce il perché per le giocate vecchie, quando si può
    try {
      const e = INDEX?.events.find(x => x.id === f.event), fin = e?.final || phoneFinals()[f.event];
      if (e && fin && !fin.sets && e.sport !== "tennis") {
        const info = { sport: e.sport, state: "post", H: fin.h, A: fin.a, home: { name: e.home }, away: { name: e.away }, players: {}, stats: {} };
        const s = pickStatus(f.label, info);
        if (s) why = closedFields({ ...s, _info: info }, f).result_why;
      }
    } catch { /* niente */ }
  }
  const win = f.result === "win";
  const say = win ? "✓ Presa" : `✗ Persa${why ? `: ${why}` : ""}`;
  return `<span class="slip-live lvw ${f.result}"><span class="lv2"><span class="lv-min done">Finita</span>${score ? `<b class="lv-score">${esc(score)}</b>` : ""}</span><span class="lv-say ${f.result}">${esc(say)}</span></span>`;
}

let SLIP_KEEP_OPEN = null;   // schedina appena modificata: resta aperta dopo il ridisegno
function slipCard(sl) {
  const st = slipState(sl), prod = sl.legs.reduce((a, f) => a * f.p, 1), now = Date.now();
  const won = sl.legs.filter(f => f.result === "win").length;
  const quota = sl.odds ? Number(sl.odds) : null, stake = sl.stake ? Number(sl.stake) : null;
  const leg = f => {
    const when = `${fmtDay(f.date).rel || fmtShort(f.date)}, ${fmtTime(f.date, f.time_valid)}`;
    const res = f.result ? closedLegHtml(f)
      : new Date(f.date).getTime() <= now && now - new Date(f.date).getTime() < 4 * 864e5 ? `<span class="slip-live" data-slip-event="${esc(f.event)}" data-slip-label="${esc(f.label)}">Controllo com'è andata…</span>` : "";
    return `<div class="pk slip">${ring(f.p, f.p >= .75)}<a class="pk-txt" href="#/e/${encodeURIComponent(f.event)}"><b>${esc(f.label)}</b><span>${esc(f.match)}, ${esc(when)}</span>${res}</a></div>`;
  };
  return `<details class="sec saved-slip st-${st.cls}" data-slip-id="${esc(sl.id)}" ${st.cls === "on" || sl.id === SLIP_KEEP_OPEN ? "open" : ""}>
    <summary><span class="ss-badge ${st.cls}">${st.txt}</span><b>${esc(sl.name)}</b>
      <small>${sl.legs.length} giocate · ${won ? `${won} prese · ` : ""}quota equa ${odd(prod)}${quota ? ` · sul sito ${num(quota, 2)}` : ""}${sl.played && stake ? ` · puntati ${num(stake, 2)} €` : ""}</small></summary>
    ${st.cls === "on" ? `<div class="ss-chance" data-slip-chance="${esc(sl.id)}" hidden></div>` : ""}
    ${sl.legs.map(leg).join("")}
    ${quota && stake && (sl.played || ["win", "lose"].includes(st.cls)) ? slipTicket(quota, stake, st.cls) : ""}
    <div class="ss-play" ${quota && stake && (sl.played || ["win", "lose"].includes(st.cls)) ? "hidden" : ""}>
      <p class="ss-play-h">${sl.played ? "✓ Hai segnato di averla giocata" : "L'app non scommette: la giochi sul tuo sito, poi qui segni quota e puntata per tenere il conto."}</p>
      <div class="ss-money"><label>Quota sul sito <input type="text" inputmode="decimal" data-ss-odds value="${quota ? String(quota).replace(".", ",") : ""}" placeholder="es. 3,50"></label>
        <label>Puntata € <input type="text" inputmode="decimal" data-ss-stake value="${stake ? String(stake).replace(".", ",") : ""}" placeholder="es. 5"></label></div>
      <p class="note ss-calc" data-ss-calc data-prod="${prod}" data-st="${st.cls}">${slipMoneyText(quota, stake, prod, st.cls)}</p>
      ${["win", "lose"].includes(st.cls) ? "" : `<button type="button" class="btn-main ${sl.played ? "alt" : ""}" data-ss-play>${sl.played ? "Aggiorna quota e puntata" : "✓ Segna come giocata"}</button>`}
    </div>
    <div class="ss-acts"><button type="button" class="link-btn" data-ss-replay>🔁 Rigioca</button><button type="button" class="link-btn" data-ss-share>Condividi link</button><button type="button" class="link-btn" data-ss-img>Immagine</button><button type="button" class="link-btn" data-ss-rename>Rinomina</button><button type="button" class="link-btn danger" data-ss-del>Elimina</button></div>
  </details>`;
}

/* schedina giocata: tre numeri in riga (quota, puntata, vincita) e «Modifica» per riaprire i campi */
function slipTicket(quota, stake, cls) {
  const win = quota * stake;
  const third = cls === "win" ? ["Vinti", `${num(win, 2)} €`] : cls === "lose" ? ["Persi", `${num(stake, 2)} €`] : ["Vincita", `${num(win, 2)} €`];
  return `<div class="ss-ticket ${cls}"><span><small>Quota</small><b>${num(quota, 2)}</b></span><span><small>Puntata</small><b>${num(stake, 2)} €</b></span>
    <span class="ss-win"><small>${third[0]}</small><b>${third[1]}</b></span>${["win", "lose"].includes(cls) ? "" : `<button type="button" class="link-btn" data-ss-edit>Modifica</button>`}</div>`;
}

/* testo sotto quota e puntata: vincita possibile e confronto con la quota equa del modello (si aggiorna mentre scrivi) */
function slipMoneyText(quota, stake, prod, cls) {
  if (!quota && !stake) return "Scrivi la quota che ti dà il sito e quanto punti.";
  const parts = [];
  if (quota && stake) parts.push(cls === "win" ? `Vincita: <b>${num(quota * stake, 2)} €</b>.` : cls === "lose" ? `Persi ${num(stake, 2)} €.` : `Vincita possibile: <b>${num(quota * stake, 2)} €</b> (guadagno ${num(quota * stake - stake, 2)} €).`);
  if (quota && prod) parts.push(`Il modello la stima al ${pct(prod)}, quota equa ${odd(prod)}: ${quota > 1 / prod ? "il sito paga <b>più</b> della quota equa." : "il sito paga <b>meno</b> della quota equa."}`);
  return parts.join(" ");
}

function slipsSection() {
  const list = mySlips().slice().reverse();
  if (!list.length) return `<section class="sec"><h2>Le mie schedine</h2><p class="note">Qui finiscono le schedine che salvi: componi una schedina con le stelle (o dal generatore di multiple), tocca "Salva come schedina" e la ritrovi qui. Quando le partite finiscono, l'app segna da sola se è vinta o persa.</p></section>`;
  const open = list.filter(s => !["win", "lose"].includes(slipState(s).cls)), done = list.filter(s => ["win", "lose"].includes(slipState(s).cls));
  const w = done.filter(s => slipState(s).cls === "win").length;
  let money = "";
  const withMoney = done.filter(s => s.odds && s.stake);
  if (withMoney.length) {
    const spent = withMoney.reduce((a, s) => a + Number(s.stake), 0), back = withMoney.filter(s => slipState(s).cls === "win").reduce((a, s) => a + Number(s.stake) * Number(s.odds), 0);
    money = `<p class="note">${withMoney.length === 1 ? "Sull'unica schedina chiusa" : `Sulle ${withMoney.length} schedine chiuse`} con quota e puntata: giocati ${num(spent, 2)} €, vinti ${num(back, 2)} €, ${back - spent >= 0 ? "in attivo di" : "in passivo di"} <b>${num(Math.abs(back - spent), 2)} €</b>.</p>`;
  }
  return `<h2 class="day">Le mie schedine</h2>${open.map(slipCard).join("")}
    ${done.length ? `<h2 class="day">Schedine chiuse<span>${w} ${w === 1 ? "vinta" : "vinte"} su ${done.length}</span></h2>${money}${done.map(slipCard).join("")}` : ""}`;
}

function wireSlips() {
  document.querySelectorAll("[data-slip-id]").forEach(card => {
    const id = card.dataset.slipId;
    const upd = fn => { const list = mySlips(); const sl = list.find(s => s.id === id); if (sl) { fn(sl, list); saveMySlips(list); } };
    const val = el => { const v = parseFloat(String(el.value).replace(",", ".")); return isFinite(v) && v > 0 ? v : null; };
    const oi = card.querySelector("[data-ss-odds]"), si = card.querySelector("[data-ss-stake]"), calc = card.querySelector("[data-ss-calc]");
    // il conto si aggiorna mentre scrivi; si salva uscendo dal campo o con il pulsante
    const live = () => { if (calc) calc.innerHTML = slipMoneyText(oi && val(oi), si && val(si), Number(calc.dataset.prod), calc.dataset.st); };
    oi?.addEventListener("input", live); si?.addEventListener("input", live);
    oi?.addEventListener("change", e => upd(sl => sl.odds = val(e.target)));
    si?.addEventListener("change", e => upd(sl => sl.stake = val(e.target)));
    card.querySelector("[data-ss-play]")?.addEventListener("click", () => {
      const q = oi && val(oi), s = si && val(si);
      if (!q || !s) { toast(!q ? "Scrivi la quota che ti dà il sito (es. 3,50)" : "Scrivi quanto hai puntato (es. 5)"); (!q ? oi : si)?.focus(); return; }
      upd(sl => { sl.odds = q; sl.stake = s; sl.played = new Date().toISOString(); });
      SLIP_KEEP_OPEN = id;
      toast(`Segnata come giocata: ${num(s, 2)} € a quota ${num(q, 2)}`);
      refreshSlips();
    });
    card.querySelector("[data-ss-edit]")?.addEventListener("click", () => {
      card.querySelector(".ss-ticket")?.remove();
      const box = card.querySelector(".ss-play"); if (box) { box.hidden = false; oi?.focus(); }
    });
    card.querySelector("[data-ss-replay]")?.addEventListener("click", () => replaySlip(id));
    card.querySelector("[data-ss-share]")?.addEventListener("click", () => { const sl = mySlips().find(s => s.id === id); if (sl) shareSlip(sl.legs); });
    card.querySelector("[data-ss-img]")?.addEventListener("click", () => { const sl = mySlips().find(s => s.id === id); if (sl) shareSlipImage(sl.legs, sl.name); });
    card.querySelector("[data-ss-rename]")?.addEventListener("click", async () => { const n = await askText("Nome della schedina", mySlips().find(s => s.id === id)?.name || ""); if (n) { upd(sl => sl.name = n.trim().slice(0, 40)); refreshSlips(); } });
    card.querySelector("[data-ss-del]")?.addEventListener("click", async () => { if (await askConfirm("Non si potrà recuperare.", { title: "Eliminare questa schedina?", ok: "Sì, elimina", danger: true })) { saveMySlips(mySlips().filter(s => s.id !== id)); refreshSlips(); } });
  });
}

function refreshSlips() { if (location.hash.startsWith("#/tu")) showMe(); else showSlip(); }

/* ------------------------------------------------------------------ rigioca una schedina salvata */
/* Per ogni giocata: se la partita non è ancora iniziata si rimette uguale; se è già giocata si cerca la prossima partita
   delle stesse squadre (prima con entrambe, poi con una delle due) e la stessa giocata, con la probabilità nuova. */
async function replayCandidate(f) {
  const now = Date.now();
  if (Date.parse(f.date) > now) return { ...f, same: true };
  const [hn, an] = String(f.match || "").split(" – ");
  const up = (INDEX?.events || []).filter(e => e.sport === f.sport && !e.final && Date.parse(e.date) > now).sort((a, b) => a.date.localeCompare(b.date));
  const has = (e, n) => n && (e.home === n || e.away === n);
  const cands = [...up.filter(e => has(e, hn) && has(e, an)), ...up.filter(e => (has(e, hn) || has(e, an)) && !(has(e, hn) && has(e, an)))];
  for (const e of cands.slice(0, 3)) {
    let d = null;
    try { d = await getJSON(`data/events/${encodeURIComponent(e.id)}.json`); } catch { d = null; }
    if (!d) continue;
    let p = null;
    if (d.sport === "soccer") p = (rsCands(d, "mix").concat(rsCands(d, "exact"))).find(c => c.label === f.label)?.p ?? null;
    else if (/ vince$/.test(f.label) && d.main) {
      const who = f.label.replace(/ vince$/, "");
      p = [d.home.short, d.home.name].includes(who) ? d.main[0] : [d.away.short, d.away.name].includes(who) ? d.main[d.main.length - 1] : null;
    }
    if (p != null) return { event: d.id, match: `${d.home.name} – ${d.away.name}`, date: d.date, time_valid: d.time_valid, league_name: d.league_name,
      sport: d.sport, label: f.label, p, book: null, same: false,
      via: has(e, hn) && has(e, an) ? "stesse squadre" : `prossima di ${has(e, hn) ? hn : an}` };
  }
  return null;
}

async function replaySlip(id) {
  const sl = mySlips().find(s => s.id === id);
  if (!sl) return;
  const { el, close } = openSheet(`<h3 class="sheet-t">Rigioca «${esc(sl.name)}»</h3><p class="sheet-p">Cerco le partite…</p>`, { label: "Rigioca la schedina" });
  const found = await Promise.all(sl.legs.map(f => replayCandidate(f).catch(() => null)));
  const rows = sl.legs.map((f, i) => { const c = found[i];
    return `<label class="rp-row ${c ? "" : "off"}"><input type="checkbox" data-rp="${i}" ${c ? "checked" : "disabled"}>
      <span class="rp-t"><b>${esc(f.label)}</b>${c ? `<small>${c.same ? "stessa partita" : esc(c.via)}: ${esc(c.match)}, ${esc(fmtDay(c.date).rel || fmtShort(c.date))} ${esc(fmtTime(c.date, c.time_valid))}</small>`
        : `<small>${esc(f.match)}: già giocata, nessuna partita in programma con la stessa giocata</small>`}</span>
      ${c ? `<span class="rp-p">${pct(c.p)}${!c.same && c.p !== f.p ? `<small>era ${pct(f.p)}</small>` : ""}</span>` : ""}</label>`; }).join("");
  el.innerHTML = `<div class="sheet-grip" aria-hidden="true"></div><h3 class="sheet-t">Rigioca «${esc(sl.name)}»</h3>
    <p class="sheet-p">Scegli le giocate da rimettere nella schedina. Quelle già giocate passano alla prossima partita delle stesse squadre, con la probabilità aggiornata.</p>
    <div class="rp-list">${rows}</div><p class="sheet-p" id="rp-sum"></p>
    <div class="sheet-acts"><button type="button" class="btn-main alt" data-no>Annulla</button><button type="button" class="btn-main" data-yes>Metti nella schedina</button></div>`;
  const sum = () => { const sel = [...el.querySelectorAll("[data-rp]:checked")].map(b => found[+b.dataset.rp]);
    el.querySelector("#rp-sum").innerHTML = sel.length ? `${sel.length} ${sel.length === 1 ? "giocata" : "giocate"} · quota equa <b>${odd(sel.reduce((a, c) => a * c.p, 1))}</b>` : "Nessuna giocata scelta";
    el.querySelector("[data-yes]").disabled = !sel.length; };
  el.querySelectorAll("[data-rp]").forEach(b => b.onchange = sum);
  sum();
  el.querySelector("[data-no]").onclick = close;
  el.querySelector("[data-yes]").onclick = () => {
    const list = favs();
    for (const b of el.querySelectorAll("[data-rp]:checked")) {
      const { same, via, ...c } = found[+b.dataset.rp];
      const key = `${c.event}|${c.label}`;
      if (!list.some(x => x.key === key)) list.push({ key, ...c, result: undefined, added: new Date().toISOString() });
    }
    saveFavs(list);
    close();
    toast("Giocate rimesse nella schedina");
    if (typeof showSlipSheet === "function") setTimeout(showSlipSheet, 250);
  };
}
