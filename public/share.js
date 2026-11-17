"use strict";
/* Pronostici — dalla scheda di una partita: aggiungila al calendario del telefono e condividila come immagine.
   Anche le schedine si condividono come immagine. Tutto sul telefono, niente server:
   il calendario è un link a Google Calendar o un file .ics, l'immagine è disegnata su un canvas. */

/* ------------------------------------------------------------------ pulsanti sotto il tabellone */

function eventActions(d) {
  if (!d?.home?.name) return "";
  const started = new Date(d.date).getTime() < Date.now() - 15 * 60e3;
  return `<div class="ev-acts">
    ${started ? "" : `<button type="button" class="ev-act" data-ev-cal><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>Calendario</button>`}
    <button type="button" class="ev-act" data-ev-img><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/></svg>Immagine</button>
  </div>`;
}
function wireEventActions(d) {
  $app.querySelector("[data-ev-cal]")?.addEventListener("click", () => calendarSheet(d));
  $app.querySelector("[data-ev-img]")?.addEventListener("click", () => imageSheet(matchCanvas(d), `pronostico-${slugify(d.home.name)}-${slugify(d.away.name)}.png`, `${d.home.name} – ${d.away.name}`));
}
const slugify = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ------------------------------------------------------------------ calendario */

const LEN_MIN = { soccer: 120, nba: 150, tennis: 120 };
const icsDate = t => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
function calInfo(d) {
  const start = new Date(d.date).getTime(), end = start + (LEN_MIN[d.sport] || 120) * 60e3;
  const title = `${d.home.name} – ${d.away.name}`;
  const lines = [d.league_name || "", d.sport === "tennis" && d.time_valid === false ? "Orario indicativo: dipende dagli incontri prima." : "",
    `Pronostico: ${location.origin}${location.pathname}#/e/${encodeURIComponent(d.id)}`].filter(Boolean);
  return { start, end, title, details: lines.join("\n") };
}
function calendarSheet(d) {
  const c = calInfo(d);
  const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(c.title)}&dates=${icsDate(c.start)}/${icsDate(c.end)}&details=${encodeURIComponent(c.details)}`;
  const when = `${fmtDay(d.date).rel || fmtShort(d.date)}, ${fmtTime(d.date, d.time_valid)}`;
  const { el, close } = openSheet(`<h3 class="sheet-t">Aggiungi al calendario</h3>
    <p class="sheet-p"><b>${esc(c.title)}</b><br>${esc(when)}${d.sport === "tennis" && d.time_valid === false ? " (orario indicativo)" : ""}. Con un promemoria 30 minuti prima.</p>
    <div class="cal-opts">
      <a class="btn-main" href="${esc(g)}" target="_blank" rel="noopener">Google Calendar</a>
      <button type="button" class="btn-main alt" data-ics>Calendario del telefono (.ics)</button>
    </div>
    <p class="note">Google Calendar si apre nell'app o nel browser. Il file .ics funziona con il calendario dell'iPhone e con gli altri calendari.</p>`, { label: "Aggiungi al calendario" });
  el.querySelector("a.btn-main").addEventListener("click", () => setTimeout(close, 300));
  el.querySelector("[data-ics]").onclick = async () => { await saveIcs(d, c); close(); };
}
async function saveIcs(d, c) {
  const esc_ = s => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pronostici//IT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${d.id}@pronostici`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(c.start)}`, `DTEND:${icsDate(c.end)}`,
    `SUMMARY:${esc_(c.title)}`, `DESCRIPTION:${esc_(c.details)}`,
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${esc_(c.title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const name = `${slugify(c.title) || "partita"}.ics`;
  const file = new File([ics], name, { type: "text/calendar" });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: c.title }); return; } }
  catch (e) { if (e?.name === "AbortError") return; }
  downloadBlob(file, name);
  toast("File del calendario scaricato: aprilo per aggiungere la partita");
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ------------------------------------------------------------------ immagine da condividere */

const IMG_W = 1080;
function cvColors() {
  return { bg: "#0f1622", card: "#182233", ink: "#f2f5f9", ink2: "#a9b4c4", ink3: "#6f7c8f", go: "#12b36c", line: "#26324a" };
}
function cvSetup(h) {
  const c = document.createElement("canvas"); c.width = IMG_W; c.height = h;
  const x = c.getContext("2d"), C = cvColors();
  x.fillStyle = C.bg; x.fillRect(0, 0, IMG_W, h);
  return { c, x, C };
}
function font(x, size, weight = 700) { x.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; }
function rrect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function fitText(x, s, maxW) { s = String(s); if (x.measureText(s).width <= maxW) return s; while (s.length > 1 && x.measureText(s + "…").width > maxW) s = s.slice(0, -1); return s + "…"; }
function cvHeader(x, C, sub) {
  rrect(x, 60, 56, 64, 64, 14); x.fillStyle = "#0a9b5a"; x.fill();
  x.strokeStyle = "#fff"; x.lineWidth = 6; x.lineCap = "round"; x.beginPath(); x.moveTo(108, 70); x.lineTo(76, 106); x.stroke();
  x.fillStyle = "#fff"; x.beginPath(); x.arc(79, 75, 8, 0, 7); x.fill(); x.beginPath(); x.arc(105, 101, 8, 0, 7); x.fill();
  font(x, 40, 800); x.fillStyle = C.ink; x.textBaseline = "middle"; x.fillText("Pronostici", 142, 88);
  if (sub) { font(x, 28, 600); x.fillStyle = C.ink2; x.textAlign = "right"; x.fillText(fitText(x, sub, 470), IMG_W - 60, 88); x.textAlign = "left"; }
}
function cvFooter(x, C, H) {
  font(x, 24, 600); x.fillStyle = C.ink3; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText("Stime statistiche, non certezze · " + location.host, IMG_W / 2, H - 50); x.textAlign = "left";
}
function cvTeam(x, C, name, color, cx, cy, full = name) {
  x.fillStyle = color || C.ink3; x.beginPath(); x.arc(cx, cy, 58, 0, 7); x.fill();
  x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 4; x.stroke();
  const ini = String(full).split(/\s+/).filter(w => /^[A-Za-zÀ-ÿ]/.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  font(x, 40, 800); x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(ini, cx, cy + 2);
  font(x, 34, 800); x.fillStyle = C.ink; x.fillText(fitText(x, name, 380), cx, cy + 100); x.textAlign = "left";
}
function cvBar(x, C, X, Y, W, label, p, color, big = false) {
  font(x, big ? 30 : 28, 700); x.fillStyle = C.ink2; x.textBaseline = "middle";
  x.fillText(fitText(x, label, W - 160), X, Y);
  font(x, big ? 40 : 34, 800); x.fillStyle = C.ink; x.textAlign = "right"; x.fillText(pct(p), X + W, Y); x.textAlign = "left";
  rrect(x, X, Y + 26, W, 14, 7); x.fillStyle = C.line; x.fill();
  rrect(x, X, Y + 26, Math.max(14, W * p), 14, 7); x.fillStyle = color || C.go; x.fill();
}

/* le giocate più probabili di una partita, per l'immagine (le scontate sopra il 92% restano fuori) */
function topPicks(d) {
  const m = d.markets || {}, H = d.home.short || d.home.name, A = d.away.short || d.away.name, out = [];
  if (d.sport === "soccer") {
    (m["1x2"] || []).forEach((p, i) => out.push([[`${H} vince`, "Pareggio", `${A} vince`][i], p]));
    Object.entries(m.dc || {}).forEach(([k, p]) => out.push([{ "1X": `${H} o pareggio`, X2: `${A} o pareggio`, "12": "Una delle due vince" }[k] || k, p]));
    for (const k of ["1.5", "2.5", "3.5"]) if (m.ou?.[k] != null) { out.push([`Over ${k.replace(".", ",")}`, m.ou[k]]); out.push([`Under ${k.replace(".", ",")}`, 1 - m.ou[k]]); }
    if (m.btts != null) { out.push(["Goal", m.btts]); out.push(["No Goal", 1 - m.btts]); }
  } else if (d.sport === "nba") {
    (m.win || []).forEach((p, i) => out.push([`${i ? d.away.name : d.home.name} vince`, p]));
    const tl = m.total_line, tp = m.totals?.[String(tl)];
    if (tl != null && tp != null) { out.push([`Over ${String(tl).replace(".", ",")} punti`, tp]); out.push([`Under ${String(tl).replace(".", ",")} punti`, 1 - tp]); }
  } else {
    (m.win || []).forEach((p, i) => out.push([`${lastName(i ? d.away.name : d.home.name)} vince`, p]));
    for (const [k, p] of Object.entries(m.totals || {})) { out.push([`Over ${k.replace(".", ",")} game`, p]); }
    for (const [k, p] of Object.entries(m.sets || {})) out.push([`Finisce ${k} nei set`, p]);
  }
  return out.filter(([, p]) => p != null && p <= 0.92 && p >= 0.4).sort((a, b) => b[1] - a[1]).slice(0, 3);
}

function matchCanvas(d) {
  const H = 1350, { c, x, C } = cvSetup(H);
  const when = `${fmtDay(d.date).rel || fmtShort(d.date)}, ${fmtTime(d.date, d.time_valid)}`;
  cvHeader(x, C, d.league_name || "");
  const [cH, cA] = d.sport === "tennis" ? (typeof flagColors === "function" ? flagColors(d.players?.home?.cc, d.players?.away?.cc) : [C.go, C.ink3]) : teamColors(d.home, d.away);
  // squadre
  rrect(x, 40, 160, IMG_W - 80, 380, 32); x.fillStyle = C.card; x.fill();
  font(x, 28, 600); x.fillStyle = C.ink2; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(when, IMG_W / 2, 210); x.textAlign = "left";
  cvTeam(x, C, d.sport === "tennis" ? lastName(d.home.name) : d.home.name, cH, 290, 330, d.home.name);
  cvTeam(x, C, d.sport === "tennis" ? lastName(d.away.name) : d.away.name, cA, IMG_W - 290, 330, d.away.name);
  font(x, 44, 800); x.fillStyle = C.ink3; x.textAlign = "center"; x.fillText("vs", IMG_W / 2, 330); x.textAlign = "left";
  const fin = d.final;
  if (!fin && d.sport === "soccer" && d.markets?.xg) { font(x, 28, 600); x.fillStyle = C.ink2; x.textAlign = "center"; x.fillText(`Gol attesi ${num(d.markets.xg[0], 2)} – ${num(d.markets.xg[1], 2)}`, IMG_W / 2, 495); x.textAlign = "left"; }
  if (!fin && d.sport === "nba" && d.markets?.exp) { font(x, 28, 600); x.fillStyle = C.ink2; x.textAlign = "center"; x.fillText(`Punteggio atteso ${Math.round(d.markets.exp[0])} – ${Math.round(d.markets.exp[1])}`, IMG_W / 2, 495); x.textAlign = "left"; }
  if (fin) { font(x, 30, 800); x.fillStyle = C.go; x.textAlign = "center"; x.fillText(`Finita ${fin.sets ? fin.sets[0].map((g, i) => `${g}-${fin.sets[1][i]}`).join(" ") : `${fin.h}-${fin.a}`}`, IMG_W / 2, 500); x.textAlign = "left"; }
  // esito
  let Y = 600;
  font(x, 32, 800); x.fillStyle = C.ink; x.fillText("Chi vince", 60, Y); Y += 60;
  const probs = d.sport === "soccer" ? d.markets["1x2"] : d.markets.win;
  const labs = d.sport === "soccer" ? [d.home.short || d.home.name, "Pareggio", d.away.short || d.away.name] : [d.home.name, d.away.name].map(n => d.sport === "tennis" ? lastName(n) : n);
  const cols = d.sport === "soccer" ? [cH, C.ink3, cA] : [cH, cA];
  probs.forEach((p, i) => { cvBar(x, C, 60, Y, IMG_W - 120, labs[i], p, cols[i], true); Y += 92; });
  // giocate
  const picks = topPicks(d);
  if (picks.length) {
    Y += 20; font(x, 32, 800); x.fillStyle = C.ink; x.fillText("Le giocate più probabili", 60, Y); Y += 60;
    for (const [l, p] of picks) { cvBar(x, C, 60, Y, IMG_W - 120, l, p, C.go); Y += 84; }
  }
  cvFooter(x, C, H);
  return c;
}

function slipCanvas(legs, title = "La mia schedina") {
  const rows = legs.slice(0, 10), H = Math.max(900, 420 + rows.length * 128 + 160);
  const { c, x, C } = cvSetup(H);
  cvHeader(x, C, `${legs.length} ${legs.length === 1 ? "giocata" : "giocate"}`);
  font(x, 44, 800); x.fillStyle = C.ink; x.textBaseline = "middle"; x.fillText(fitText(x, title, IMG_W - 120), 60, 200);
  const prod = legs.reduce((a, f) => a * (f.p || 1), 1);
  rrect(x, 40, 250, IMG_W - 80, 120, 28); x.fillStyle = C.card; x.fill();
  font(x, 26, 600); x.fillStyle = C.ink2; x.fillText("Probabilità che escano tutte", 80, 290); x.fillText("Quota equa", 640, 290);
  font(x, 44, 800); x.fillStyle = C.go; x.fillText(pct(prod), 80, 335); x.fillStyle = C.ink; x.fillText(odd(prod), 640, 335);
  let Y = 420;
  for (const f of rows) {
    rrect(x, 40, Y, IMG_W - 80, 108, 22); x.fillStyle = C.card; x.fill();
    const res = f.result === "win" ? ["✓", C.go] : f.result === "lose" ? ["✗", "#e5484d"] : null;
    font(x, 32, 800); x.fillStyle = C.ink; x.fillText(fitText(x, f.label, IMG_W - 330), 76, Y + 38);
    font(x, 24, 600); x.fillStyle = C.ink2; x.fillText(fitText(x, `${f.match}${f.date ? `, ${fmtDay(f.date).rel || fmtShort(f.date)} ${fmtTime(f.date, f.time_valid)}` : ""}`, IMG_W - 330), 76, Y + 76);
    font(x, 38, 800); x.fillStyle = res ? res[1] : C.go; x.textAlign = "right"; x.fillText(res ? res[0] : pct(f.p), IMG_W - 76, Y + 54); x.textAlign = "left";
    Y += 128;
  }
  if (legs.length > rows.length) { font(x, 26, 600); x.fillStyle = C.ink3; x.fillText(`e altre ${legs.length - rows.length}`, 60, Y + 10); }
  cvFooter(x, C, H);
  return c;
}

/* anteprima in una finestra dal basso, poi Condividi (WhatsApp e le altre app) o Salva */
function imageSheet(canvas, name, title) {
  const url = canvas.toDataURL("image/png");
  const { el } = openSheet(`<h3 class="sheet-t">Condividi come immagine</h3>
    <img class="share-prev" src="${url}" alt="Anteprima dell'immagine">
    <div class="sheet-acts"><button type="button" class="btn-main alt" data-save>Salva</button><button type="button" class="btn-main" data-share>Condividi</button></div>`, { label: "Condividi come immagine" });
  const blob = () => new Promise(res => canvas.toBlob(res, "image/png"));
  el.querySelector("[data-save]").onclick = async () => { downloadBlob(await blob(), name); toast("Immagine salvata"); };
  el.querySelector("[data-share]").onclick = async () => {
    const file = new File([await blob()], name, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
    } catch (e) { if (e?.name === "AbortError") return; }
    downloadBlob(file, name);
    toast("Il telefono non permette di condividerla da qui: l'ho salvata, mandala dalla galleria");
  };
}
function shareSlipImage(legs, title) {
  imageSheet(slipCanvas(legs, title), `schedina-${slugify(title) || "pronostici"}.png`, title);
}
