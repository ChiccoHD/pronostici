"use strict";
/* Pronostici — layout per computer (schermi larghi almeno 1180 px): elenco delle partite fisso a sinistra
   e partita aperta a destra, senza cambiare pagina. Su telefono e tablet non fa nulla. Usa funzioni di app.js. */

const WIDE = window.matchMedia("(min-width: 1180px)");
const side = document.createElement("aside");
side.id = "side";
side.setAttribute("aria-label", "Elenco delle partite");
document.getElementById("app").before(side);

/* disegna l'elenco con il codice di sempre, poi lo sposta nella colonna (gli eventi dei pulsanti restano) */
function listToSide() {
  const keepScroll = side.scrollTop;
  const current = [...$app.childNodes];
  renderList();
  side.replaceChildren(...$app.childNodes);
  $app.replaceChildren(...current);
  side.scrollTop = keepScroll;
  markActive();
}
function markActive() {
  const h = location.hash;
  side.querySelectorAll("a[href^='#/e/']").forEach(a => a.classList.toggle("active", a.getAttribute("href") === h || h.startsWith(a.getAttribute("href") + "/")));
}

/* chiamata da route(): true se ha già disegnato la pagina */
function layoutRoute(view) {
  const split = WIDE.matches && (view === "" || view === "e" || view === undefined);
  document.body.classList.toggle("split", split);
  if (!split) { if (side.childNodes.length) side.replaceChildren(); return false; }
  if (view === "e") { if (!side.childNodes.length) listToSide(); else markActive(); return false; }
  listToSide();
  $app.innerHTML = `<div class="split-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
    <b>Scegli una partita dall'elenco</b><span>La scheda si apre qui, senza perdere il punto dell'elenco.</span>
    <div class="split-links"><a href="#/live">Partite in diretta</a><a href="#/migliori">Le migliori di oggi</a><a href="#/classifiche">Classifiche</a></div></div>`;
  return true;
}
/* chiamata da showList(): con la colonna attiva, i filtri ridisegnano solo l'elenco */
function listInSide() {
  if (!document.body.classList.contains("split")) return false;
  listToSide();
  return true;
}

WIDE.addEventListener("change", () => route());
/* altezza della testata, per le parti che restano ferme mentre si scorre */
function setHead() { document.documentElement.style.setProperty("--head", `${document.querySelector("header.top")?.offsetHeight || 52}px`); }
window.addEventListener("resize", setHead);
setHead();
