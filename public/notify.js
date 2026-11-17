"use strict";
/* Pronostici — notifiche delle partite (pagina Tu). Il telefono si iscrive con il service worker (sw.js);
   il Worker di Cloudflare (worker/push.js) controlla ogni minuto le partite e manda gli avvisi.
   Le scelte restano sul telefono (p_notif) e vengono mandate al Worker con le partite "mie":
   stelline, schedine salvate, squadre e tennisti seguiti. */

const NOTIF_KEY = "p_notif";
const NOTIF_DEFAULT = {
  soccer: { on: true, mode: "mine", start: false, goal: true, red: true, yellow: true, corner: false, ht: true, second: true, end: true },
  nba: { on: true, mode: "mine", start: false, quarter: true, qstart: false, end: true },
  tennis: { on: true, mode: "mine", start: false, game: false, set: true, setstart: false, end: true },
  general: { on: true, slips: true, lineup: true, gap: true, daily: false },
};
const NOTIF_OPTS = {
  soccer: ["Calcio", [["start", "Inizio partita"], ["goal", "Gol"], ["red", "Espulsioni"], ["ht", "Fine primo tempo"], ["end", "Fine partita"]]],
  nba: ["Basket NBA", [["start", "Inizio partita"], ["quarter", "Fine di ogni quarto"], ["end", "Fine partita"]]],
  tennis: ["Tennis", [["start", "Inizio incontro"], ["set", "Fine di ogni set"], ["game", "Fine di ogni game (tante notifiche)"], ["end", "Fine incontro"]]],
};

const NT_ICON = { soccer: ["⚽", "#16a34a"], nba: ["🏀", "#ea7a1a"], tennis: ["🎾", "#c3cc1f"], general: ["🔔", "#8b5cf6"] };
/* "Essenziali": quello che serve senza riempire il telefono */
const NT_ESSENTIAL = { soccer: ["goal", "red", "ht", "end"], nba: ["quarter", "end"], tennis: ["set", "end"], general: ["slips", "lineup"] };
function ntSummary(sp, p) {
  const opts = NT_SHORT[sp][1], on = opts.filter(([k]) => p.on && p[k]);
  if (!on.length) return "spenti";
  if (on.length === opts.length) return "tutti";
  return on.map(([, l]) => l).join(", ");
}

/* partite seguite con la campanella: solo per queste (e per squadre e tennisti seguiti) arrivano gli avvisi */
const FOLLOW_KEY = "p_follow";
function followed() {
  let l = [];
  try { l = JSON.parse(localStorage.getItem(FOLLOW_KEY) || "[]"); } catch { /* niente */ }
  const lim = Date.now() - 2 * 86400e3;          // le partite di più di due giorni fa escono da sole
  return l.filter(x => Date.parse(x.date) > lim);
}
const isFollowed = id => followed().some(x => x.id === id);
function toggleFollow(ev) {
  let l = followed();
  const on = !l.some(x => x.id === ev.id);
  l = on ? [...l, { id: ev.id, sport: ev.sport, date: ev.date, match: `${ev.home} – ${ev.away}`, league_name: ev.league_name || "" }] : l.filter(x => x.id !== ev.id);
  try { localStorage.setItem(FOLLOW_KEY, JSON.stringify(l.slice(-200))); } catch { /* niente */ }
  document.querySelectorAll(`[data-bell="${CSS.escape(ev.id)}"]`).forEach(b => setBell(b, on));
  const active = notifState().on;
  toast(on ? (active ? "Partita seguita: riceverai gli avvisi" : "Partita seguita. Attiva le notifiche in Tu per ricevere gli avvisi") : "Non segui più questa partita");
  notifySync();
  return on;
}
const BELL_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>`;
function setBell(b, on) {
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
  const t = b.querySelector(".bell-t");
  if (t) t.textContent = on ? "Seguita" : "Segui";
}
/* campanella: piccola nell'elenco, con scritta nella scheda della partita */
function bellBtn(e, small = false) {
  if (e.final || (e.date && Date.now() - Date.parse(e.date) > (e.sport === "tennis" ? 24 : 5) * 3600e3)) return "";
  const on = isFollowed(e.id);
  const data = esc(JSON.stringify({ id: e.id, sport: e.sport, date: e.date, home: e.home, away: e.away, league_name: e.league_name }));
  return `<button type="button" class="bell ${small ? "sm" : ""} ${on ? "on" : ""}" data-bell="${esc(e.id)}" data-ev='${data}' aria-pressed="${on}" aria-label="Avvisami per questa partita">${BELL_SVG}${small ? "" : `<span class="bell-t">${on ? "Seguita" : "Segui"}</span>`}</button>`;
}
document.addEventListener("click", ev => {
  const b = ev.target.closest("[data-bell]");
  if (!b) return;
  ev.preventDefault();
  ev.stopPropagation();
  try { toggleFollow(JSON.parse(b.dataset.ev)); } catch { /* niente */ }
  if (location.hash.startsWith("#/tu")) showMe();
}, true);

function notifState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}"); } catch { /* niente */ }
  const prefs = {};
  for (const k of Object.keys(NOTIF_DEFAULT)) prefs[k] = { ...NOTIF_DEFAULT[k], ...(s.prefs?.[k] || {}) };
  for (const k of Object.keys(prefs)) prefs[k].mode = "mine";      // gli avvisi arrivano solo per ciò che scegli
  return { on: !!s.on, prefs, slips: !!s.slips };
}
function saveNotif(s) { try { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); } catch { /* niente */ } }

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function b64uToBytes(s) {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(t, c => c.charCodeAt(0));
}

/* partite per cui mandare avvisi: quelle seguite con la campanella, delle squadre e dei tennisti seguiti
   e, solo se lo scegli, quelle delle schedine salvate */
function notifMine() {
  const ev = new Set(followed().map(x => x.id));
  if (notifState().slips && typeof mySlips === "function") for (const s of mySlips()) for (const l of s.legs || []) if (!l.result && l.event) ev.add(l.event);
  const teams = typeof myTeams === "function" ? myTeams().flatMap(t => [t.name, t.short]).filter(Boolean) : [];
  // schedine salvate ancora aperte: il server avvisa quando sono vinte o perse
  const slips = typeof mySlips === "function" ? mySlips().filter(sl => !["win", "lose"].includes(slipState(sl).cls))
    .map(sl => ({ id: sl.id, name: sl.name, odds: sl.odds || null, legs: sl.legs.map(l => ({ event: l.event, label: l.label })) })) : [];
  return { events: [...ev].slice(-600), teams: [...new Set(teams)], slips };
}

async function pushPost(path, body) {
  const r = await fetch(`/api/push/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `errore ${r.status}`);
  return j;
}
async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function syncNotifs() {
  const s = notifState();
  if (!s.on || !pushSupported() || Notification.permission !== "granted") return;
  try {
    const sub = await currentSub();
    if (!sub) { saveNotif({ ...s, on: false }); return; }
    await pushPost("sub", { sub: sub.toJSON(), prefs: s.prefs, mine: notifMine() });
  } catch (e) { console.warn("Notifiche:", e); }
}
let notifTimer = null;
function notifySync() { clearTimeout(notifTimer); notifTimer = setTimeout(syncNotifs, 1500); }

