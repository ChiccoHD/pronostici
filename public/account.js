"use strict";
/* Pronostici — account e sincronizzazione tra dispositivi, come nelle altre app (calisthenics, steelbook):
   Firebase (piano gratuito) con accesso Google o email e password, dati in Firestore
   (raccolta "pronostici", un documento per utente: { data: testo JSON delle chiavi p_, u: ora }).
   La configurazione del progetto è in FB_DEF; in alternativa si incolla dall'app (salvata in "pronostici_fb").
   Si sincronizzano tutte le chiavi p_ tranne SYNC_SKIP. Se il documento sul server è cambiato da un altro
   dispositivo, liste e oggetti vengono uniti (accMergeVal); altrimenti vince il telefono (così le cancellazioni restano). */

const FB_DEF = { apiKey: "AIzaSyBoiOoNiUZucLdLASz0_Xwk-j2r50q70hc", authDomain: "pronostici-807e7.firebaseapp.com", projectId: "pronostici-807e7", storageBucket: "pronostici-807e7.firebasestorage.app", messagingSenderId: "46940102528", appId: "1:46940102528:web:35fa9304a8da9cb2962b65" };   // { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId } del progetto Firebase "pronostici"
const FBV = "10.14.1";
const SYNC_SKIP = new Set(["p_acct", "p_sync", "p_finals", "p_closed", "p_news_seen", "p_status", "p_names_it"]);
let FB = null, FBU = null, FBload = null, FBunsub = null, FBstate = "", FBt = "", FB_T = 0, FB_APPLYING = false;

const _setItem = Storage.prototype.setItem, _removeItem = Storage.prototype.removeItem;
const fbOwn = () => { try { return JSON.parse(localStorage.getItem("pronostici_fb") || "null"); } catch { return null; } };
const fbCfg = () => fbOwn() || FB_DEF;
const syncState = () => { try { return JSON.parse(localStorage.getItem("p_sync") || "null") || { u: 0 }; } catch { return { u: 0 }; } };
const syncPut = v => { try { _setItem.call(localStorage, "p_sync", JSON.stringify(v)); } catch { /* niente */ } };
const acct = () => FBU ? { email: FBU.email || FBU.displayName || "Account" } : null;

// ogni modifica ai dati dell'app (chiavi p_) viene inviata dopo un attimo
function accTouched(k) {
  if (FB_APPLYING || this !== localStorage || !String(k).startsWith("p_") || SYNC_SKIP.has(k) || !FBU) return;
  clearTimeout(FB_T); FB_T = setTimeout(() => fbSync().catch(fbErr), 1500);
}
Storage.prototype.setItem = function (k, v) { _setItem.call(this, k, v); accTouched.call(this, k); };
Storage.prototype.removeItem = function (k) { _removeItem.call(this, k); accTouched.call(this, k); };

function accCollect() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith("p_") && !SYNC_SKIP.has(k)) data[k] = localStorage.getItem(k);
  }
  return data;
}

// unione di due valori salvati (testo JSON): liste per id, oggetti chiave per chiave, altrimenti vince il telefono
function accMergeVal(local, server) {
  if (local == null) return server;
  if (server == null || local === server) return local;
  let a, b;
  try { a = JSON.parse(local); b = JSON.parse(server); } catch { return local; }
  const idOf = x => x && typeof x === "object" ? (x.id ?? x.key ?? (x.event && x.label ? x.event + "|" + x.label : null) ?? JSON.stringify(x)) : JSON.stringify(x);
  if (Array.isArray(a) && Array.isArray(b)) {
    const m = new Map();
    for (const x of b) m.set(idOf(x), x);
    for (const x of a) { const k = idOf(x), s = m.get(k); m.set(k, s && s.result && !x.result ? s : x); }
    return JSON.stringify([...m.values()]);
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) return JSON.stringify({ ...b, ...a });
  return local;
}
function accMerge(local, server) {
  const out = { ...local };
  for (const [k, v] of Object.entries(server || {})) if (!SYNC_SKIP.has(k)) out[k] = accMergeVal(local[k] ?? null, v);
  return out;
}
function accApply(data) {
  const cur = accCollect();
  let changed = false;
  FB_APPLYING = true;
  try {
    for (const [k, v] of Object.entries(data)) if (v != null && v !== cur[k]) { _setItem.call(localStorage, k, v); changed = true; }
  } finally { FB_APPLYING = false; }
  return changed;
}
function accRefresh() {
  if (typeof notifySync === "function") try { notifySync(); } catch { /* niente */ }
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  if (location.hash.startsWith("#/tu") && typeof showMe === "function") showMe();
  else if (typeof route === "function") try { route(); } catch { /* niente */ }
}
const sortKeys = o => JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {}));

