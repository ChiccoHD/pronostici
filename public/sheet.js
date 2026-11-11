"use strict";
/* Pronostici — finestre dal basso dentro l'app (al posto di confirm/prompt del browser)
   e barra della schedina in costruzione, che si apre a comparsa da qualsiasi pagina. */

function openSheet(inner, { label = "Finestra", onClose } = {}) {
  closeSheet();
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="sheet-grip" aria-hidden="true"></div>${inner}</div>`;
  document.body.appendChild(bg);
  document.body.classList.add("sheet-open");
  requestAnimationFrame(() => bg.classList.add("show"));
  const close = () => {
    if (!bg.isConnected) return;
    bg.classList.remove("show");
    document.body.classList.remove("sheet-open");
    setTimeout(() => bg.remove(), 200);
    document.removeEventListener("keydown", esc_);
    onClose?.();
  };
  const esc_ = e => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esc_);
  bg.addEventListener("click", e => { if (e.target === bg) close(); });
  bg.__close = close;
  return { el: bg.querySelector(".sheet"), close };
}
function closeSheet() { document.querySelectorAll(".sheet-bg").forEach(b => b.__close?.()); }
window.addEventListener("hashchange", closeSheet);

/* conferma: restituisce true/false */
function askConfirm(text, { title = "", ok = "Sì", cancel = "Annulla", danger = false } = {}) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (!done) { done = true; res(v); } };
    const { el, close } = openSheet(`${title ? `<h3 class="sheet-t">${esc(title)}</h3>` : ""}<p class="sheet-p">${esc(text)}</p>
      <div class="sheet-acts"><button type="button" class="btn-main alt" data-no>${esc(cancel)}</button><button type="button" class="btn-main ${danger ? "danger" : ""}" data-yes>${esc(ok)}</button></div>`,
      { label: title || text, onClose: () => fin(false) });
    el.querySelector("[data-yes]").onclick = () => { fin(true); close(); };
    el.querySelector("[data-no]").onclick = () => close();
  });
}
/* testo: restituisce la stringa scritta, oppure null se si annulla */
function askText(title, value = "", { ok = "Salva", hint = "", readonly = false } = {}) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (!done) { done = true; res(v); } };
    const { el, close } = openSheet(`<h3 class="sheet-t">${esc(title)}</h3>${hint ? `<p class="sheet-p">${esc(hint)}</p>` : ""}
      <input class="sheet-in" type="text" value="${esc(value)}" ${readonly ? "readonly" : ""} maxlength="${readonly ? 4000 : 40}">
      <div class="sheet-acts"><button type="button" class="btn-main alt" data-no>${readonly ? "Chiudi" : "Annulla"}</button>${readonly ? "" : `<button type="button" class="btn-main" data-yes>${esc(ok)}</button>`}</div>`,
      { label: title, onClose: () => fin(null) });
    const inp = el.querySelector("input");
    setTimeout(() => { inp.focus(); inp.select(); }, 250);
    const yes = () => { fin(inp.value); close(); };
    el.querySelector("[data-yes]")?.addEventListener("click", yes);
    inp.addEventListener("keydown", e => { if (e.key === "Enter" && !readonly) yes(); });
    el.querySelector("[data-no]").onclick = () => close();
  });
}

/* ------------------------------------------------------------------ schedina a comparsa */
const slipOpenLegs = () => { const now = Date.now(); return favs().filter(f => !slipStarted(f, now) && !f.result).sort((a, b) => a.date.localeCompare(b.date)); };

function updateSlipBar() {
  let bar = document.getElementById("slipbar");
  const legs = slipOpenLegs();
  const hide = !legs.length || location.hash.startsWith("#/schedina");
  if (hide) { bar?.remove(); document.body.classList.remove("has-slipbar"); return; }
  if (!bar) {
    bar = document.createElement("button");
    bar.type = "button"; bar.id = "slipbar";
    bar.addEventListener("click", showSlipSheet);
    document.body.appendChild(bar);
  }
  const prod = legs.reduce((a, f) => a * f.p, 1);
  bar.innerHTML = `<span class="sb-n">${legs.length}</span><span class="sb-t"><b>Schedina</b><small>${legs.length === 1 ? "1 giocata" : `${legs.length} giocate`} · probabilità ${pct(prod)}</small></span>
    <span class="sb-odd"><small>quota equa</small><b>${odd(prod)}</b></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>`;
  bar.setAttribute("aria-label", `Apri la schedina: ${legs.length} giocate, quota equa ${odd(prod)}`);
  document.body.classList.add("has-slipbar");
}
function bumpSlipBar() {
  const b = document.getElementById("slipbar");
  if (b) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
}

function showSlipSheet() {
  const legs = slipOpenLegs();
  if (!legs.length) { closeSheet(); return; }
  const prod = legs.reduce((a, f) => a * f.p, 1);
  const row = f => `<div class="ss-row">${ring(f.p, f.p >= .75)}<a href="#/e/${encodeURIComponent(f.event)}"><b>${esc(f.label)}</b><small>${esc(f.match)} · ${esc(fmtDay(f.date).rel || fmtShort(f.date))}, ${esc(fmtTime(f.date, f.time_valid))}</small></a>
    <button type="button" class="me-x" data-ss-remove="${esc(f.key)}" aria-label="Togli ${esc(f.label)}">×</button></div>`;
  const { el, close } = openSheet(`<div class="ss-head"><h3 class="sheet-t">La tua schedina</h3><span>${legs.length} ${legs.length === 1 ? "giocata" : "giocate"}</span></div>
    <div class="slip-nums"><div>${ring(prod, prod >= .5)}<span>probabilità stimata che escano tutte</span></div><div class="big-odd"><b>${odd(prod)}</b><span>quota equa</span></div></div>
    <div class="ss-list">${legs.map(row).join("")}</div>
    <div class="sheet-acts col"><button type="button" class="btn-main" data-ss-save>Salva come schedina</button>
      <div class="sheet-acts"><a class="btn-main alt" href="#/schedina">Apri la schedina</a><button type="button" class="btn-main alt danger-txt" data-ss-clear>Svuota</button></div></div>`, { label: "La tua schedina" });
  el.querySelectorAll("[data-ss-remove]").forEach(b => b.onclick = () => {
    saveFavs(favs().filter(f => f.key !== b.dataset.ssRemove));
    refreshAfterSlip();
    slipOpenLegs().length ? showSlipSheet() : close();
  });
  el.querySelector("[data-ss-save]").onclick = async () => {
    const name = await askText("Nome della schedina", `Schedina ${mySlips().length + 1}`, { hint: "La ritrovi in Tu, dove l'app segna da sola com'è andata." });
    if (name === null) { showSlipSheet(); return; }
    const now = slipOpenLegs();
    saveAsSlip(now, name.trim() || undefined);
    saveFavs(favs().filter(f => !now.some(x => x.key === f.key)));
    toast("Schedina salvata: la trovi in Tu");
    refreshAfterSlip();
  };
  el.querySelector("[data-ss-clear]").onclick = async () => {
    if (await askConfirm("Togliere tutte le giocate dalla schedina in costruzione?", { title: "Svuotare la schedina?", ok: "Sì, svuota", danger: true })) {
      const now = slipOpenLegs();
      saveFavs(favs().filter(f => !now.some(x => x.key === f.key)));
      toast("Schedina svuotata");
      refreshAfterSlip();
    } else showSlipSheet();
  };
}
/* ridisegna le stelline della pagina aperta dopo una modifica fatta dalla finestra */
function refreshAfterSlip() {
  updateFavBadge();
  document.querySelectorAll("[data-fav]").forEach(b => { const on = isFav(b.dataset.fav); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
  if (location.hash.startsWith("#/multipla") && typeof showMultipla === "function") showMultipla();
}
window.addEventListener("hashchange", () => setTimeout(updateSlipBar, 0));
setTimeout(updateSlipBar, 500);
