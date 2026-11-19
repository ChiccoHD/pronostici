"use strict";
/* Pronostici — area personale ("Tu") e pagina Info (come funziona, affidabilità, stato dei dati). Usa funzioni di app.js. */

/* ------------------------------------------------------------------ area personale */

function showMe() {
  const teams = myTeams(), slips = mySlips(), hist = favs().filter(f => f.result);
  const st = s => slipState(s).cls;
  const openSlips = slips.filter(s => !["win", "lose"].includes(st(s))), won = slips.filter(s => st(s) === "win"), lost = slips.filter(s => st(s) === "lose");
  const closed = meClosed();
  let html = meHero(teams, openSlips, won, lost, closed) + meTrend(closed, slips) + meBadges(closed, slips, teams);

  // squadre seguite e loro prossime partite
  const names = t => new Set([t.name, t.short].filter(Boolean));
  const evs = [], seen = new Set();
  for (const t of teams) for (const e of INDEX.events.filter(e => !e.final && teamPlays(t, e)).slice(0, 2))
    if (!seen.has(e.id)) { seen.add(e.id); evs.push(e); }
  evs.sort((a, b) => a.date.localeCompare(b.date));
  const href = t => t.kind === "player" ? playerHref(t.lk, t.id) : teamHref(t.lk, t.id);
  const nextOf = t => INDEX.events.filter(e => !e.final && teamPlays(t, e)).sort((a, b) => a.date.localeCompare(b.date))[0];
  html += sec(`${meIc("⭐", "#f5b301")}Le mie squadre`, teams.length
    ? `<div class="me-cards">${teams.map((t, i) => {
        const c = t.color ? "#" + String(t.color).replace("#", "") : t.kind === "player" ? "#3b82f6" : "#0a9b5a", n = nextOf(t);
        const opp = n ? (names(t).has(n.home) ? `contro ${n.away}` : `contro ${n.home}`) : "";
        return `<div class="me-card" style="--tc:${c}"><a href="${href(t)}"><span class="me-card-logo">${t.logo ? img(t.logo, t.kind === "player" ? "tflag" : "tlogo") : `<span class="mono">${esc(initials(t.name))}</span>`}</span>
          <b>${esc(t.short || t.name)}</b><small>${n ? `${esc(fmtDay(n.date).rel || fmtShort(n.date))} ${esc(fmtTime(n.date, n.time_valid))}<br>${esc(opp)}` : "nessuna partita a breve"}</small></a>
          <button type="button" class="me-x" data-unfollow="${i}" aria-label="Smetti di seguire ${esc(t.name)}">×</button></div>`;
      }).join("")}</div>
      <h3 class="lb-h3">Prossime partite</h3>${evs.length ? evs.slice(0, 8).map(e => `<section class="group">${fixture(e)}</section>`).join("") : `<p class="note">Nessuna loro partita nei prossimi giorni.</p>`}`
    : `<p class="note">Non segui ancora nessuna squadra. Apri la pagina di una squadra (dalle <a href="#/classifiche">Classifiche</a> o toccandone il nome in una partita) o di un tennista e tocca <b>Segui</b>: qui troverai le loro prossime partite.</p>`,
    teams.length ? `${teams.length}` : "", "Tu squadre");

  // schedine salvate (complete, con quota, puntata ed esito) e storico delle giocate
  html += slips.length ? slipsSection() : sec("Le mie schedine", `<p class="note">Componi una schedina nella pagina Schedina e tocca <b>Salva come schedina</b>: la ritrovi qui, e l'app segna da sola se è vinta o persa.</p>
    <a class="btn-main" href="#/schedina" style="text-decoration:none">Vai alla schedina</a>`, "", "Tu schedine");
  html += playedHtml();

  // dati sul telefono
  const bAt = load("backup_at", ""), bDays = bAt ? Math.floor((Date.now() - Date.parse(bAt)) / 864e5) : null;
  html += sec(`${meIc("💾", "#64748b")}I tuoi dati`, `<p class="note" style="margin-top:0">Squadre seguite, schedine e storico restano solo su questo telefono. Per non perderli se cambi telefono o cancelli i dati del browser, crea un <b>link di backup</b>: aprendolo su un altro telefono ritrovi tutto.</p>
    <div class="bk-card ${bDays == null || bDays > 14 ? "warn" : ""}"><span class="bk-ic">🔗</span><span><b>Link di backup</b><small>${bDays == null ? "non ancora creato" : bDays === 0 ? "aggiornato oggi" : `ultimo ${bDays === 1 ? "ieri" : `${bDays} giorni fa`}`}${bDays != null && bDays > 14 ? ": conviene rifarlo" : ""}</small></span>
      <button type="button" class="btn-main" id="me-backup">${bAt ? "Aggiorna" : "Crea"}</button></div>
    <div class="me-acts"><button type="button" class="btn-main alt" id="me-export">Salva una copia in un file</button>
    <label class="btn-main alt" style="cursor:pointer">Ripristina da una copia<input type="file" id="me-import" accept="application/json,.json" hidden></label></div>`, "", "Tu dati");
  if (typeof notifSection === "function") html += notifSection();     // in fondo alla pagina
  $app.innerHTML = html;
  wireSlips();
  countUp($app);
  // festa per le schedine vinte non ancora festeggiate
  try {
    const seen = new Set(JSON.parse(load("cheered", "[]")));
    const fresh = won.filter(s => !seen.has(s.id));
    if (fresh.length) {
      fresh.forEach(s => seen.add(s.id)); save("cheered", JSON.stringify([...seen].slice(-100)));
      if (seen.size > fresh.length || fresh.length < 3) { confetti(); toast(fresh.length === 1 ? `🎉 ${fresh[0].name}: vinta!` : `🎉 ${fresh.length} schedine vinte!`); }
    }
  } catch { /* niente */ }
  if (typeof wireNotifs === "function") wireNotifs(); wirePlayed(); attachSlipStatus();

  document.getElementById("me-name")?.addEventListener("click", avatarSheet);
  $app.querySelectorAll("[data-unfollow]").forEach(b => b.onclick = () => { const l = myTeams(); l.splice(Number(b.dataset.unfollow), 1); saveMyTeams(l); showMe(); });
  document.getElementById("me-backup")?.addEventListener("click", makeBackupLink);
  document.getElementById("me-export").onclick = () => {
    const data = {};
    for (const k of Object.keys(localStorage)) if (k.startsWith("p_")) data[k] = localStorage.getItem(k);
    const blob = new Blob([JSON.stringify({ app: "pronostici", saved: new Date().toISOString(), data }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `pronostici-copia-${isoDay(Date.now())}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  document.getElementById("me-import").onchange = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const js = JSON.parse(await f.text());
      if (js.app !== "pronostici" || !js.data) throw new Error();
      if (!(await askConfirm("I dati attuali di questo telefono verranno sostituiti.", { title: "Ripristinare la copia?", ok: "Sì, ripristina" }))) return;
      for (const [k, v] of Object.entries(js.data)) if (k.startsWith("p_")) localStorage.setItem(k, v);
      toast("Dati ripristinati"); updateFavBadge(); showMe();
    } catch { toast("Questo file non è una copia di Pronostici"); }
  };
}

/* ------------------------------------------------------------------ backup in un link (niente server: i dati stanno nel link, compressi) */

const BACKUP_KEYS = ["p_slips", "p_favs", "p_myteams", "p_follow", "p_notif", "p_name", "p_avatar", "p_theme", "p_sport", "p_news_seen", "p_shut"];
const b64u = {
  enc: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0)),
};
async function zip(text, how) {
  const stream = new Blob([text]).stream().pipeThrough(how === "in" ? new CompressionStream("deflate-raw") : new DecompressionStream("deflate-raw"));
  return new Response(stream).arrayBuffer();
}
async function makeBackupLink() {
  try {
    const data = {};
    for (const k of BACKUP_KEYS) { const v = localStorage.getItem(k); if (v != null) data[k] = v; }
    if ((data.p_avatar || "").length > 2000) delete data.p_avatar;   // la foto personale resta sul telefono: allungherebbe troppo il link
    let enc;
    if ("CompressionStream" in window) {
      const buf = await zip(JSON.stringify({ v: 1, at: new Date().toISOString(), data }), "in");
      let bin = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode(...u.subarray(i, i + 8192));
      enc = "z" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } else enc = "j" + btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, data })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const url = `${location.origin}${location.pathname}#/ripristina/${enc}`;
    save("backup_at", new Date().toISOString());
    const nSl = JSON.parse(data.p_slips || "[]").length, nT = JSON.parse(data.p_myteams || "[]").length;
    const { el, close } = openSheet(`<h3 class="sheet-t">Il tuo link di backup</h3>
      <p class="sheet-p">Contiene ${nSl} ${nSl === 1 ? "schedina" : "schedine"}, ${nT} ${nT === 1 ? "squadra seguita" : "squadre seguite"}, lo storico delle giocate e le tue scelte. Salvalo dove lo ritrovi (note, email, messaggio a te stesso): aprendolo su un altro telefono ti chiedo se ripristinare tutto.</p>
      <p class="note">Il link contiene i tuoi dati: non mandarlo ad altri. Lunghezza: ${Math.round(url.length / 1024 * 10) / 10} kB.</p>
      <div class="sheet-acts"><button type="button" class="btn-main alt" data-copy>Copia</button>${navigator.share ? `<button type="button" class="btn-main" data-share>Salva o invia</button>` : ""}</div>`, { label: "Link di backup", onClose: () => location.hash.startsWith("#/tu") && showMe() });
    el.querySelector("[data-copy]").onclick = async () => { try { await navigator.clipboard.writeText(url); toast("Link copiato"); close(); } catch { toast("Non riesco a copiarlo: usa Salva o invia"); } };
    el.querySelector("[data-share]")?.addEventListener("click", async () => { try { await navigator.share({ title: "Backup Pronostici", url }); close(); } catch { /* annullato */ } });
  } catch (e) { toast("Backup non riuscito"); }
}
async function showRestore(enc) {
  $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Ripristina</h1><p class="muted" style="padding:8px 4px">Leggo il backup…</p>`;
  let js;
  try {
    if (enc[0] === "z") js = JSON.parse(new TextDecoder().decode(await zip(b64u.dec(enc.slice(1)), "out")));
    else js = JSON.parse(decodeURIComponent(escape(atob(enc.slice(1).replace(/-/g, "+").replace(/_/g, "/")))));
    if (!js?.data) throw new Error();
  } catch {
    $app.innerHTML = backBtn("Partite") + `<div class="empty"><b>Link di backup non valido</b>Forse è stato tagliato quando l'hai copiato: prova a riaprirlo per intero.</div>`;
    return;
  }
  const n = k => { try { return JSON.parse(js.data[k] || "[]").length; } catch { return 0; } };
  $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Ripristina il backup</h1>
    <section class="sec"><p>Backup del <b>${js.at ? esc(new Date(js.at).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" })) : "—"}</b>${js.data.p_name ? ` di <b>${esc(js.data.p_name)}</b>` : ""}.</p>
      <div class="me-tiles bk-tiles"><div class="me-tile"><b>${n("p_slips")}</b><span>schedine</span></div><div class="me-tile"><b>${n("p_myteams")}</b><span>squadre seguite</span></div><div class="me-tile"><b>${n("p_favs")}</b><span>giocate</span></div></div>
      <p class="note">Ripristinando, i dati di questo telefono vengono sostituiti da quelli del backup.</p>
      <button type="button" class="btn-main" id="bk-go" style="width:100%">Ripristina</button></section>`;
  document.getElementById("bk-go").onclick = async () => {
    if (!(await askConfirm("Schedine, squadre seguite e storico di questo telefono verranno sostituiti.", { title: "Ripristinare il backup?", ok: "Sì, ripristina" }))) return;
    for (const [k, v] of Object.entries(js.data)) if (BACKUP_KEYS.includes(k)) localStorage.setItem(k, v);
    toast("Backup ripristinato");
    if (typeof notifySync === "function") notifySync();
    history.replaceState(null, "", "#/tu"); location.reload();
  };
}

/* ------------------------------------------------------------------ area personale: intestazione, andamento, traguardi */

const meIc = (e, c) => `<span class="me-ic" style="--ic:${c}" aria-hidden="true">${e}</span>`;

/* tutte le giocate chiuse (singole e delle schedine), una volta sola, dalla più vecchia */
function meClosed() {
  const seen = new Set();
  return [...favs(), ...mySlips().flatMap(s => s.legs)]
    .filter(f => f.result && f.key && !seen.has(f.key) && seen.add(f.key))
    .sort((a, b) => (a.closed || a.date).localeCompare(b.closed || b.date));
}

function meHero(teams, openSlips, won, lost, closed) {
  const name = load("name", ""), h = new Date().getHours();
  const hi = h < 6 ? "Buonanotte" : h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
  const w = closed.filter(f => f.result === "win").length;
  let streak = 0;
  for (let i = closed.length - 1; i >= 0 && closed[i].result === closed[closed.length - 1].result; i--) streak++;
  const last = closed[closed.length - 1]?.result;
  const sub = openSlips.length ? `${openSlips.length} ${openSlips.length === 1 ? "schedina aperta" : "schedine aperte"}`
    : closed.length ? "Nessuna schedina aperta" : "Inizia salvando una schedina o seguendo una squadra";
  const streakTxt = streak >= 2 ? ` · ${streak} ${last === "win" ? "prese" : "perse"} di fila ${last === "win" ? "🔥" : "🧊"}` : "";
  const tile = (n, l) => `<div class="mh-tile"><b>${typeof n === "number" ? `<span data-count="${n}">${n}</span>` : n}</b><span>${l}</span></div>`;
  return `<section class="me-hero">
    <div class="mh-top"><button type="button" class="mh-av ${avatarCls()}" id="me-name" aria-label="Cambia nome e immagine">${avatarHtml(name)}<i class="mh-edit" aria-hidden="true">✎</i></button>
      <div class="mh-hi"><small>${hi}${name ? "," : ""}</small><b>${esc(name || "La tua area")}</b><span>${esc(sub)}${streakTxt}</span></div></div>
    <div class="mh-tiles">${tile(teams.length, teams.length === 1 ? "seguita" : "seguite")}${tile(`<span data-count="${won.length}">${won.length}</span><small>/${won.length + lost.length}</small>`, "schedine vinte")}
      ${tile(closed.length ? `<span data-count="${Math.round(100 * w / closed.length)}">${Math.round(100 * w / closed.length)}</span><small>%</small>` : "–", closed.length ? `prese su ${closed.length}` : "giocate prese")}</div>
    ${name ? "" : `<p class="mh-tip">Tocca la faccina per scegliere nome e immagine</p>`}
  </section>`;
}

/* andamento: bilancio in euro se ci sono schedine con quota e puntata, altrimenti giocate prese contro quelle attese */
function meTrend(closed, slips) {
  const money = slips.filter(s => s.odds && s.stake && ["win", "lose"].includes(slipState(s).cls))
    .sort((a, b) => Math.max(...a.legs.map(f => +new Date(f.date))) - Math.max(...b.legs.map(f => +new Date(f.date))));
  let series, title, right, legend;
  if (money.length >= 2) {
    let bal = 0;
    series = [[0, 0], ...money.map((s, i) => [i + 1, bal += slipState(s).cls === "win" ? s.stake * s.odds - s.stake : -s.stake])];
    title = "Il tuo bilancio";
    right = `${bal >= 0 ? "+" : "−"}${num(Math.abs(bal), 2)} €`;
    legend = `<span><i class="lg-a"></i>bilancio dopo ogni schedina chiusa (${money.length})</span>`;
    return sec(`${meIc("📈", "#0a9b5a")}${title}`, `<div class="me-chart ${bal >= 0 ? "up" : "down"}">${meSvg([series], bal >= 0 ? ["var(--go)"] : ["#e5484d"], true)}</div><div class="me-legend">${legend}</div>`, right, "Tu andamento");
  }
  if (closed.length < 3) return "";
  let w = 0, e = 0;
  const got = [[0, 0]], exp = [[0, 0]];
  closed.forEach((f, i) => { w += f.result === "win"; e += f.p || 0; got.push([i + 1, w]); exp.push([i + 1, e]); });
  const diff = w - e;
  return sec(`${meIc("📈", "#0a9b5a")}Il tuo andamento`, `<div class="me-chart">${meSvg([exp, got], ["var(--ink-3)", "var(--go)"], false)}</div>
    <div class="me-legend"><span><i class="lg-a"></i>giocate prese</span><span><i class="lg-b"></i>quelle che il modello si aspettava</span></div>
    <p class="note">${Math.abs(diff) < 1 ? "Sei in linea con le stime del modello." : diff > 0 ? `Ne hai prese ${num(diff, 1)} in più delle attese.` : `Ne hai prese ${num(-diff, 1)} in meno delle attese.`} Con poche giocate conta molto il caso.</p>`,
    `${w} su ${closed.length}`, "Tu andamento");
}
function meSvg(lines, colors, area) {
  const W = 320, H = 120, P = 6, pts = lines.flat();
  const xMax = Math.max(1, ...pts.map(p => p[0])), yMin = Math.min(0, ...pts.map(p => p[1])), yMax = Math.max(1, ...pts.map(p => p[1]));
  const X = x => P + (W - 2 * P) * x / xMax, Y = y => H - P - (H - 2 * P) * (y - yMin) / (yMax - yMin || 1);
  const path = l => l.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const zero = yMin < 0 ? `<line x1="${P}" x2="${W - P}" y1="${Y(0)}" y2="${Y(0)}" class="ch-zero"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Grafico dell'andamento">
    <defs><linearGradient id="chg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${colors[colors.length - 1]}" stop-opacity=".35"/><stop offset="1" stop-color="${colors[colors.length - 1]}" stop-opacity="0"/></linearGradient></defs>${zero}
    ${area || lines.length > 1 ? `<path d="${path(lines[lines.length - 1])}L${X(lines[lines.length - 1].at(-1)[0])},${Y(yMin)}L${X(0)},${Y(yMin)}Z" fill="url(#chg)"/>` : ""}
    ${lines.map((l, i) => `<path d="${path(l)}" fill="none" stroke="${colors[i]}" stroke-width="${i === lines.length - 1 ? 2.6 : 1.8}" ${i < lines.length - 1 ? 'stroke-dasharray="4 4"' : ""} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join("")}
    <circle cx="${X(lines.at(-1).at(-1)[0])}" cy="${Y(lines.at(-1).at(-1)[1])}" r="4" fill="${colors.at(-1)}"/></svg>`;
}

/* traguardi: piccoli obiettivi, accesi quando raggiunti */
function meBadges(closed, slips, teams) {
  let best = 0, run = 0;
  for (const f of closed) { run = f.result === "win" ? run + 1 : 0; best = Math.max(best, run); }
  const wonSlips = slips.filter(s => slipState(s).cls === "win");
  const sports = new Set(closed.filter(f => f.result === "win").map(f => f.sport).filter(Boolean));
  const B = [
    ["🎯", "Prima presa", "una giocata andata a segno", closed.some(f => f.result === "win")],
    ["🏆", "Schedina vinta", "la prima schedina vinta", wonSlips.length > 0],
    ["🔥", "Tris", "3 giocate prese di fila", best >= 3],
    ["⚡", "Cinquina", "5 giocate prese di fila", best >= 5],
    ["💎", "Colpo grosso", "schedina vinta con quota 5 o più", wonSlips.some(s => Number(s.odds || 0) >= 5 || s.legs.reduce((a, f) => a * f.p, 1) <= 0.2)],
    ["🌍", "Tuttofare", "prese in calcio, basket e tennis", sports.size >= 3],
    ["📣", "Tifoso", "segui almeno 3 squadre o tennisti", teams.length >= 3],
    ["📚", "Veterano", "50 giocate chiuse", closed.length >= 50],
  ];
  const got = B.filter(b => b[3]).length;
  return sec(`${meIc("🏅", "#a855f7")}Traguardi`, `<div class="me-badges">${B.map(([ic, t, d, ok]) =>
    `<div class="me-badge ${ok ? "ok" : ""}" title="${esc(d)}"><span>${ic}</span><b>${esc(t)}</b><small>${esc(d)}</small></div>`).join("")}</div>`,
    `${got} su ${B.length}`, "Tu traguardi");
}

/* ------------------------------------------------------------------ info: come funziona, affidabilità, stato */

const INFO_TABS = [
  ["come", "Come funziona", "📖", "Le stime spiegate"],
  ["affidabilita", "Affidabilità", "🎯", "Quanto ci prende"],
  ["archivio", "Archivio", "🗂️", "Partite passate"],
  ["dati", "Aggiornamenti", "🔔", "Dati e novità"]];

async function showInfoHub(tab) {
  tab = INFO_TABS.some(([k]) => k === tab) ? tab : "come";
  const tabs = `<div class="info-tabs" role="tablist">${INFO_TABS.map(([k, l, ic, sub]) => {
    const dot = k === "dati" && tab !== "dati" && typeof newsUnseen === "function" && newsUnseen();     // pallino: novità da vedere
    return `<a href="#/info/${k}" role="tab" aria-selected="${k === tab}" class="it-${k}${dot ? " has-news" : ""}"><span class="it-ic" aria-hidden="true">${ic}</span><span class="it-tx"><b>${l}</b><small>${sub}</small></span>${dot ? `<span class="sr-only"> (novità)</span>` : ""}</a>`;
  }).join("")}</div>`;
  $app.innerHTML = `<h1 class="page-h">Info</h1>${tabs}<p class="muted" style="padding:12px 4px">Caricamento…</p>`;
  let body = "";
  if (tab === "come") body = infoHow();
  if (tab === "affidabilita") body = await infoReliability();
  if (tab === "dati") { body = newsSection() + infoStatus(); markNewsSeen(); }
  if (tab === "archivio") body = await infoArchive();
  if (!location.hash.startsWith("#/info")) return;
  $app.innerHTML = `<h1 class="page-h">Info</h1>${tabs}${body}`;
}

/* ------------------------------------------------------------------ archivio dei pronostici (data/archive.json) */
let ARCHIVE = null, ARCH_SPORT = "all", ARCH_DAYS = 7;
let CALIB = null;
async function infoArchive() {
  if (!ARCHIVE) { try { ARCHIVE = await getJSON("data/archive.json"); } catch { ARCHIVE = { rows: [] }; } }
  const rows = (ARCHIVE.rows || []).filter(r => ARCH_SPORT === "all" || r.s === ARCH_SPORT);
  if (!(ARCHIVE.rows || []).length) return sec("Archivio", `<p class="note" style="margin:0">L'archivio si riempie man mano che le partite finiscono.</p>`, "", "Archivio");
  const top = r => r.p.indexOf(Math.max(...r.p));
  const out = r => r.s === "tennis" ? (r.r[2] ?? (r.r[0] > r.r[1] ? 0 : 1)) : r.p.length === 3 ? (r.r[0] > r.r[1] ? 0 : r.r[0] === r.r[1] ? 1 : 2) : (r.r[0] > r.r[1] ? 0 : 1);
  const rate = list => list.length ? list.filter(x => x).length / list.length : null;
  const box = (title, list, note = "") => {
    const r = rate(list);
    return `<div class="ar-box"><span class="ar-n">${r == null ? "–" : pct(r)}</span><b>${title}</b><small>${list.length ? `${list.filter(x => x).length} su ${list.length}` : "nessuna partita"}${note}</small></div>`;
  };
  const hitTop = rows.map(r => top(r) === out(r));
  const strong = rows.filter(r => Math.max(...r.p) >= 0.6).map(r => top(r) === out(r));
  const o25 = rows.filter(r => r.o != null && Math.max(r.o, 1 - r.o) >= 0.6).map(r => (r.o >= 0.5) === (r.r[0] + r.r[1] > 2.5));
  const gg = rows.filter(r => r.g != null && Math.max(r.g, 1 - r.g) >= 0.6).map(r => (r.g >= 0.5) === (r.r[0] > 0 && r.r[1] > 0));
  // il modello contro i bookmaker quando non sono d'accordo sulla favorita
  const dis = rows.filter(r => r.b && top(r) !== r.b.indexOf(Math.max(...r.b)));
  const disModel = dis.filter(r => top(r) === out(r)).length, disBook = dis.filter(r => r.b.indexOf(Math.max(...r.b)) === out(r)).length;
  // calibrazione: quando dice 60-70% esce davvero il 60-70% delle volte?
  const bands = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]].map(([lo, hi]) => {
    const l = rows.filter(r => { const m = Math.max(...r.p); return m >= lo && m < hi; });
    const avg = l.length ? l.reduce((a, r) => a + Math.max(...r.p), 0) / l.length : 0;
    return { lo, hi, n: l.length, avg, real: rate(l.map(r => top(r) === out(r))) };
  });
  const byLeague = {};
  for (const r of rows) (byLeague[r.ln.split(" · ")[0]] ||= []).push(top(r) === out(r));
  const leagues = Object.entries(byLeague).filter(([, l]) => l.length >= 4).sort((a, b) => rate(b[1]) - rate(a[1]));
  const days = [...new Set(rows.map(r => r.d.slice(0, 10)))].slice(0, ARCH_DAYS);
  // mese per mese: quante volte esce la favorita del modello rispetto a quanto la dava in media
  const months = {};
  for (const r of rows) (months[r.d.slice(0, 7)] ||= []).push(r);
  const monthRows = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).map(([k, l]) => {
    const real = rate(l.map(r => top(r) === out(r))), avg = l.reduce((a, r) => a + Math.max(...r.p), 0) / l.length;
    const name = new Date(k + "-15T12:00:00Z").toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const diff = real - avg;
    return `<div class="r"><span class="l"><b>${esc(name[0].toUpperCase() + name.slice(1))}</b> <span class="faint">${l.length} partite · la dava in media al ${pct(avg)}</span></span>
      <span class="v"><b class="${Math.abs(diff) <= .05 ? "" : diff > 0 ? "good" : "bad"}">${pct(real)}</b> presa</span></div>`;
  });
  if (!CALIB) { try { CALIB = await getJSON("data/calibration.json"); } catch { CALIB = { sports: {} }; } }
  const SPN = { soccer: "Calcio", nba: "Basket", tennis: "Tennis", f1: "F1" };
  const calTxt = Object.entries(CALIB.sports || {}).filter(([s]) => ARCH_SPORT === "all" || ARCH_SPORT === s).map(([s, c]) =>
    `<div class="r"><span class="l"><b>${SPN[s]}</b> <span class="faint">${c.n} partite</span></span><span class="v">${!c.t_fit ? `<span class="faint">${esc(c.nota || "ancora poche partite")}</span>`
      : Math.abs(c.t - 1) < .02 ? "nessuna correzione" : c.t < 1 ? "percentuali un po' più nette" : "percentuali un po' più prudenti"}</span></div>`).join("");
  const fx = r => {
    const e = { id: r.id, sport: r.s, league: r.l, league_name: r.ln, date: r.d + "Z", home: r.h, away: r.a, main: r.p, book: r.b,
      extra: { ...(r.o != null ? { "Over 2,5": r.o } : {}), ...(r.g != null ? { Goal: r.g } : {}) },
      final: { h: r.r[0], a: r.r[1], ...(r.r[2] != null ? { w: r.r[2] } : {}), st: "Finita" } };
    return fixtureDone(e).replace(/href="[^"]*"/, 'href="javascript:void 0"');
  };
  const sportBtn = (k, l) => `<button type="button" class="nt-chip" data-ar-sport="${k}" aria-pressed="${ARCH_SPORT === k}">${l}</button>`;
  return `<div class="mk-grid" style="margin-top:10px">${sportBtn("all", "Tutto")}${sportBtn("soccer", "Calcio")}${sportBtn("nba", "Basket")}${sportBtn("tennis", "Tennis")}</div>`
    + sec("In sintesi", `<div class="ar-grid">${box("Pronostico più probabile", hitTop)}${box("Quando il modello è sicuro", strong, " · favorita al 60% o più")}
        ${o25.length ? box("Over/Under 2,5", o25, " · quando è al 60% o più") : ""}${gg.length ? box("Goal/No Goal", gg, " · quando è al 60% o più") : ""}</div>
      <p class="note">Ultimi ${Math.round((Date.now() - Date.parse(rows[rows.length - 1]?.d + "Z")) / 864e5) + 1 || 0} giorni, ${rows.length} partite concluse. Le percentuali restano stime: servono tante partite perché questi numeri diventino stabili.</p>`, "", "Archivio sintesi")
    + sec("Quanto mantiene le promesse", `<div class="rows">${bands.filter(b => b.n).map(b => `<div class="r"><span class="l">Diceva <b>${Math.round(b.lo * 100)}–${Math.min(100, Math.round(b.hi * 100))}%</b> <span class="faint">(${b.n} partite, in media ${pct(b.avg)})</span></span><span class="v"><b class="${b.real >= b.avg - 0.05 ? "good" : "bad"}">${pct(b.real)}</b> uscite</span></div>`).join("")}</div>
      <p class="note">Se il modello è ben tarato, la colonna a destra somiglia alla percentuale che dava.</p>`, "", "Archivio calibrazione")
    + (monthRows.length ? sec("Mese per mese", `<div class="rows">${monthRows.join("")}</div><p class="note">Quante volte è uscito l'esito più probabile secondo il modello, rispetto alla probabilità che gli dava in media.</p>`, "", "Archivio mesi") : "")
    + (calTxt ? sec("Taratura automatica", `<div class="rows">${calTxt}</div><p class="note">Se nelle partite concluse il modello è stato troppo sicuro o troppo prudente sul risultato principale, le prossime percentuali vengono corrette di poco, sempre di più man mano che l'archivio cresce. Serve un minimo di 60 partite per sport.</p>`, "", "Archivio taratura") : "")
    + (dis.length ? sec("Modello contro bookmaker", `<p class="prose" style="margin:0">Nelle <b>${dis.length}</b> partite in cui non erano d'accordo sulla favorita, il modello ci ha preso <b>${disModel}</b> volte, i bookmaker <b>${disBook}</b>.</p>`, "", "Archivio quote") : "")
    + (leagues.length ? sec("Per competizione", `<div class="rows">${leagues.map(([l, h]) => `<div class="r"><span class="l">${esc(l)} <span class="faint">${h.length} partite</span></span><span class="v"><b>${pct(rate(h))}</b></span></div>`).join("")}</div>`, "pronostico più probabile preso", "Archivio campionati") : "")
    + sec("Partite", days.map(d => `<h3 class="lb-h3">${esc(fmtDay(d + "T12:00:00Z").label)}</h3><div class="ar-day">${rows.filter(r => r.d.startsWith(d)).map(fx).join("")}</div>`).join("")
      + (new Set(rows.map(r => r.d.slice(0, 10))).size > ARCH_DAYS ? `<button type="button" class="btn-main alt" data-ar-more>Mostra giorni precedenti</button>` : ""), "", "Archivio partite");
}
document.addEventListener("click", async ev => {
  const s = ev.target.closest("[data-ar-sport]"), m = ev.target.closest("[data-ar-more]");
  if (!s && !m) return;
  if (s) ARCH_SPORT = s.dataset.arSport;
  if (m) ARCH_DAYS += 7;
  const y = window.scrollY;
  await showInfoHub("archivio");
  window.scrollTo(0, y);
});

function infoHow() {
  const card = (ic, t, txt) => `<div class="how"><span class="how-ic">${ic}</span><div><b>${t}</b><p>${txt}</p></div></div>`;
  const term = (t, d) => `<div class="r"><span class="l"><b>${t}</b><br><span class="faint">${d}</span></span></div>`;
  return sec("In breve", `<div class="prose"><p>Per ogni partita l'app stima le probabilità di tutti gli esiti partendo dai dati delle partite già giocate. Sono <b>stime</b>, non certezze.</p>
      <p>I dati si aggiornano da soli sei volte al giorno (${UPDATE_TIMES}); il Live si aggiorna dal telefono ogni pochi secondi.</p></div>`, "", "Info breve")
    + sec("Come ragiona per ogni sport", card("⚽", "Calcio", "Quanto attacca e quanto difende ogni squadra, dalle ultime tre stagioni con più peso alle partite recenti. Usa gol, gol attesi (xG) e tiri in porta. Da lì calcola la probabilità di ogni risultato e tutti i mercati. Quando escono le formazioni ufficiali, se manca un titolare importante 1X2, Over e Goal vengono ritoccati.")
      + card("🏆", "Coppe europee", "Un modello unico su più campionati europei e sulle partite di coppa, che dicono quanto vale una squadra rispetto a quelle di altri paesi.")
      + card("🏀", "NBA", "Valutazione di attacco e difesa in punti, fattore campo, stanchezza nelle partite in due sere di fila e giocatori assenti (in base a quanto segnano e giocano), incrociata con il modello di ESPN.")
      + card("🎾", "Tennis", "Punteggio Elo generale e per superficie, poi una simulazione punto per punto per game, set e tie-break."), "", "Info sport")
    + sec("Parole che trovi nell'app", `<div class="rows glossary">
      ${term("Quota equa", "La quota giusta secondo il modello (1 diviso la probabilità). Se il sito paga meno, la giocata è sfavorevole secondo il modello.")}
      ${term("Punti dalle quote", "Quanto la stima del modello si discosta da quella dei bookmaker, senza il loro margine.")}
      ${term("Affidabilità", "Quanto il modello ci ha preso sulle partite già giocate di quella competizione: buona, discreta, da verificare.")}
      ${term("Tendenze", "Serie aperte nelle ultime partite (per esempio Over da 6 partite). Sono un'informazione, non un pronostico.")}
      ${term("Multipla", "Più giocate insieme: la probabilità che escano tutte è il prodotto delle singole, quindi scende in fretta.")}</div>`, "", "Info parole")
    + sec("Da dove arrivano i dati", `<div class="rows glossary">
      ${term("ESPN", "Calendari, tabellini, formazioni, risultati in diretta, infortuni NBA, quote di confronto.")}
      ${term("football-data.co.uk", "Risultati e statistiche del calcio (tiri, angoli, cartellini, xG) e quote medie.")}
      ${term("Understat, Wikipedia, TheSportsDB", "Gol attesi quando disponibili e foto dei giocatori.")}</div>
      <p class="note">Tutte gratuite. Le quote dei bookmaker non entrano mai nel calcolo: servono solo come confronto.</p>`, "", "Info fonti")
    + `<div class="care"><b>Gioca responsabilmente</b><p>Battere le quote con costanza è molto difficile. Se il gioco smette di essere un divertimento, il Telefono Verde dell'Istituto Superiore di Sanità risponde all'<a href="tel:800558822">800 558 822</a>, gratis e in forma anonima.</p></div>`;
}

async function infoReliability() {
  if (!REL) { try { REL = await getJSON("data/affidabilita.json"); } catch { REL = {}; } }
  const names = { "1x2": "Esito 1X2", ou25: "Over/Under 2,5", win: "Vincente", total: "Punti totali" };
  const sportOf = k => k.startsWith("calcio") || k.startsWith("coppe") || k.startsWith("nazionali") ? "Calcio" : k.startsWith("nba") ? "Basket" : k.startsWith("tennis") ? "Tennis" : "Altro";
  const groups = {};
  for (const [k, comp] of Object.entries(REL)) (groups[sportOf(k)] ||= []).push([k, comp]);
  if (!Object.keys(groups).length) return `<div class="empty"><b>Verifica non ancora disponibile</b>Compare dopo il primo aggiornamento dei dati.</div>`;
  const plain = s => {
    if (s.brier_book == null) return "Non ci sono quote con cui confrontarlo.";
    const d = s.brier - s.brier_book;
    return d <= 0.002 ? "Preciso quanto i bookmaker." : d <= 0.008 ? "Un po' meno preciso dei bookmaker." : "Meno preciso dei bookmaker: prendi le percentuali con cautela.";
  };
  let html = `<div class="prose rel-intro"><p>Il modello rifà le previsioni delle partite già giocate usando solo i dati di prima, e le confronta con com'è andata e con le quote dei bookmaker.</p>
    <p><span class="grade g2">buona</span> <span class="grade g1">discreta</span> <span class="grade g0">da verificare</span> &nbsp;Tocca una competizione per i dettagli.</p></div>`;
  for (const [sport, list] of Object.entries(groups)) {
    const rows = list.map(([k, comp]) => {
      const mk = Object.entries(comp).filter(([m, s]) => m !== "name" && m !== "espn" && s && s.n && s.brier != null);
      if (!mk.length) return "";
      const chips = mk.map(([m, s]) => `<span class="grade g${s.grade?.level ?? 0}" title="${esc(names[m] || m)}">${esc(names[m] || m)}</span>`).join("");
      const det = mk.map(([m, s]) => `<div class="rel-m"><b>${esc(names[m] || m)}</b> <span class="grade g${s.grade?.level ?? 0}">${esc(s.grade?.label || "")}</span>
        <p>${esc(plain(s))} Verificato su ${s.n} partite${s.calib_error != null ? `; quando dice una percentuale, in media sbaglia di ${num(s.calib_error * 100, 1)} punti` : ""}.</p>
        ${calibChart(s.calibration || [])}</div>`).join("");
      return `<details class="rel-row"><summary><span class="rel-n">${esc(comp.name || k)}</span><span class="rel-chips">${chips}</span></summary>${det}</details>`;
    }).join("");
    html += sec(sport, rows, "", `Affidabilità ${sport}`);
  }
  html += `<p class="note">Nei grafici, se i punti stanno sulla diagonale le percentuali sono ben tarate: quando il modello dice 60%, l'evento accade circa 6 volte su 10.</p>`;
  return html;
}

function infoStatus() {
  const st = META?.status || {};
  const label = { calcio: "Calcio", nba: "NBA", tennis: "Tennis", coppe: "Coppe europee", nazionali: "Nazionali", risultati: "Risultati finali" };
  const flat = v => Array.isArray(v) ? v.join(", ") : v && typeof v === "object" ? Object.entries(v).map(([a, b]) => `${a}: ${Array.isArray(b) ? b.join(", ") : b}`).join("; ") : String(v);
  const rows = Object.entries(st).map(([sport, s]) => {
    const parts = Object.entries(s).filter(([k]) => k !== "aggiornato");
    const bad = parts.some(([k, v]) => k === "errore" || /errore|non raggiungibile/i.test(flat(v)));
    return `<details class="rel-row"><summary><span class="rel-n">${esc(label[sport] || sport)}</span><span class="rel-chips"><span class="grade ${bad ? "g0" : "g2"}">${bad ? "con problemi" : "ok"}</span><small class="faint">${s.aggiornato ? esc(ago(s.aggiornato)) : ""}</small></span></summary>
      ${parts.map(([k, v]) => `<div class="status-line"><span>${esc(k.replace(/_/g, " "))}</span><span class="${/errore|non raggiungibile/i.test(flat(v)) || k === "errore" ? "err" : ""}">${esc(flat(v))}</span></div>`).join("")}</details>`;
  }).join("");
  return sec("Stato dei dati", `<p class="note" style="margin-top:0">Ultimo aggiornamento ${META?.updated ? esc(ago(META.updated)) : "non ancora eseguito"}. Prossimi verso le ${UPDATE_TIMES}.</p>${rows}`, "", "Info stato");
}

/* ------------------------------------------------------------------ immagine del profilo (solo su questo telefono, p_avatar) */
/* { t: "img", src: dataURL } foto personale ridotta | { t: "url", src } logo di una squadra o di un campionato | { t: "emoji", v, bg } */
function myAvatar() { try { return JSON.parse(localStorage.getItem("p_avatar") || "null"); } catch { return null; } }
function avatarCls() { const a = myAvatar(); return a ? `av-${a.t}` : ""; }
function avatarHtml(name = load("name", "")) {
  const a = myAvatar();
  if (a?.t === "img" || a?.t === "url") return `<img src="${esc(a.src)}" alt="" onerror="this.remove()">`;
  if (a?.t === "emoji") return `<span class="av-em" style="--avbg:${esc(a.bg || "#0a9b5a")}">${esc(a.v)}</span>`;
  return esc(name ? initials(name) : "🙂");
}
const AV_EMOJI = [["⚽", "#16a34a"], ["🏀", "#ea7a1a"], ["🎾", "#9aa51a"], ["🏎️", "#e10600"], ["🏆", "#d4a017"], ["🔥", "#e5484d"], ["⭐", "#6d5dfc"], ["🦁", "#c27c0e"],
  ["🐺", "#475569"], ["🦅", "#1d4ed8"], ["🍀", "#15803d"], ["🎯", "#be123c"], ["😎", "#0891b2"], ["👑", "#a16207"], ["🚀", "#7c3aed"], ["💎", "#0ea5e9"]];
const AV_FLAGS = ["🇮🇹", "🇪🇸", "🇬🇧", "🇩🇪", "🇫🇷", "🇵🇹", "🇳🇱", "🇧🇷", "🇦🇷", "🇺🇸", "🇯🇵", "🇨🇭", "🇧🇪", "🇭🇷", "🇷🇸", "🇲🇽"];
const AV_LEAGUES = ["serie-a", "premier-league", "la-liga", "bundesliga", "ligue-1", "champions", "europa-league", "brasileirao"];

/* riduce la foto scelta a un quadrato di 192 px (taglio centrale), così sta comoda nel telefono */
function avatarFromFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const S = 192, c = document.createElement("canvas"); c.width = c.height = S;
      const k = Math.min(im.naturalWidth, im.naturalHeight), sx = (im.naturalWidth - k) / 2, sy = (im.naturalHeight - k) / 2;
      const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(im, sx, sy, k, k, 0, 0, S, S);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", .82));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("immagine")); };
    im.src = url;
  });
}

