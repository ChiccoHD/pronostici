"use strict";
/* Pronostici — notifiche delle partite (pagina Tu). Il telefono si iscrive con il service worker (sw.js);
   il Worker di Cloudflare (worker/push.js) controlla ogni minuto le partite e manda gli avvisi.
   Le scelte restano sul telefono (p_notif) e vengono mandate al Worker con le partite "mie":
   stelline, schedine salvate, squadre e tennisti seguiti. */

const NOTIF_KEY = "p_notif";
const NOTIF_DEFAULT = {
  soccer: { on: true, mode: "mine", start: false, goal: true, red: true, ht: true, end: true },
  nba: { on: true, mode: "mine", start: false, quarter: true, end: true },
  tennis: { on: true, mode: "mine", start: false, game: false, set: true, end: true },
};
const NOTIF_OPTS = {
  soccer: ["Calcio", [["start", "Inizio partita"], ["goal", "Gol"], ["red", "Espulsioni"], ["ht", "Fine primo tempo"], ["end", "Fine partita"]]],
  nba: ["Basket NBA", [["start", "Inizio partita"], ["quarter", "Fine di ogni quarto"], ["end", "Fine partita"]]],
  tennis: ["Tennis", [["start", "Inizio incontro"], ["set", "Fine di ogni set"], ["game", "Fine di ogni game (tante notifiche)"], ["end", "Fine incontro"]]],
};

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
  if (t) t.textContent = on ? "Segui la partita ✓" : "Segui la partita";
}
/* campanella: piccola nell'elenco, con scritta nella scheda della partita */
function bellBtn(e, small = false) {
  if (e.final || (e.date && Date.now() - Date.parse(e.date) > (e.sport === "tennis" ? 24 : 5) * 3600e3)) return "";
  const on = isFollowed(e.id);
  const data = esc(JSON.stringify({ id: e.id, sport: e.sport, date: e.date, home: e.home, away: e.away, league_name: e.league_name }));
  return `<button type="button" class="bell ${small ? "sm" : ""} ${on ? "on" : ""}" data-bell="${esc(e.id)}" data-ev='${data}' aria-pressed="${on}" aria-label="Avvisami per questa partita">${BELL_SVG}${small ? "" : `<span class="bell-t">${on ? "Segui la partita ✓" : "Segui la partita"}</span>`}</button>`;
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
  return { events: [...ev].slice(-600), teams: [...new Set(teams)] };
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

/* riquadro nella pagina Tu */
function notifSection() {
  const s = notifState();
  let inner;
  if (isIOS() && !standalone()) {
    inner = `<p class="note" style="margin-top:0">Su iPhone e iPad le notifiche arrivano solo se l'app è sulla schermata Home (iOS 16.4 o più recente):</p>
      <ol class="nt-steps"><li>Apri il sito in <b>Safari</b> e tocca <b>Condividi</b> (il quadrato con la freccia).</li><li>Scegli <b>Aggiungi alla schermata Home</b>.</li><li>Apri Pronostici dall'icona e torna qui in <b>Tu</b>.</li></ol>`;
  } else if (!pushSupported()) {
    inner = `<p class="note" style="margin-top:0">Questo browser non riceve notifiche. Prova con Chrome, Edge, Firefox o Samsung Internet.</p>`;
  } else if (Notification.permission === "denied") {
    inner = `<p class="note" style="margin-top:0">Le notifiche di questo sito sono bloccate. Sbloccale dalle impostazioni del browser (il lucchetto accanto all'indirizzo → Notifiche → Consenti), poi torna qui.</p>`;
  } else if (!s.on) {
    inner = `<p class="note" style="margin-top:0">Gol, espulsioni, fine dei quarti e dei set, risultato finale: avvisi anche ad app chiusa, <b>solo per le partite che scegli tu</b> con la campanella ${BELL_SVG} e per le squadre e i tennisti che segui.</p>
      <button type="button" class="btn-main" id="nt-on">Attiva le notifiche</button>`;
  } else {
    const card = sp => {
      const [title, opts] = NOTIF_OPTS[sp], p = s.prefs[sp];
      return `<div class="nt-sport ${p.on ? "" : "off"}" data-nt-sport="${sp}">
        <label class="nt-head"><b>${title}</b><input type="checkbox" class="switch" data-nt="${sp}.on" ${p.on ? "checked" : ""} aria-label="Notifiche ${title}"></label>
        <div class="nt-body">${opts.map(([k, l]) => `<label class="nt-opt"><input type="checkbox" data-nt="${sp}.${k}" ${p[k] ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>`;
    };
    const fl = followed().sort((a, b) => a.date.localeCompare(b.date));
    const teams = typeof myTeams === "function" ? myTeams() : [];
    const what = `<div class="nt-what">
      <h3 class="lb-h3">Per quali partite</h3>
      <p class="note" style="margin-top:0">Gli avvisi arrivano <b>solo</b> per:</p>
      <ul class="nt-list"><li><b>le partite che segui</b>: tocca la campanella ${BELL_SVG} accanto a una partita nell'elenco o in alto nella sua scheda;</li>
        <li><b>le squadre e i tennisti che segui</b> (tasto <b>Segui</b> nella loro pagina): tutte le loro partite.</li></ul>
      ${fl.length ? `<div class="nt-follow">${fl.map(x => `<div class="nt-f"><span><b>${esc(x.match)}</b><small>${esc(fmtDay(x.date).label)} ${esc(fmtTime(x.date))}${x.league_name ? ` · ${esc(x.league_name)}` : ""}</small></span>
          <button type="button" class="me-x" data-bell="${esc(x.id)}" data-ev='${esc(JSON.stringify({ id: x.id }))}' aria-label="Smetti di seguire ${esc(x.match)}">×</button></div>`).join("")}</div>`
        : `<p class="note">Non segui ancora nessuna partita.</p>`}
      ${teams.length ? `<p class="note">Squadre e tennisti seguiti: ${teams.map(t => esc(t.name)).join(", ")}.</p>` : ""}
      <label class="nt-opt"><input type="checkbox" id="nt-slips" ${s.slips ? "checked" : ""}><span>Anche le partite delle mie schedine salvate</span></label>
    </div>`;
    inner = `${what}<h3 class="lb-h3">Quali avvisi</h3>${Object.keys(NOTIF_OPTS).map(card).join("")}
      <p class="note">Arrivano anche ad app chiusa, entro circa un minuto da quello che succede in campo.</p>
      <div class="me-acts"><button type="button" class="btn-main" id="nt-test">Manda una prova</button><button type="button" class="btn-main alt" id="nt-off">Disattiva</button></div>`;
  }
  return sec("Notifiche", `<div class="nt">${inner}<p class="nt-msg" id="nt-msg" role="status"></p></div>`, s.on ? "attive" : "", "Tu notifiche");
}

function wireNotifs() {
  const msg = t => { const m = document.getElementById("nt-msg"); if (m) m.textContent = t; };
  const redraw = () => { if (location.hash.startsWith("#/tu")) showMe(); };
  document.getElementById("nt-on")?.addEventListener("click", async ev => {
    ev.target.disabled = true; msg("Attivo…");
    try { await enableNotifs(); toast("Notifiche attive"); redraw(); }
    catch (e) { msg(`Non riesco ad attivarle: ${e.message}.`); ev.target.disabled = false; }
  });
  document.getElementById("nt-off")?.addEventListener("click", async () => { await disableNotifs(); toast("Notifiche disattivate"); redraw(); });
  document.getElementById("nt-test")?.addEventListener("click", async () => {
    msg("Invio…");
    try { const sub = await currentSub(); if (!sub) throw new Error("iscrizione persa, disattiva e riattiva");
      const r = await pushPost("test", { sub: sub.toJSON() }); msg(r.ok ? "Inviata: dovrebbe arrivare tra qualche secondo." : `Il servizio push ha risposto ${r.code}.`); }
    catch (e) { msg(`Prova non riuscita: ${e.message}.`); }
  });
  document.querySelectorAll("[data-nt]").forEach(el => el.addEventListener("change", () => {
    const [sp, k] = el.dataset.nt.split("."), s = notifState();
    s.prefs[sp][k] = el.checked;
    saveNotif(s);
    if (k === "on") el.closest(".nt-sport").classList.toggle("off", !el.checked);
    notifySync();
  }));
  document.getElementById("nt-slips")?.addEventListener("change", ev => { saveNotif({ ...notifState(), slips: ev.target.checked }); notifySync(); });
}

// all'apertura dell'app: rinnova l'iscrizione con le partite "mie" aggiornate
if (notifState().on) setTimeout(syncNotifs, 3000);
