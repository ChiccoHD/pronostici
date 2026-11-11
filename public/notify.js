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

function notifState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}"); } catch { /* niente */ }
  const prefs = {};
  for (const k of Object.keys(NOTIF_DEFAULT)) prefs[k] = { ...NOTIF_DEFAULT[k], ...(s.prefs?.[k] || {}) };
  return { on: !!s.on, prefs };
}
function saveNotif(s) { try { localStorage.setItem(NOTIF_KEY, JSON.stringify(s)); } catch { /* niente */ } }

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function b64uToBytes(s) {
  const t = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(t, c => c.charCodeAt(0));
}

/* partite "mie": stelline ancora aperte, schedine salvate, squadre e tennisti seguiti */
function notifMine() {
  const ev = new Set();
  for (const f of favs()) if (!f.result && f.event) ev.add(f.event);
  if (typeof mySlips === "function") for (const s of mySlips()) for (const l of s.legs || []) if (!l.result && l.event) ev.add(l.event);
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
    inner = `<p class="note" style="margin-top:0">Gol, espulsioni, fine dei quarti e dei set, risultato finale: avvisi anche ad app chiusa, per le partite che scegli tu.</p>
      <button type="button" class="btn-main" id="nt-on">Attiva le notifiche</button>`;
  } else {
    const card = sp => {
      const [title, opts] = NOTIF_OPTS[sp], p = s.prefs[sp];
      return `<div class="nt-sport ${p.on ? "" : "off"}" data-nt-sport="${sp}">
        <label class="nt-head"><b>${title}</b><input type="checkbox" class="switch" data-nt="${sp}.on" ${p.on ? "checked" : ""} aria-label="Notifiche ${title}"></label>
        <div class="nt-body">
          <div class="nt-mode" role="group" aria-label="Quali partite"><button type="button" data-nt-mode="${sp}.mine" aria-pressed="${p.mode !== "all"}">Le mie partite</button><button type="button" data-nt-mode="${sp}.all" aria-pressed="${p.mode === "all"}">Tutte</button></div>
          ${opts.map(([k, l]) => `<label class="nt-opt"><input type="checkbox" data-nt="${sp}.${k}" ${p[k] ? "checked" : ""}><span>${l}</span></label>`).join("")}
        </div></div>`;
    };
    inner = `<p class="note" style="margin-top:0"><b>Le mie partite</b> = quelle con la stellina, nelle schedine salvate e delle squadre o dei tennisti che segui. <b>Tutte</b> = ogni partita in elenco di quello sport: possono essere tante.</p>
      ${Object.keys(NOTIF_OPTS).map(card).join("")}
      <p class="note">Gli avvisi arrivano entro un minuto circa da quello che succede in campo.</p>
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
  document.querySelectorAll("[data-nt-mode]").forEach(b => b.addEventListener("click", () => {
    const [sp, mode] = b.dataset.ntMode.split("."), s = notifState();
    s.prefs[sp].mode = mode;
    saveNotif(s);
    b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    notifySync();
  }));
}

// all'apertura dell'app: rinnova l'iscrizione con le partite "mie" aggiornate
if (notifState().on) setTimeout(syncNotifs, 3000);