function avatarSheet() {
  const name = load("name", ""), cur = myAvatar();
  const teams = myTeams().filter(t => t.logo);
  const opt = (data, inner, cls = "") => `<button type="button" class="av-opt ${cls}" data-av='${esc(JSON.stringify(data))}'>${inner}</button>`;
  const lg = AV_LEAGUES.filter(k => LEAGUE_LOGO[k]).map(k => opt({ t: "url", src: `${LG}500/${LEAGUE_LOGO[k]}.png` }, img(`${LG}500/${LEAGUE_LOGO[k]}.png`, "", ""), "logo")).join("")
    + opt({ t: "url", src: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png" }, img("https://a.espncdn.com/i/teamlogos/leagues/500/nba.png", ""), "logo");
  const { el, close } = openSheet(`<h3 class="sheet-t">Il tuo profilo</h3>
    <div class="av-head"><span class="mh-av big ${avatarCls()}">${avatarHtml(name)}</span>
      <label class="av-name">Nome<input class="sheet-in" id="av-name" type="text" maxlength="24" value="${esc(name)}" placeholder="Come ti chiami?"></label></div>
    <div class="av-acts"><label class="btn-main av-up">📷 Usa una tua foto<input type="file" accept="image/*" id="av-file" hidden></label>
      ${cur ? `<button type="button" class="btn-main alt" data-av="null">Togli l'immagine</button>` : ""}</div>
    <div class="av-scroll">
    ${teams.length ? `<h4 class="av-h">Le tue squadre</h4><div class="av-grid">${teams.map(t => opt({ t: "url", src: t.logo }, img(t.logo, ""), "logo")).join("")}</div>` : ""}
    <h4 class="av-h">Campionati</h4><div class="av-grid">${lg}</div>
    <h4 class="av-h">Simboli</h4><div class="av-grid">${AV_EMOJI.map(([v, bg]) => opt({ t: "emoji", v, bg }, `<span class="av-em" style="--avbg:${bg}">${v}</span>`)).join("")}</div>
    <h4 class="av-h">Bandiere</h4><div class="av-grid">${AV_FLAGS.map(v => opt({ t: "emoji", v, bg: "#e5e7eb" }, `<span class="av-em" style="--avbg:#e5e7eb">${v}</span>`)).join("")}</div>
    </div>
    <p class="sheet-p">Nome e immagine restano solo su questo telefono.</p>
    <div class="sheet-acts"><button type="button" class="btn-main alt" data-no>Annulla</button><button type="button" class="btn-main" data-yes>Salva</button></div>`, { label: "Il tuo profilo" });
  let pick = cur;
  const preview = () => { const h = el.querySelector(".av-head .mh-av"); const keep = localStorage.getItem("p_avatar");
    try { pick ? localStorage.setItem("p_avatar", JSON.stringify(pick)) : localStorage.removeItem("p_avatar"); h.className = `mh-av big ${avatarCls()}`; h.innerHTML = avatarHtml(el.querySelector("#av-name").value.trim()); }
    finally { keep == null ? localStorage.removeItem("p_avatar") : localStorage.setItem("p_avatar", keep); } };
  el.querySelectorAll("[data-av]").forEach(b => b.onclick = () => {
    pick = JSON.parse(b.dataset.av);
    el.querySelectorAll(".av-opt").forEach(x => x.classList.toggle("on", x === b));
    preview();
  });
  el.querySelector("#av-name").oninput = preview;
  el.querySelector("#av-file").onchange = async ev => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try { pick = { t: "img", src: await avatarFromFile(f) }; preview(); }
    catch { toast("Questa immagine non si apre: provane un'altra"); }
  };
  el.querySelector("[data-no]").onclick = close;
  el.querySelector("[data-yes]").onclick = () => {
    save("name", el.querySelector("#av-name").value.trim().slice(0, 24));
    try { pick ? localStorage.setItem("p_avatar", JSON.stringify(pick)) : localStorage.removeItem("p_avatar"); }
    catch { toast("Spazio pieno sul telefono: immagine non salvata"); }
    close(); showMe();
  };
}