/* ------------------------------------------------------------------ Firebase */

const ldS = u => new Promise((r, j) => { const x = document.createElement("script"); x.src = u; x.onload = r; x.onerror = j; document.head.appendChild(x); });
const dref = () => FB.d.collection("pronostici").doc(FBU.uid);

function fbInit() {
  if (FBload) return FBload;
  const c = fbCfg();
  if (!c) return Promise.resolve();
  FBstate = "load";
  FBload = (async () => {
    try {
      const b = `https://cdn.jsdelivr.net/npm/firebase@${FBV}/`;
      await ldS(b + "firebase-app-compat.js"); await ldS(b + "firebase-auth-compat.js"); await ldS(b + "firebase-firestore-compat.js");
      firebase.initializeApp(c);
      FB = { a: firebase.auth(), d: firebase.firestore() };
      FBstate = "";
      FB.a.getRedirectResult().catch(fbErr);
      FB.a.onAuthStateChanged(u => {
        FBU = u;
        if (FBunsub) { FBunsub(); FBunsub = null; }
        if (u) startSync(); else { FBstate = ""; accRepaint(); }
      });
    } catch {
      FBload = null; FB = null;
      FBstate = "err:Non riesco a caricare Firebase: controlla la connessione o la configurazione.";
      accRepaint();
    }
  })();
  return FBload;
}

// legge il documento, unisce se un altro dispositivo l'ha cambiato, scrive se serve (in una transazione)
async function fbSync() {
  if (!FB || !FBU) return false;
  FBstate = "sync";
  const ref = dref();
  let applied = false;
  await FB.d.runTransaction(async t => {
    const sn = await t.get(ref);
    const raw = sn.exists ? sn.data() : null;
    const server = raw?.data ? JSON.parse(raw.data) : null, su = raw?.u || 0;
    const local = accCollect(), seen = syncState().u || 0;
    // nessun cambiamento altrove dall'ultima volta: vale il telefono (così restano anche le cancellazioni)
    const next = server && su !== seen ? accMerge(local, server) : local;
    applied = accApply(next);
    const out = sortKeys(next);
    if (!server || out !== sortKeys(server)) {
      const u = Date.now();
      t.set(ref, { data: out, u, app: "pronostici" });
      syncPut({ u });
    } else syncPut({ u: su });
  });
  FBstate = "ok"; FBt = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (applied) accRefresh(); else accRepaint();
  return applied;
}

async function startSync() {
  FBstate = "sync"; accRepaint();
  try {
    await fbSync();
    FBunsub = dref().onSnapshot(sn => {
      if (sn.metadata.hasPendingWrites || !sn.exists) return;
      const d = sn.data();
      if (!d?.u || d.u === syncState().u) return;            // è la nostra scrittura
      fbSync().catch(fbErr);
    }, fbErr);
  } catch (e) { fbErr(e); }
}

