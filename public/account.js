"use strict";
/* Pronostici — account (email e password o Google) e sincronizzazione dei dati del telefono tra dispositivi.
   Server: worker/accounts.js (/api/account/*). Sul telefono: p_acct {token, email}, p_sync {at, dirty}.
   Si sincronizzano tutte le chiavi p_ tranne quelle in SYNC_SKIP; con modifiche su due telefoni le liste
   (schedine, giocate, squadre...) vengono unite per id. */

const ACC_API = "/api/account/";
const SYNC_SKIP = new Set(["p_acct", "p_sync", "p_finals", "p_closed", "p_news_seen", "p_status", "p_names_it"]);
let ACC_CFG = null, SYNC_T = 0, SYNC_BUSY = false;

const _setItem = Storage.prototype.setItem, _removeItem = Storage.prototype.removeItem;
function accRaw(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } }
function accPut(k, v) { try { _setItem.call(localStorage, k, JSON.stringify(v)); } catch { /* niente */ } }
const acct = () => accRaw("p_acct", null);
const syncState = () => accRaw("p_sync", { at: 0, dirty: false });

// ogni modifica ai dati dell'app (chiavi p_) segna "da sincronizzare" e invia dopo qualche secondo
function accTouched(k) {
  if (this !== localStorage || !String(k).startsWith("p_") || SYNC_SKIP.has(k) || !acct()) return;
  accPut("p_sync", { ...syncState(), dirty: true });
  clearTimeout(SYNC_T); SYNC_T = setTimeout(() => accSync(), 3000);
}
Storage.prototype.setItem = function (k, v) { _setItem.call(this, k, v); accTouched.call(this, k); };
Storage.prototype.removeItem = function (k) { _removeItem.call(this, k); accTouched.call(this, k); };