async function enableNotifs() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "bloccate" : "non concesse");
  const reg = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  const { key } = await fetch("/api/push/key").then(r => { if (!r.ok) throw new Error("servizio non raggiungibile"); return r.json(); });
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
  const s = notifState();
  saveNotif({ ...s, on: true });
  await pushPost("sub", { sub: sub.toJSON(), prefs: s.prefs, mine: notifMine() });
}
async function disableNotifs() {
  const sub = await currentSub().catch(() => null);
  if (sub) { await pushPost("unsub", { sub: sub.toJSON() }).catch(() => null); await sub.unsubscribe().catch(() => null); }
  saveNotif({ ...notifState(), on: false });
}

/* riquadro nella pagina Tu (in fondo) */
const NT_SHORT = {
  soccer: ["Calcio", [["start", "Inizio"], ["goal", "Gol"], ["yellow", "Ammonizioni"], ["red", "Espulsioni"], ["corner", "Calci d'angolo"], ["ht", "Fine 1° tempo"], ["second", "Inizio 2° tempo"], ["end", "Risultato finale"]]],
  nba: ["Basket", [["start", "Inizio"], ["qstart", "Inizio di ogni quarto"], ["quarter", "Fine di ogni quarto"], ["end", "Risultato finale"]]],
  tennis: ["Tennis", [["start", "Inizio"], ["setstart", "Inizio di ogni set"], ["set", "Fine di ogni set"], ["game", "Ogni game"], ["end", "Risultato finale"]]],
  general: ["Altri avvisi", [["slips", "Esito delle schedine salvate"], ["lineup", "Formazioni ufficiali"], ["gap", "Modello lontano dalle quote"], ["daily", "Le migliori di oggi (ore 9)"]]],
};
function notifSection() {
  const s = notifState();
  const can = pushSupported() && !(isIOS() && !standalone()) && Notification.permission !== "denied";
  const on = s.on && can;
  const how = `<div class="nt-how">
      <div class="nt-how-r"><span class="nt-ic bell-ic">${BELL_SVG}</span><span><b>Una partita</b>tocca la campanella accanto alla partita, nell'elenco o nella sua scheda</span></div>
      <div class="nt-how-r"><span class="nt-ic">★</span><span><b>Una squadra o un tennista</b>tocca <i>Segui</i> nella sua pagina: avvisi per tutte le sue partite</span></div>
    </div>`;
  let body = "";
  if (isIOS() && !standalone()) {
    body = `<p class="note">Su iPhone e iPad le notifiche funzionano solo con l'app sulla schermata Home (iOS 16.4 o più recente): in Safari tocca <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>, poi apri Pronostici dall'icona e torna qui.</p>`;
  } else if (!pushSupported()) {
    body = `<p class="note">Questo browser non riceve notifiche. Prova con Chrome, Edge, Firefox o Samsung Internet.</p>`;
  } else if (Notification.permission === "denied") {
    body = `<p class="note">Le notifiche di questo sito sono bloccate dal telefono. Sbloccale dalle impostazioni del browser (lucchetto accanto all'indirizzo → Notifiche → Consenti), poi torna qui.</p>`;
  }
  if (!body) {
    const fl = followed().sort((a, b) => a.date.localeCompare(b.date));
    const teams = typeof myTeams === "function" ? myTeams() : [];
    const list = fl.length
      ? fl.map(x => `<div class="nt-f"><span class="nt-ic bell-ic on">${BELL_SVG}</span><span class="nt-f-t"><b>${esc(x.match)}</b><small>${esc(fmtDay(x.date).label)}, ${esc(fmtTime(x.date))}${x.league_name ? ` · ${esc(x.league_name)}` : ""}</small></span>
          <button type="button" class="me-x" data-bell="${esc(x.id)}" data-ev='${esc(JSON.stringify({ id: x.id }))}' aria-label="Smetti di seguire ${esc(x.match)}">×</button></div>`).join("")
      : `<p class="note" style="margin:4px 0">Nessuna partita: tocca una campanella per aggiungerla.</p>`;
    // cosa ti avviso: un riquadro per sport, le scelte si aprono in una finestra dal basso
    const tile = sp => {
      const [title, opts] = NT_SHORT[sp], p = s.prefs[sp], [ic, c] = NT_ICON[sp];
      const n = opts.filter(([k]) => p.on && p[k]).length;
      return `<button type="button" class="nt-tile ${n ? "" : "off"}" data-nt-open="${sp}" style="--ic:${c}">
        <span class="nt-tile-ic">${ic}</span><span class="nt-tile-t"><b>${title}</b><small>${esc(ntSummary(sp, p))}</small></span>
        <span class="nt-tile-n">${n}<small>/${opts.length}</small></span></button>`;
    };
    const who = [...fl.map(x => ({ t: "match", x })), ...teams.map((t, i) => ({ t: "team", x: t, i }))];
    body = `<h3 class="lb-h3">Cosa ti avviso</h3><div class="nt-grid">${Object.keys(NT_SHORT).map(tile).join("")}</div>
      <h3 class="lb-h3">Per chi <span class="faint">${who.length || ""}</span></h3>
      <div class="nt-who">${who.length ? who.map(w => w.t === "match"
        ? `<span class="nt-pill"><span class="bell-ic on">${BELL_SVG}</span><span><b>${esc(w.x.match)}</b><small>${esc(fmtDay(w.x.date).label)}, ${esc(fmtTime(w.x.date))}</small></span>
            <button type="button" data-bell="${esc(w.x.id)}" data-ev='${esc(JSON.stringify({ id: w.x.id }))}' aria-label="Smetti di seguire ${esc(w.x.match)}">×</button></span>`
        : `<span class="nt-pill">${w.x.logo ? img(w.x.logo, w.x.kind === "player" ? "tflag" : "tlogo") : "★"}<span><b>${esc(w.x.short || w.x.name)}</b><small>tutte le partite</small></span>
            <button type="button" data-unfollow="${w.i}" aria-label="Smetti di seguire ${esc(w.x.name)}">×</button></span>`).join("")
        : `<p class="note" style="margin:2px 0">Ancora nessuno.</p>`}</div>
      <details class="nt-howto"><summary>Come scelgo per chi?</summary>${how}</details>
      <label class="nt-line"><span>Anche le partite delle schedine salvate</span><input type="checkbox" class="switch" id="nt-slips" ${s.slips ? "checked" : ""}></label>
      ${on ? `<p class="note">Gli avvisi arrivano anche ad app chiusa, entro circa un minuto. <button type="button" class="linklike" id="nt-test">Manda una notifica di prova</button></p>` : ""}`;
  }
  const head = `<div class="nt-top ${on ? "on" : ""}"><span class="nt-top-ic">${BELL_SVG}</span><div><b>${on ? "Notifiche attive" : "Notifiche spente"}</b><span>${on ? "Solo per le partite, le squadre e i tennisti che scegli tu." : "Attivale per ricevere gol, set e risultati di quello che segui."}</span></div>
    ${can ? `<input type="checkbox" class="switch big" id="nt-master" ${on ? "checked" : ""} aria-label="Notifiche">` : ""}</div>`;
  return sec(`${typeof meIc === "function" ? meIc("🔔", "#8b5cf6") : ""}Notifiche`, `<div class="nt ${on ? "" : "is-off"}">${head}${body}<p class="nt-msg" id="nt-msg" role="status"></p></div>`, "", "Tu notifiche");
}