function fbErr(e) {
  const c = (e && e.code) || "";
  const m = {
    "auth/unauthorized-domain": `Questo indirizzo (${location.hostname}) non è autorizzato: aggiungilo in Firebase › Authentication › Impostazioni › Domini autorizzati.`,
    "auth/operation-not-allowed": "Questo metodo di accesso non è attivo: attivalo in Firebase › Authentication › Metodo di accesso.",
    "auth/invalid-credential": "Email o password non corretti.", "auth/invalid-login-credentials": "Email o password non corretti.",
    "auth/wrong-password": "Email o password non corretti.", "auth/user-not-found": "Nessun account con questa email: usa Registrati.",
    "auth/email-already-in-use": "Esiste già un account con questa email: usa Accedi.", "auth/weak-password": "Password troppo corta (almeno 6 caratteri).",
    "auth/invalid-email": "Email non valida.", "auth/too-many-requests": "Troppi tentativi: riprova tra qualche minuto.",
    "auth/network-request-failed": "Senza rete: riprova quando sei connesso.", "permission-denied": "Firestore rifiuta la scrittura: controlla le regole del database.",
  }[c] || (/popup-closed|cancelled-popup/.test(c) ? "Accesso annullato." : `Errore: ${(e && e.message) || c || "sconosciuto"}`);
  if (/popup-closed|cancelled-popup/.test(c)) { toast(m); return; }
  FBstate = "err:" + m;
  toast(m.length > 70 ? "Sincronizzazione non riuscita: dettagli in Tu" : m);
  accRepaint();
}

async function gLogin() {
  try {
    await fbInit(); if (!FB) return;
    const pr = new firebase.auth.GoogleAuthProvider();
    pr.setCustomParameters({ prompt: "select_account" });
    try { await FB.a.signInWithPopup(pr); }
    catch (e) { if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(e.code || "")) await FB.a.signInWithRedirect(pr); else throw e; }
  } catch (e) { fbErr(e); }
}
async function eLogin(reg) {
  const em = (document.getElementById("acc-email")?.value || "").trim(), pw = document.getElementById("acc-pass")?.value || "";
  if (!em || pw.length < 6) return toast("Inserisci email e password (almeno 6 caratteri)");
  try { await fbInit(); await (reg ? FB.a.createUserWithEmailAndPassword(em, pw) : FB.a.signInWithEmailAndPassword(em, pw)); }
  catch (e) { fbErr(e); }
}
async function ePass() {
  const em = (document.getElementById("acc-email")?.value || "").trim();
  if (!em) return toast("Scrivi prima la tua email");
  try { await fbInit(); await FB.a.sendPasswordResetEmail(em); toast("Ti ho inviato l'email per reimpostare la password"); }
  catch (e) { fbErr(e); }
}
async function fbOut() {
  try { if (FBunsub) { FBunsub(); FBunsub = null; } await FB.a.signOut(); _removeItem.call(localStorage, "p_sync"); toast("Disconnesso: i dati restano su questo telefono"); }
  catch (e) { fbErr(e); }
}
function parseCfg(t) {
  const o = {};
  for (const k of ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"]) {
    const m = String(t).match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    if (m) o[k] = m[1];
  }
  return o.apiKey && o.authDomain && o.projectId && o.appId ? o : null;
}

/* ------------------------------------------------------------------ riquadro in Tu */

function accRepaint() {
  const box = document.getElementById("acc-box");
  if (box) { box.innerHTML = accInner(); wireAccount(); }
}

