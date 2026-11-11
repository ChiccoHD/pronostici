"use strict";
/* Pronostici — costruisci la multipla e condividi la schedina. Usa funzioni di app.js. */

/* ------------------------------------------------------------------ costruisci la multipla */

const MP = { target: Number(load("mp_target", "3")), sport: load("mp_sport", "all"), when: load("mp_when", "2") };
const MP_TARGETS = [1.5, 2, 3, 5, 10];
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
      const score = miss * 3 + (1 - c.tr);
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
    <section class="sec mp-ctrl">
      <div class="mp-lab">Quota che vuoi raggiungere</div><div class="mp-chips">${MP_TARGETS.map(t => chip("target", t, odd(1 / t), MP.target)).join("")}</div>
      <div class="mp-lab">Sport</div><div class="mp-chips">${SPORTS.map(s => chip("sport", s.key, s.label, MP.sport)).join("")}</div>
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
      <button type="button" class="btn-main" data-mp-add="${i}">Aggiungi tutte alla schedina</button></section>`;
  });
  html += `<p class="note">A parità di quota la probabilità stimata è sempre la stessa (circa 1 diviso la quota), qualunque giocate contenga: per questo le proposte scelgono, tra le giocate della classifica Migliori su partite diverse, quelle su cui il modello è più solido, cioè d'accordo con i bookmaker e con abbastanza dati. Meno giocate vuol dire meno errori del modello che si sommano. Restano stime, non certezze, e il bookmaker paga meno della quota equa.</p>`;
  $app.innerHTML = html;
  $app.querySelectorAll("[data-mp]").forEach(b => b.onclick = () => {
    const g = b.dataset.mp; MP[g] = g === "target" ? Number(b.dataset.v) : b.dataset.v; save("mp_" + g, b.dataset.v); showMultipla();
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
    toast(n ? `${n} ${n === 1 ? "giocata aggiunta" : "giocate aggiunte"} alla schedina` : "Erano già tutte nella schedina");
    showMultipla();
  });
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
  catch { prompt("Copia questo link:", url); }
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