function wireNotifs() {
  const msg = t => { const m = document.getElementById("nt-msg"); if (m) m.textContent = t; };
  const redraw = () => { if (location.hash.startsWith("#/tu")) { const y = window.scrollY; showMe(); window.scrollTo(0, y); } };
  document.getElementById("nt-master")?.addEventListener("change", async ev => {
    const want = ev.target.checked;
    ev.target.disabled = true;
    msg(want ? "Attivo…" : "");
    try {
      if (want) { await enableNotifs(); toast("Notifiche attive"); }
      else { await disableNotifs(); toast("Notifiche spente"); }
      redraw();
    } catch (e) { ev.target.checked = !want; ev.target.disabled = false; msg(`Non riesco ad attivarle: ${e.message}.`); }
  });
  document.getElementById("nt-test")?.addEventListener("click", async () => {
    msg("Invio…");
    try { const sub = await currentSub(); if (!sub) throw new Error("iscrizione persa: spegni e riaccendi");
      const r = await pushPost("test", { sub: sub.toJSON() }); msg(r.ok ? "Inviata: dovrebbe arrivare tra qualche secondo." : `Il servizio push ha risposto ${r.code}.`); }
    catch (e) { msg(`Prova non riuscita: ${e.message}.`); }
  });
  document.querySelectorAll("[data-nt-open]").forEach(b => b.addEventListener("click", () => ntSheet(b.dataset.ntOpen, redraw)));
  document.querySelectorAll(".nt-chip[data-nt]").forEach(b => b.addEventListener("click", () => {
    const [sp, k] = b.dataset.nt.split("."), s = notifState();
    const val = b.getAttribute("aria-pressed") !== "true";
    s.prefs[sp][k] = val;
    s.prefs[sp].on = NT_SHORT[sp][1].some(([x]) => s.prefs[sp][x]);     // nessun avviso scelto = sport spento
    if (val) s.prefs[sp].on = true;
    saveNotif(s);
    b.setAttribute("aria-pressed", String(val));
    notifySync();
  }));
  document.getElementById("nt-slips")?.addEventListener("change", ev => { saveNotif({ ...notifState(), slips: ev.target.checked }); notifySync(); });
}