function accInner() {
  const c = fbCfg(), err = FBstate.startsWith("err:") ? `<p class="acc-err">${esc(FBstate.slice(4))}</p>` : "";
  if (!c) return `<p class="note" style="margin-top:0">Per avere schedine, squadre seguite e storico su tutti i tuoi dispositivi, collega l'app a un progetto Firebase (gratuito), come per calisthenics e steelbook: accesso con Google o con email.</p>
    <textarea id="acc-cfg" class="sheet-in acc-cfg" rows="5" placeholder="Incolla qui la configurazione Firebase: apiKey, authDomain, projectId, appId…"></textarea>
    <button type="button" class="btn-main" id="acc-cfg-save">Collega Firebase</button>`;
  if (!FB) return `<p class="note" style="margin-top:0">${FBstate === "load" ? "Collegamento a Firebase in corso…" : "Firebase non è raggiungibile."}</p>${err}
    ${FBstate === "load" ? "" : `<button type="button" class="btn-main alt" id="acc-retry">Riprova</button>`}`;
  if (FBU) {
    const who = FBU.email || FBU.displayName || "Account";
    return `<div class="acc-on"><span class="acc-av ${FBstate === "ok" ? "on" : err ? "ko" : ""}">${esc(who[0].toUpperCase())}</span>
      <span><b>${esc(who)}</b><small>${FBstate === "sync" ? "Sincronizzazione in corso…" : FBstate === "ok" ? `Sincronizzato alle ${FBt}. Ogni modifica si salva da sola.` : err ? "Ultima sincronizzazione non riuscita" : "Collegato"}</small></span></div>${err}
      <p class="note">Schedine, squadre seguite, storico, sfide e scelte dell'app restano allineati su ogni dispositivo in cui accedi con questo account.</p>
      <div class="me-acts"><button type="button" class="btn-main alt" id="acc-sync">Sincronizza ora</button><button type="button" class="btn-main alt" id="acc-out">Esci</button></div>`;
  }
  return `<p class="note" style="margin-top:0">Accedi con lo stesso account su ogni dispositivo: schedine, squadre seguite e storico si uniscono e restano allineati.</p>
    <button type="button" class="acc-gbtn" id="acc-google"><svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>Accedi con Google</button>
    <div class="acc-or"><span>oppure con l'email</span></div>
    <form id="acc-form" class="acc-form" autocomplete="on">
      <input class="sheet-in" type="email" id="acc-email" placeholder="Email" autocomplete="email" inputmode="email">
      <input class="sheet-in" type="password" id="acc-pass" placeholder="Password (almeno 6 caratteri)" autocomplete="current-password">
      <div class="me-acts"><button type="submit" class="btn-main">Accedi</button><button type="button" class="btn-main alt" id="acc-reg">Registrati</button></div>
      ${err}<button type="button" class="linkish" id="acc-forgot">Password dimenticata?</button>
    </form>`;
}

function accountSection() {
  return sec(`${meIc("👤", "#0a9b5a")}${FBU ? "Il tuo account" : "Accedi e sincronizza"}`, `<div id="acc-box">${accInner()}</div>`, "", "Tu account");
}

function wireAccount() {
  const on = (id, f) => { const el = document.getElementById(id); if (el) el.onclick = f; };
  on("acc-google", gLogin);
  on("acc-reg", () => eLogin(1));
  on("acc-forgot", ePass);
  on("acc-sync", async () => { try { const ch = await fbSync(); toast(ch ? "Dati aggiornati dal cloud" : "Tutto già sincronizzato"); } catch (e) { fbErr(e); } });
  on("acc-out", fbOut);
  on("acc-retry", () => fbInit().then(accRepaint));
  on("acc-cfg-save", () => {
    const c = parseCfg(document.getElementById("acc-cfg").value);
    if (!c) return toast("Configurazione non valida: servono apiKey, authDomain, projectId e appId");
    try { _setItem.call(localStorage, "pronostici_fb", JSON.stringify(c)); } catch { /* niente */ }
    toast("Firebase collegato: ora accedi");
    fbInit().then(accRepaint); accRepaint();
  });
  const f = document.getElementById("acc-form");
  if (f) f.onsubmit = e => { e.preventDefault(); eLogin(0); };
  if (fbCfg() && !FBload) fbInit().then(accRepaint);
}

// all'apertura si collega da solo se c'è una configurazione; al ritorno sull'app ricontrolla
window.addEventListener("load", () => { if (fbCfg()) setTimeout(() => fbInit(), 1200); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && FBU) fbSync().catch(() => {}); });