async function accFetch(path, { method = "GET", body } = {}) {
  const a = acct();
  const r = await fetch(ACC_API + path, { method, headers: { "content-type": "application/json", ...(a?.token ? { authorization: "Bearer " + a.token } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  let js = {};
  try { js = await r.json(); } catch { /* niente */ }
  if (r.status === 401 && a?.token && !["login", "register", "reset", "google", "delete", "password"].includes(path)) { _removeItem.call(localStorage, "p_acct"); }
  return { ok: r.ok, status: r.status, js };
}

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

function accApply(server, merge) {
  const cur = accCollect();
  for (const [k, v] of Object.entries(server || {})) {
    if (SYNC_SKIP.has(k) || !k.startsWith("p_")) continue;
    const val = merge ? accMergeVal(cur[k] ?? null, v) : v;
    if (val != null && val !== cur[k]) _setItem.call(localStorage, k, val);
  }
}

function accRefresh() {
  if (typeof notifySync === "function") try { notifySync(); } catch { /* niente */ }
  if (location.hash.startsWith("#/tu") && typeof showMe === "function") showMe();
  else if (typeof route === "function") try { route(); } catch { /* niente */ }
}

// sincronizza: scarica se il server è più nuovo, unisce se ci sono modifiche da tutte e due le parti, poi invia
async function accSync({ force = false, first = false } = {}) {
  if (!acct() || SYNC_BUSY || !navigator.onLine) return;
  SYNC_BUSY = true;
  try {
    let st = syncState(), changed = false;
    const me = await accFetch("me");
    if (!me.ok) return;
    if (first || me.js.updated > st.at) {
      const d = await accFetch("data");
      if (d.ok && d.js.blob) {
        let server = {};
        try { server = JSON.parse(d.js.blob); } catch { /* niente */ }
        accApply(server, first || st.dirty);
        changed = true;
        if (first || st.dirty) st = { at: d.js.updated, dirty: true };
        else st = { at: d.js.updated, dirty: false };
        accPut("p_sync", st);
      } else if (first) { st = { at: me.js.updated, dirty: true }; accPut("p_sync", st); }
    }
    if (st.dirty || force) {
      let r = await accFetch("data", { method: "PUT", body: { blob: JSON.stringify(accCollect()), base: st.at } });
      if (r.status === 409) {        // un altro telefono ha salvato nel frattempo: unisco e riprovo
        const d = await accFetch("data");
        if (d.ok && d.js.blob) { try { accApply(JSON.parse(d.js.blob), true); changed = true; } catch { /* niente */ } }
        r = await accFetch("data", { method: "PUT", body: { blob: JSON.stringify(accCollect()), base: d.js.updated } });
      }
      if (r.ok) accPut("p_sync", { at: r.js.updated, dirty: false });
    }
    if (changed) accRefresh();
  } catch { /* senza rete: riprovo più tardi */ }
  finally { SYNC_BUSY = false; const b = document.getElementById("acc-when"); if (b) b.textContent = accWhen(); }
}

function accWhen() {
  const st = syncState();
  if (st.dirty) return "modifiche da inviare…";
  if (!st.at) return "non ancora sincronizzato";
  const d = new Date(st.at), today = new Date().toDateString() === d.toDateString();
  return `sincronizzato ${today ? "alle" : "il " + d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + " alle"} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

async function accLogged(js, recovery) {
  accPut("p_acct", { token: js.token, email: js.email || null });
  if (js.name && !localStorage.getItem("p_name")) localStorage.setItem("p_name", js.name);
  if (recovery) await accShowRecovery(recovery);
  toast("Accesso fatto: unisco i dati di questo telefono con quelli dell'account");
  await accSync({ first: true });
  if (location.hash.startsWith("#/tu") && typeof showMe === "function") showMe();
}

function accShowRecovery(code) {
  return new Promise(res => {
    const { el, close } = openSheet(`<h3 class="sheet-t">Il tuo codice di recupero</h3>
      <p class="sheet-p">Se dimentichi la password, con questo codice ne scegli una nuova. Salvalo in un posto sicuro (note, gestore delle password): non lo vedrai più.</p>
      <p class="acc-code">${esc(code)}</p>
      <div class="sheet-acts"><button type="button" class="btn-main alt" data-copy>Copia</button><button type="button" class="btn-main" data-ok>L'ho salvato</button></div>`, { label: "Codice di recupero", onClose: res });
    el.querySelector("[data-copy]").onclick = async () => { try { await navigator.clipboard.writeText(code); toast("Codice copiato"); } catch { toast("Copialo a mano"); } };
    el.querySelector("[data-ok]").onclick = () => close();
  });
}

/* ------------------------------------------------------------------ riquadro in Tu */

function accountSection() {
  const a = acct();
  if (a) return sec(`${meIc("👤", "#0a9b5a")}Il tuo account`, `<div class="acc-on"><span class="acc-av">${esc((a.email || "?")[0].toUpperCase())}</span>
      <span><b>${esc(a.email || "Account Google")}</b><small id="acc-when">${esc(accWhen())}</small></span></div>
    <p class="note">Schedine, squadre seguite, storico, sfide e scelte dell'app sono salvati nel tuo account: accedi con gli stessi dati su un altro telefono, tablet o computer e ritrovi tutto.</p>
    <div class="me-acts"><button type="button" class="btn-main alt" id="acc-sync">Sincronizza ora</button><button type="button" class="btn-main alt" id="acc-out">Esci</button></div>
    <div class="acc-more"><button type="button" class="linkish" id="acc-pw">Cambia password</button> · <button type="button" class="linkish danger" id="acc-del">Elimina account</button></div>`, "", "Tu account");
  return sec(`${meIc("👤", "#0a9b5a")}Accedi`, `<p class="note" style="margin-top:0">Con un account ritrovi schedine, squadre seguite e storico su tutti i tuoi dispositivi, e non li perdi se cambi telefono.</p>
    <div id="acc-google" class="acc-google"></div>
    <form id="acc-form" class="acc-form" autocomplete="on">
      <input class="sheet-in" type="email" name="email" id="acc-email" placeholder="Email" autocomplete="username" required>
      <input class="sheet-in" type="password" name="password" id="acc-pass" placeholder="Password (almeno 8 caratteri)" autocomplete="current-password" minlength="8" required>
      <div class="me-acts"><button type="submit" class="btn-main" data-act="login">Accedi</button><button type="button" class="btn-main alt" data-act="register">Crea account</button></div>
      <p class="acc-err" id="acc-err" hidden></p>
      <button type="button" class="linkish" id="acc-forgot">Password dimenticata?</button>
    </form>
    <p class="note">Su iPhone e Android il telefono ti propone di salvare la password nel portachiavi: la volta dopo entri con Face ID o l'impronta.</p>`, "", "Tu account");
}

async function accConfig() {
  if (ACC_CFG) return ACC_CFG;
  try { ACC_CFG = (await accFetch("config")).js || {}; } catch { ACC_CFG = {}; }
  return ACC_CFG;
}

function accErr(msg) { const e = document.getElementById("acc-err"); if (e) { e.textContent = msg; e.hidden = !msg; } }

function wireAccount() {
  const a = acct();
  if (a) {
    document.getElementById("acc-sync")?.addEventListener("click", async () => { await accSync({ force: true }); toast("Dati sincronizzati"); });
    document.getElementById("acc-out")?.addEventListener("click", async () => {
      if (!(await askConfirm("I dati restano su questo telefono e nel tuo account.", { title: "Uscire dall'account?", ok: "Esci" }))) return;
      await accSync().catch(() => {});
      await accFetch("logout", { method: "POST", body: {} }).catch(() => {});
      _removeItem.call(localStorage, "p_acct"); _removeItem.call(localStorage, "p_sync");
      showMe();
    });
    document.getElementById("acc-pw")?.addEventListener("click", async () => {
      const old = await accAsk("Password attuale", "Se sei entrato con Google e non hai una password, lascia vuoto.", "current-password");
      if (old == null) return;
      const pw = await accAsk("Nuova password", "Almeno 8 caratteri.", "new-password");
      if (!pw) return;
      const r = await accFetch("password", { method: "POST", body: { old, password: pw } });
      if (!r.ok) return toast(r.js.error || "Non riuscito");
      if (r.js.recovery) await accShowRecovery(r.js.recovery);
      toast("Password cambiata");
    });
    document.getElementById("acc-del")?.addEventListener("click", async () => {
      if (!(await askConfirm("L'account e la copia dei dati sul server vengono cancellati. I dati su questo telefono restano.", { title: "Eliminare l'account?", ok: "Elimina", danger: true }))) return;
      const pw = await accAsk("Conferma con la password", "Se sei entrato con Google lascia vuoto.", "current-password");
      if (pw == null) return;
      const r = await accFetch("delete", { method: "POST", body: { password: pw } });
      if (!r.ok) return toast(r.js.error || "Non riuscito");
      _removeItem.call(localStorage, "p_acct"); _removeItem.call(localStorage, "p_sync");
      toast("Account eliminato"); showMe();
    });
    return;
  }
  const form = document.getElementById("acc-form");
  if (!form) return;
  const go = async act => {
    const email = document.getElementById("acc-email").value.trim(), password = document.getElementById("acc-pass").value;
    if (!email || password.length < 8) return accErr("Scrivi l'email e una password di almeno 8 caratteri.");
    accErr("");
    form.querySelectorAll("button").forEach(b => b.disabled = true);
    try {
      const r = await accFetch(act, { method: "POST", body: { email, password } });
      if (!r.ok) return accErr(r.js.error || "Non riuscito: riprova");
      await accLogged(r.js, r.js.recovery);
    } catch { accErr("Senza rete: riprova quando sei connesso."); }
    finally { form.querySelectorAll("button").forEach(b => b.disabled = false); }
  };
  form.onsubmit = e => { e.preventDefault(); go("login"); };
  form.querySelector('[data-act="register"]').onclick = () => go("register");
  document.getElementById("acc-forgot").onclick = async () => {
    const email = document.getElementById("acc-email").value.trim() || await accAsk("La tua email", "", "username", "email");
    if (!email) return;
    const code = await accAsk("Codice di recupero", "È il codice che ti ho mostrato quando hai creato l'account (es. 3F9A-0C21-7B44-…).", "one-time-code", "text");
    if (!code) return;
    const pw = await accAsk("Nuova password", "Almeno 8 caratteri.", "new-password");
    if (!pw) return;
    const r = await accFetch("reset", { method: "POST", body: { email, recovery: code, password: pw } });
    if (!r.ok) return toast(r.js.error || "Non riuscito");
    await accLogged(r.js, r.js.recovery);
  };
  accConfig().then(cfg => cfg.google && accGoogle(cfg.google));
}

// finestra con un campo (password nascosta), per non usare prompt()
function accAsk(title, hint, ac = "current-password", type = "password") {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    const { el, close } = openSheet(`<h3 class="sheet-t">${esc(title)}</h3>${hint ? `<p class="sheet-p">${esc(hint)}</p>` : ""}
      <input class="sheet-in" type="${type}" autocomplete="${ac}">
      <div class="sheet-acts"><button type="button" class="btn-main alt" data-no>Annulla</button><button type="button" class="btn-main" data-yes>OK</button></div>`, { label: title, onClose: () => fin(null) });
    const inp = el.querySelector("input");
    setTimeout(() => inp.focus(), 250);
    const yes = () => { fin(inp.value); close(); };
    el.querySelector("[data-yes]").onclick = yes;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") yes(); });
    el.querySelector("[data-no]").onclick = () => close();
  });
}

function accGoogle(clientId) {
  const box = document.getElementById("acc-google");
  if (!box) return;
  const draw = () => {
    try {
      google.accounts.id.initialize({ client_id: clientId, callback: async r => {
        const x = await accFetch("google", { method: "POST", body: { credential: r.credential } });
        if (!x.ok) return accErr(x.js.error || "Accesso con Google non riuscito");
        await accLogged(x.js);
      } });
      google.accounts.id.renderButton(box, { theme: document.documentElement.dataset.theme === "dark" ? "filled_black" : "outline", size: "large", text: "continue_with", shape: "pill", locale: "it", width: Math.min(box.clientWidth || 320, 400) });
      box.insertAdjacentHTML("afterend", `<div class="acc-or"><span>oppure con l'email</span></div>`);
    } catch { /* niente */ }
  };
  if (window.google?.accounts?.id) return draw();
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = draw;
  document.head.appendChild(s);
}

// all'apertura e quando si torna sull'app
window.addEventListener("load", () => setTimeout(() => accSync(), 1500));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") accSync(); });
window.addEventListener("online", () => accSync());