/* scelte di uno sport, in una finestra dal basso: interruttori uno sotto l'altro e due scorciatoie */
function ntSheet(sp, after) {
  const [title, opts] = NT_SHORT[sp], [ic, c] = NT_ICON[sp];
  const p = () => notifState().prefs[sp];
  const rows = () => opts.map(([k, l]) => `<label class="nt-opt"><span>${l}${NT_ESSENTIAL[sp].includes(k) ? "" : ""}</span><input type="checkbox" class="switch" data-nt-k="${k}" ${p().on && p()[k] ? "checked" : ""}></label>`).join("");
  const { el, close } = openSheet(`<div class="nt-sh-h" style="--ic:${c}"><span class="nt-tile-ic">${ic}</span><h3 class="sheet-t">${title}</h3></div>
    <div class="nt-presets"><button type="button" data-pre="ess">Essenziali</button><button type="button" data-pre="all">Tutti</button><button type="button" data-pre="none">Nessuno</button></div>
    <div class="nt-opts">${rows()}</div>
    <button type="button" class="btn-main" data-done style="width:100%;margin-top:12px">Fatto</button>`, { label: `Notifiche ${title}`, onClose: after });
  const apply = keys => {
    const s = notifState();
    for (const [k] of opts) s.prefs[sp][k] = keys.includes(k);
    s.prefs[sp].on = keys.length > 0;
    saveNotif(s); notifySync();
    el.querySelectorAll("[data-nt-k]").forEach(i => { i.checked = keys.includes(i.dataset.ntK); });
  };
  el.querySelectorAll("[data-nt-k]").forEach(i => i.addEventListener("change", () =>
    apply([...el.querySelectorAll("[data-nt-k]")].filter(x => x.checked).map(x => x.dataset.ntK))));
  el.querySelector('[data-pre="ess"]').onclick = () => apply(NT_ESSENTIAL[sp]);
  el.querySelector('[data-pre="all"]').onclick = () => apply(opts.map(([k]) => k));
  el.querySelector('[data-pre="none"]').onclick = () => apply([]);
  el.querySelector("[data-done]").onclick = () => close();
}

// all'apertura dell'app: rinnova l'iscrizione con le partite "mie" aggiornate
if (notifState().on) setTimeout(syncNotifs, 3000);
