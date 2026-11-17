"use strict";
/* Pronostici — web app statica. Legge i file in data/ generati da GitHub Actions. */

const $app = document.getElementById("app");
const TZ = "Europe/Rome";
const UPDATE_TIMES = "7:15, 10:45, 13:45, 16:45, 19:45 e 23:15 (con l'ora legale un'ora dopo)";
const SPORTS = [
  { key: "all", label: "Tutto" },
  { key: "soccer", label: "Calcio" },
  { key: "nba", label: "Basket" },
  { key: "tennis", label: "Tennis" },
];
/* pallino dello sport: gli stessi colori dei riquadri dell'elenco */
const sportDot = k => k === "all" ? `<span class="sdots"><i class="g-soccer"></i><i class="g-nba"></i><i class="g-tennis"></i></span>` : `<span class="sdots"><i class="g-${k}"></i></span>`;
const LEAGUES = {
  soccer: [["serie-a", "Serie A"], ["premier-league", "Premier"], ["la-liga", "LaLiga"], ["bundesliga", "Bundesliga"], ["ligue-1", "Ligue 1"],
    ["champions", "Champions"], ["europa-league", "Europa League"], ["conference", "Conference"], ["champions-femminile", "Champions femminile"],
    ["primeira-liga", "Portogallo"], ["eredivisie", "Eredivisie"], ["serie-b", "Serie B"], ["championship", "Championship"],
    ["super-lig", "Süper Lig"], ["scozia", "Scozia"], ["belgio", "Belgio"], ["eliteserien", "Norvegia"], ["mls", "MLS"], ["j1", "Giappone"],
    ["nations-league", "Nations League"], ["mondiali", "Mondiali"], ["europei", "Europei"], ["qual-europei", "Qual. Europei"],
    ["qual-mondiali", "Qual. Mondiali"], ["qual-mondiali-sudamerica", "Qual. Mondiali Sudamerica"], ["qual-mondiali-concacaf", "Qual. Mondiali CONCACAF"],
    ["qual-mondiali-asia", "Qual. Mondiali Asia"], ["qual-mondiali-africa", "Qual. Mondiali Africa"], ["copa-america", "Copa América"],
    ["coppa-africa", "Coppa d'Africa"], ["qual-coppa-africa", "Qual. Coppa d'Africa"], ["coppa-asia", "Coppa d'Asia"], ["gold-cup", "Gold Cup"],
    ["concacaf-nations", "Nations League CONCACAF"], ["amichevoli", "Amichevoli"]],
  tennis: [["atp", "ATP"], ["wta", "WTA"]],
};
/* logo di ogni campionato (da ESPN, con la versione per il tema scuro); bandiera dove ESPN non ce l'ha */
const LG = "https://a.espncdn.com/i/leaguelogos/soccer/";
const LEAGUE_LOGO = {
  "serie-a": 12, "premier-league": 23, "la-liga": 15, "bundesliga": 10, "ligue-1": 9, "primeira-liga": 14, "j1": 2199, "mls": 19,
  "serie-b": 99, "championship": 24, "eredivisie": 11, "super-lig": 18, "scozia": 45, "belgio": 6,
  "champions": 2, "europa-league": 2310, "conference": 20296, "champions-femminile": 2408,
  "nations-league": 2395, "mondiali": 4, "europei": 74, "qual-europei": 56, "qual-mondiali": 67, "qual-mondiali-sudamerica": 65,
  "qual-mondiali-concacaf": 64, "qual-mondiali-asia": 62, "qual-mondiali-africa": 63, "copa-america": 83, "coppa-africa": 76,
  "qual-coppa-africa": 76, "coppa-asia": 2243, "gold-cup": 59, "concacaf-nations": 2406, "amichevoli": 53,
};
const LEAGUE_FLAG = { "eliteserien": "🇳🇴" };
function leagueMark(key, sport) {
  if (LEAGUE_LOGO[key]) { const id = LEAGUE_LOGO[key];
    return `<span class="lgm">${img(`${LG}500/${id}.png`, "lg-l")}${img(`${LG}500-dark/${id}.png`, "lg-d")}</span>`; }
  if (key === "nba") return `<span class="lgm">${img("https://a.espncdn.com/i/teamlogos/leagues/500/nba.png", "lg-l")}${img("https://a.espncdn.com/combiner/i?img=/i/teamlogos/leagues/500-dark/nba.png&w=80&h=80&transparent=true", "lg-d")}</span>`;
  if (LEAGUE_FLAG[key]) return `<span class="lgm flag">${LEAGUE_FLAG[key]}</span>`;
  if (key === "atp" || key === "wta") return `<span class="lgm tour ${key}">${key.toUpperCase()}</span>`;
  return `<span class="group-dot g-${sport || "soccer"}"></span>`;
}
// all'apertura si vede la giornata di oggi (se non ci sono partite oggi, renderList torna a "Tutti")
const state = { sport: load("sport", "all"), league: load("league", "all"), tab: {}, formN: 5, side: "home", day: new Date().toLocaleDateString("en-CA") };
let INDEX = null, META = null, REL = null, BEST = null;

/* ------------------------------------------------------------------ utilità */

function load(k, d) { try { return localStorage.getItem("p_" + k) || d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem("p_" + k, v); } catch { /* niente */ } }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = p => p == null ? "–" : Math.round(p * 100) + "%";
const num = (x, d = 1) => x == null ? "–" : Number(x).toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const odd = p => p > 0.005 ? (1 / p).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–";
const line = s => String(s).replace(".", ",");
const surfaceIt = s => ({ Hard: "Cemento", Clay: "Terra rossa", Grass: "Erba" }[s] || s || "");
const statusIt = s => ({ "Out": "Fuori", "Day-To-Day": "In dubbio", "Questionable": "In dubbio", "Doubtful": "Improbabile", "Probable": "Probabile" }[s] || s || "");
const lastName = n => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p.slice(1).join(" ") : p[0]; };

function fmtTime(iso, valid = true) {
  if (valid === false) return "orario da definire";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
function dayKey(iso) { return new Date(iso).toLocaleDateString("it-IT", { timeZone: TZ }); }
function fmtDay(iso) {
  const d = new Date(iso), key = dayKey(iso);
  const rel = key === dayKey(Date.now()) ? "oggi" : key === dayKey(Date.now() + 864e5) ? "domani" : "";
  const label = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1), rel };
}
function fmtShort(iso) { return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "2-digit" }); }
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 2) return "adesso";
  if (m < 60) return `${m} min fa`;
  if (m < 48 * 60) return `${Math.round(m / 60)} ore fa`;
  return `${Math.round(m / 1440)} giorni fa`;
}

/* schedina: giocate salvate su questo telefono */
let CUR = null;                 // partita aperta: contesto per le giocate salvate
const FAVMETA = new Map();      // chiave -> dati della giocata mostrata
function favs() { try { return JSON.parse(localStorage.getItem("p_favs") || "[]"); } catch { return []; } }
function saveFavs(list) {
  // lo storico tiene al massimo le ultime 500 giocate chiuse
  const closed = list.filter(f => f.result).sort((a, b) => (b.closed || b.date).localeCompare(a.closed || a.date));
  if (closed.length > 500) { const drop = new Set(closed.slice(500).map(f => f.key)); list = list.filter(f => !drop.has(f.key)); }
  try { localStorage.setItem("p_favs", JSON.stringify(list)); } catch { /* niente */ }
  updateFavBadge();
  if (typeof notifySync === "function") notifySync();
}
const isFav = key => favs().some(f => f.key === key);
function favKey(label, p, book = null, ctx = CUR) {
  if (!ctx || p == null) return null;
  const key = `${ctx.event}|${label}`;
  FAVMETA.set(key, { key, event: ctx.event, match: ctx.match, date: ctx.date, time_valid: ctx.time_valid, league_name: ctx.league_name, sport: ctx.sport, label, p, book });
  return key;
}
function star(key) {
  if (!key) return "";
  const on = isFav(key);
  return `<button type="button" class="star ${on ? "on" : ""}" data-fav="${esc(key)}" aria-pressed="${on}" aria-label="${on ? "Togli dalla schedina" : "Aggiungi alla schedina"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg></button>`;
}
function toggleFav(key) {
  let list = favs();
  const had = list.some(f => f.key === key);
  if (had) list = list.filter(f => f.key !== key);
  else if (FAVMETA.has(key)) list.push({ ...FAVMETA.get(key), added: new Date().toISOString() });
  saveFavs(list);
  document.querySelectorAll(`[data-fav="${CSS.escape(key)}"]`).forEach(b => { b.classList.toggle("on", !had); b.setAttribute("aria-pressed", String(!had)); });
  toast(had ? "Tolta dalla schedina" : "Aggiunta alla schedina");
  if (!had && typeof bumpSlipBar === "function") bumpSlipBar();
  if (location.hash.startsWith("#/schedina")) showSlip();
}
function updateFavBadge() {
  const n = favs().filter(f => new Date(f.date).getTime() > Date.now() - 3 * 3600e3).length;
  const el = document.getElementById("slip-count");
  if (el) { el.textContent = n; el.hidden = !n; }
  if (typeof updateSlipBar === "function") updateSlipBar();
}
let toastTimer = null;
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}
function toggleSec(h) {
  const s = h.closest("[data-sec]");
  if (!s) return;
  const k = s.dataset.sec, list = shutList().filter(x => x !== k);
  const shut = !s.classList.contains("shut");
  s.classList.toggle("shut", shut); h.setAttribute("aria-expanded", String(!shut));
  try { localStorage.setItem("p_shut", JSON.stringify(shut ? [...list, k].slice(-200) : list)); } catch { /* niente */ }
}
document.addEventListener("click", e => {
  const h = e.target.closest("[data-sec] > h2");
  if (h && !e.target.closest("button, a, input, select")) toggleSec(h);
});
document.addEventListener("keydown", e => {
  const h = e.target.closest?.("[data-sec] > h2");
  if (h && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleSec(h); }
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-fav]");
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  toggleFav(b.dataset.fav);
}, true);

/* colori squadra: leggibili sulla carta, distinti tra le due squadre */
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const v = parseInt(m[1], 16), c = [v >> 16, (v >> 8) & 255, v & 255].map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; });
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
function usable(hex) { const l = lum(hex); return l != null && l < .62 && l > .01; }
/* colori delle bandiere (codici ESPN a 3 lettere): per dare ai tennisti i colori del loro paese */
const FLAG_COLOR = {
  ita: ["#009246", "#ce2b37"], esp: ["#c60b1e", "#ffc400"], usa: ["#3c3b6e", "#b22234"], rus: ["#0039a6", "#d52b1e"], fra: ["#0055a4", "#ef4135"],
  ger: ["#dd0000", "#ffce00"], gbr: ["#012169", "#c8102e"], arg: ["#74acdf", "#f6b40e"], chi: ["#d52b1e", "#0039a6"], ukr: ["#0057b7", "#ffd700"],
  cze: ["#11457e", "#d7141a"], slo: ["#005ce6", "#ed1c24"], svk: ["#0b4ea2", "#ee1c25"], can: ["#d80621", "#8a0f1e"], aus: ["#00843d", "#ffcd00"],
  blr: ["#c8313e", "#4aa657"], kaz: ["#00afca", "#fec50c"], sui: ["#d52b1e", "#9e1b14"], bel: ["#fdda24", "#ef3340"], ned: ["#ff6c00", "#21468b"],
  pol: ["#dc143c", "#9d0f2b"], cro: ["#ff0000", "#171796"], srb: ["#c6363c", "#0c4076"], bra: ["#009c3b", "#ffdf00"], jpn: ["#bc002d", "#8a0021"],
  chn: ["#ee1c25", "#ffde00"], kor: ["#cd2e3a", "#0047a0"], gre: ["#0d5eaf", "#2a7ad1"], tur: ["#e30a17", "#9e0710"], den: ["#c8102e", "#8e0b20"],
  nor: ["#ba0c2f", "#00205b"], swe: ["#006aa7", "#fecc00"], fin: ["#002f6c", "#3b6fb6"], aut: ["#ed2939", "#a51d29"], hun: ["#ce2939", "#477050"],
  rom: ["#002b7f", "#fcd116"], bul: ["#00966e", "#d62612"], por: ["#006600", "#ff0000"], col: ["#fcd116", "#003893"], mex: ["#006847", "#ce1126"],
  lat: ["#9e3039", "#6e1f27"], est: ["#0072ce", "#1d1d1b"], ltu: ["#fdb913", "#006a44"], geo: ["#ff0000", "#a30000"], and: ["#10069f", "#fedf00"],
  tun: ["#e70013", "#a1000d"], egy: ["#ce1126", "#c09300"], ind: ["#ff9933", "#138808"], nzl: ["#00247d", "#cc142b"], rsa: ["#007a4d", "#ffb612"],
  bol: ["#d52b1e", "#007934"], per: ["#d91023", "#9c0b19"], ecu: ["#ffdd00", "#034ea2"], uru: ["#0038a8", "#fcd116"], par: ["#d52b1e", "#0038a8"],
  bih: ["#002395", "#fecb00"], mon: ["#ce1126", "#8f0c1a"], isr: ["#0038b8", "#4b74d6"], hkg: ["#de2910", "#9c1d0b"], tpe: ["#fe0000", "#000095"],
};
function flagColors(ccA, ccB) {
  const a = FLAG_COLOR[String(ccA || "").toLowerCase()], b = FLAG_COLOR[String(ccB || "").toLowerCase()];
  const ca = a ? a[0] : "#8a6aa8";
  let cb = b ? b[0] : "#a08a9e";
  if (cb.toLowerCase() === ca.toLowerCase()) cb = b ? b[1] : "#a08a9e";     // stesso paese: l'altro colore della bandiera
  return [ca, cb];
}

function teamColors(a, b) {
  const pick = (c, alt) => usable(c) ? c : usable(alt) ? alt : null;
  let ca = pick(a?.color, a?.alt) || "#6d5a6b", cb = pick(b?.color, b?.alt) || "#a08a9e";
  if (ca.toLowerCase() === cb.toLowerCase()) cb = usable(b?.alt) && b.alt.toLowerCase() !== ca.toLowerCase() ? b.alt : "#a08a9e";
  return [ca, cb];
}
const onColor = hex => (lum(hex) ?? 0) > .36 ? "#20162b" : "#ffffff";
function initials(name) {
  const p = String(name || "").replace(/[^\p{L}\s'-]/gu, "").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : (p[0]?.[1] || ""))).toUpperCase();
}
/* foto dei giocatori: collegate da ESPN tramite il loro numero, non copiate nel repository.
   Se la foto manca l'immagine si toglie da sola e restano le iniziali. Con i dati di esempio (inventati) niente foto. */
const HEADSHOT_DIR = { soccer: "soccer", nba: "nba", tennis: "tennis" };
let PHOTOS_ON = true;
function headshot(sport, pid) {
  return PHOTOS_ON && HEADSHOT_DIR[sport] && /^\d+$/.test(String(pid ?? "")) ? `https://a.espncdn.com/i/headshots/${HEADSHOT_DIR[sport]}/players/full/${pid}.png` : "";
}
function avatar(name, color, badge, photo) {
  const c = color || "#6d5a6b";
  return `<span class="ava" style="background:${c};color:${onColor(c)}" aria-hidden="true">${esc(initials(name))}${photo ? img(photo, "ava-ph") : ""}${badge ? `<small>${esc(badge)}</small>` : ""}</span>`;
}

function img(src, cls, alt = "") {
  return src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.remove()">` : "";
}

async function getJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status);
  if (r.headers.get("X-Copia")) offlineNotice();      // senza rete: il service worker ha dato l'ultima copia salvata
  return r.json();
}

/* ------------------------------------------------------------------ app veloce e senza rete (sw.js) */
function appBanner(id, html, onClick) {
  if (document.getElementById(id)) return;
  const b = document.createElement("button");
  b.type = "button"; b.id = id; b.className = "app-banner"; b.innerHTML = html;
  b.onclick = onClick;
  document.body.appendChild(b);
}
function offlineNotice() {
  appBanner("off-banner", `<b>Senza rete</b><span>stai vedendo gli ultimi dati salvati sul telefono · tocca per riprovare</span>`, () => location.reload());
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => null);
  const hadSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadSW) appBanner("upd-banner", `<b>Nuova versione dell'app</b><span>tocca per aggiornare</span>`, () => location.reload());
  });
  navigator.serviceWorker.addEventListener("message", ev => {
    if (ev.data?.type === "update") appBanner("upd-banner", `<b>Nuova versione dell'app</b><span>tocca per aggiornare</span>`, () => location.reload());
  });
  /* cerca le novità all'apertura e quando l'app torna in primo piano (al massimo una volta al minuto) */
  let lastCheck = 0;
  const checkApp = () => {
    if (Date.now() - lastCheck < 60000 || !navigator.onLine) return;
    lastCheck = Date.now();
    navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => null);
    navigator.serviceWorker.ready.then(r => r.active?.postMessage({ type: "check" })).catch(() => null);
  };
  setTimeout(checkApp, 2500);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkApp(); });
}
window.addEventListener("online", () => document.getElementById("off-banner")?.remove());

/* ------------------------------------------------------------------ avvio e navigazione */

/* tema: automatico (segue il telefono), chiaro, scuro */
const THEMES = [["auto", "Auto", '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>'],
  ["light", "Chiaro", '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
  ["dark", "Scuro", '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>']];
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const [, label, icon] = THEMES.find(x => x[0] === t) || THEMES[0];
  const btn = document.getElementById("theme");
  if (btn) { btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${label}`; btn.setAttribute("aria-label", `Tema: ${label}. Tocca per cambiare`); }
  const dark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", dark ? "#0d1117" : "#f3f5f7"));
}
(function initTheme() {
  let t = load("theme", "auto");
  applyTheme(t);
  const btn = document.getElementById("theme");
  if (btn) btn.onclick = () => { const i = THEMES.findIndex(x => x[0] === t); t = THEMES[(i + 1) % THEMES.length][0]; save("theme", t); applyTheme(t); };
})();

function measureHeader() {
  const h = document.querySelector(".top");
  if (h) document.documentElement.style.setProperty("--head", h.offsetHeight + "px");
}

async function boot() {
  measureHeader();
  window.addEventListener("resize", measureHeader);
  try {
    [INDEX, META] = await Promise.all([getJSON("data/index.json"), getJSON("data/meta.json")]);
  } catch {
    $app.innerHTML = `<div class="empty"><b>Ancora nessun dato</b>Il primo aggiornamento automatico creerà l'elenco delle partite.</div>`;
    return;
  }
  if (META.updated) {
    document.getElementById("updated").innerHTML = `<b>${esc(ago(META.updated))}</b>aggiornato`;
  }
  PHOTOS_ON = !META.sample;
  if (META.sample) {
    document.getElementById("banner").innerHTML = `<div class="banner">Stai guardando dati di esempio inventati: l'aggiornamento automatico non è ancora partito.</div>`;
  }
  measureHeader();
  updateFavBadge();
  window.addEventListener("hashchange", route);
  route();
}

function route() {
  const [view, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const navKey = ["info", "migliori", "schedina", "tu"].includes(view) ? view : view === "multipla" ? "schedina" : view === "affidabilita" ? "info" : "home";
  document.querySelectorAll("[data-nav]").forEach(a => a.dataset.nav === navKey ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  document.body.dataset.view = view || "home";
  window.scrollTo(0, 0);
  if (typeof layoutRoute === "function" && layoutRoute(view, arg)) return;   // computer: elenco a sinistra (layout.js)
  if (view === "e" && arg) return showEvent(decodeURIComponent(arg));
  if (view === "affidabilita") { location.replace("#/info/affidabilita"); return; }
  if (view === "tu") return showMe();
  if (view === "migliori") return showBest();
  if (view === "schedina") return showSlip();
  if (view === "info") return showInfoHub(arg);
  if (view === "live") { state.status = "live"; location.replace("#/"); return; }   // il Live ora è un filtro dell'elenco
  if (view === "multipla") return showMultipla();
  if (view === "cerca") return showSearch();
  if (view === "condividi" && arg) return showShared(arg);
  if (view === "tennista" && arg) { const [, , tour, name] = location.hash.split("/"); return showPlayer(decodeURIComponent(tour), decodeURIComponent(name || "")); }
  if (view === "classifiche") return showStandings(arg && decodeURIComponent(arg));
  if (view === "squadra" && arg) { const [, , lk, id] = location.hash.split("/"); return showTeam(decodeURIComponent(lk), decodeURIComponent(id || "")); }
  showList();
}

/* ------------------------------------------------------------------ elenco */

/* filtro per data: chiave giorno in ora italiana (AAAA-MM-GG) */
const isoDay = iso => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
function dayChipLabel(key) {
  const today = isoDay(Date.now()), tom = isoDay(Date.now() + 864e5), yest = isoDay(Date.now() - 864e5);
  if (key === today) return "Oggi";
  if (key === tom) return "Domani";
  if (key === yest) return "Ieri";
  const d = new Date(key + "T12:00:00");
  const s = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function dayChips(items, getDate, what = "partite", done = 0) {
  const counts = {};
  for (const it of items) { const k = isoDay(getDate(it)); counts[k] = (counts[k] || 0) + 1; }
  const keys = Object.keys(counts).sort();
  if (state.day !== "all" && !counts[state.day] && !(state.day === "done" && done)) state.day = "all";
  const today = isoDay(Date.now()), tom = isoDay(Date.now() + 864e5), yest = isoDay(Date.now() - 864e5);
  const cnt = n => what ? `<small>${n} ${what}</small>` : "";
  const chip = k => {
    const d = new Date(k + "T12:00:00");
    const top = k === today ? "Oggi" : k === tom ? "Domani" : k === yest ? "Ieri" : d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
    const month = d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
    return `<button data-day="${k}" class="${k === today ? "is-today" : k < today ? "is-past" : ""}" aria-pressed="${state.day === k}" aria-label="${esc(dayChipLabel(k))}, ${counts[k]} ${what || ""}">
      <span class="d-top">${esc(top)}</span><b>${d.getDate()}</b><span class="d-mon">${esc(month)}</span>${cnt(counts[k])}</button>`;
  };
  return `<div class="days" role="group" aria-label="Giorno"><button data-day="all" class="d-all" aria-pressed="${state.day === "all"}"><span class="d-top">Tutti</span><b>${items.filter(it => isoDay(getDate(it)) >= today).length}</b><span class="d-mon">${what || "giorni"}</span></button>${done ? `<button data-day="done" class="d-done" aria-pressed="${state.day === "done"}" aria-label="Partite concluse, ${done}"><span class="d-top">Concluse</span><b>${done}</b><span class="d-mon">esiti</span></button>` : ""}${keys.map(chip).join("")}</div>`;
}
if (!state.day) state.day = "all";

function showList() {
  if (typeof listInSide === "function" && listInSide()) return;   // computer: l'elenco sta nella colonna a sinistra
  renderList();
}
function renderList() {
  const now = Date.now();
  const bySport = INDEX.events.filter(e => (state.sport === "all" || e.sport === state.sport) && mkPass(e));
  const ended = bySport.filter(e => isEnded(e)).sort((a, b) => b.date.localeCompare(a.date));
  if (typeof applyFinals === "function") applyFinals();      // esiti già visti dal telefono
  const liveN = typeof liveNow === "function" ? liveNow(state.sport) : null;
  const nextIx = bySport.filter(e => Date.parse(e.date) > now);
  if (state.day === "done") { state.day = "all"; state.status = "done"; }
  if (!["all", "live", "next", "done"].includes(state.status)) state.status = "all";
  const st = state.status;
  // Tutte = da oggi in avanti (anche quelle finite oggi); Da giocare = non ancora iniziate; Concluse = con esito, dalla più recente
  const ahead = st === "next" ? nextIx : bySport.filter(e => !isPastDay(e));
  // nel calendario di Tutte ci sono anche i giorni passati (partite finite, restano tre giorni); "Tutti" resta da oggi in avanti
  const chipItems = st === "all" ? bySport : ahead;
  const byDay = st === "done" ? ended : st === "live" ? [] : state.day === "all" ? ahead : chipItems.filter(e => isoDay(e.date) === state.day);
  if (state.league !== "all" && !byDay.some(e => e.league === state.league)) state.league = "all";
  const evs = byDay.filter(e => state.league === "all" || e.league === state.league);
  const count = k => INDEX.events.filter(e => k === "all" || e.sport === k).length;
  let html = `<div class="search-row"><div class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
    <input id="q" type="search" placeholder="Cerca squadra o tennista" autocomplete="off" enterkeyhint="search" aria-label="Cerca" value="${esc(state.q || "")}"></div>
    <a class="std-btn" href="#/classifiche/${state.sport === "nba" ? "nba" : TABLE_LEAGUES.some(([k]) => k === state.league) ? state.league : ""}" aria-label="Classifiche"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg><span>Classifiche</span></a></div>
    <div id="search-res"></div><div id="list-main"><div class="filters"><div class="sports" role="group" aria-label="Sport">${SPORTS.map(s =>
    `<button data-sport="${s.key}" class="sp-${s.key}" aria-pressed="${state.sport === s.key}"><span class="sp-l">${sportDot(s.key)}${s.label}</span><small>${count(s.key)} partite</small></button>`).join("")}</div>`;
  const seg = [["all", "Tutte", bySport.filter(e => !isPastDay(e)).length], ["live", "In diretta", liveN ?? "…"], ["next", "Da giocare", nextIx.length], ["done", "Concluse", ended.length]];
  html += `<div class="status-seg" role="group" aria-label="Stato delle partite">${seg.map(([k, l, n]) =>
    `<button data-status="${k}" aria-pressed="${st === k}" class="st-${k}">${k === "live" ? `<i class="pulse-dot ${n > 0 ? "on" : ""}"></i>` : ""}${l}<small>${n}</small></button>`).join("")}</div>`;
  if (st === "all" || st === "next") html += dayChips(chipItems, e => e.date, "partite");
  // filtro per giocata: sotto il calendario
  html += `<div class="mk-row">${state.mk
    ? `<button type="button" class="mk-on" data-mk-open>🎯 ${esc(MK[state.mk.m][1])} almeno ${Math.round(state.mk.min * 100)}%</button><button type="button" class="mk-x" data-mk-clear aria-label="Togli il filtro">×</button>`
    : `<button type="button" class="mk-btn" data-mk-open>🎯 Filtra per giocata</button>`}</div>`;
  if (LEAGUES[state.sport] && st !== "live") {
    const n = {};
    for (const e of byDay) n[e.league] = (n[e.league] || 0) + 1;
    const opts = LEAGUES[state.sport].filter(([k]) => n[k]);
    if (opts.length > 1) html += `<div class="leagues" role="group" aria-label="Campionato">${[["all", "Tutti", byDay.length], ...opts.map(([k, l]) => [k, l, n[k]])].map(([k, l, c]) =>
      `<button data-league="${k}" aria-pressed="${state.league === k}">${k === "all" ? "" : leagueMark(k)}${l} <span>${c}</span></button>`).join("")}</div>`;
  }
  html += `</div>`;
  if (st === "live") html += `<div id="live-embed"></div>`;
  if (st === "done" && evs.length) {
    const scored = evs.filter(e => outcomeIx(e) != null), hit = scored.filter(e => outcomeIx(e) === e.main.indexOf(Math.max(...e.main)));
    if (scored.length) html += `<div class="done-sum"><b>${hit.length} su ${scored.length}</b> pronostici più probabili presi negli ultimi giorni (${pct(hit.length / scored.length)}). Tocca una partita per il confronto completo con quote ed esito.</div>`;
  }
  if (!evs.length && st === "done") html += `<div class="empty"><b>Nessuna partita conclusa</b>Le partite finite restano qui per tre giorni, con il risultato e il confronto con il pronostico.</div>`;
  else if (!evs.length && st !== "live") {
    const why = state.sport === "soccer" ? "Nei prossimi giorni non ci sono partite di questi campionati: succede durante le soste per le nazionali." : "Nei prossimi giorni non ci sono partite in programma per questa scelta.";
    html += `<div class="empty"><b>Nessuna partita in programma</b>${why}</div>`;
  }
  // per ogni giorno, un riquadro per campionato o torneo, nell'ordine della prima partita
  const days = new Map();
  for (const e of evs) {
    const k = isoDay(e.date);
    if (!days.has(k)) days.set(k, new Map());
    const g = groupName(e);
    const m = days.get(k);
    if (!m.has(g)) m.set(g, []);
    m.get(g).push(e);
  }
  for (const [k, groups] of days) {
    const d = fmtDay(groups.values().next().value[0].date);
    html += `<h2 class="day">${esc(d.label)}${d.rel ? `<span>${d.rel}</span>` : ""}</h2>`;
    for (const [g, list] of groups) {
      const gk = `${k}|${g}`;   // un riquadro = una competizione in un giorno
      const closed = closedGroups().includes(gk);
      html += `<section class="group ${closed ? "closed" : ""}"><button type="button" class="group-h" data-group="${esc(gk)}" aria-expanded="${!closed}">
        ${leagueMark(list[0].league, list[0].sport)}<b>${esc(g)}</b><small>${list.length} ${list.length === 1 ? "partita" : "partite"}${closed ? `, dalle ${fmtTime(list[0].date, list[0].time_valid)}` : ""}</small>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="group-body">${list.map(fixture).join("")}</div></section>`;
    }
  }
  $app.innerHTML = html + `</div>`;
  const q = document.getElementById("q");
  q.oninput = () => { state.q = q.value; runSearch(); };
  runSearch();
  $app.querySelectorAll("[data-sport]").forEach(b => b.onclick = () => {
    state.sport = b.dataset.sport; state.league = "all"; save("sport", state.sport); save("league", "all"); showList();
  });
  $app.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { state.day = b.dataset.day; showList(); });
  $app.querySelectorAll("[data-status]").forEach(b => b.onclick = () => { state.status = b.dataset.status; state.day = "all"; showList(); });
  $app.querySelectorAll("[data-mk-open]").forEach(b => b.onclick = showMarketSheet);
  $app.querySelectorAll("[data-mk-clear]").forEach(b => b.onclick = () => { state.mk = null; showList(); });
  if (st === "live" && typeof showLive === "function") setTimeout(() => showLive({ embed: true }), 0);
  // fuori dal filtro "In diretta": una lettura ogni tanto per il numero di partite in corso e gli esiti appena arrivati
  else if (typeof liveData === "function") liveData(60000).then(updateLiveCount).catch(() => null);
  $app.querySelectorAll("[data-group]").forEach(b => b.onclick = () => {
    const g = b.dataset.group, list = closedGroups();
    saveClosedGroups(list.includes(g) ? list.filter(x => x !== g) : [...list, g]);
    showListKeepScroll();
  });
  $app.querySelectorAll("[data-league]").forEach(b => b.onclick = () => {
    state.league = b.dataset.league; save("league", state.league); showList();
  });
}


function teamMark(logo, flag, color, cls = "") {
  if (logo) return img(logo, "tlogo " + cls);
  if (flag) return img(flag, "tflag " + cls);
  return `<span class="tdot" style="background:${color || "var(--ink-3)"}"></span>`;
}

/* riquadri chiusi: ricordati su questo telefono */
function closedGroups() { try { return JSON.parse(localStorage.getItem("p_closed") || "[]"); } catch { return []; } }
function saveClosedGroups(list) { try { localStorage.setItem("p_closed", JSON.stringify(list.slice(-60))); } catch { /* niente */ } }
/* ricerca: su tutte le partite in elenco, senza guardare i filtri */
const fold = s => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function runSearch() {
  const box = document.getElementById("search-res"), main = document.getElementById("list-main");
  if (!box || !main) return;
  const words = fold(state.q).split(/\s+/).filter(Boolean);
  if (!words.length) { box.innerHTML = ""; main.hidden = false; return; }
  main.hidden = true;
  const hay = e => fold(`${e.home} ${e.away} ${e.league_name} ${e.home_short || ""} ${e.away_short || ""}`);
  const found = INDEX.events.filter(e => words.every(w => hay(e).includes(w)));
  if (!found.length) { box.innerHTML = `<div class="empty"><b>Nessuna partita trovata</b>Controlla il nome o prova con una parte (per esempio "Inter" o "Sinner"). Si cercano solo le partite dei prossimi giorni.</div>`; return; }
  let html = "", day = null;
  for (const e of found) {
    const k = isoDay(e.date);
    if (k !== day) { const d = fmtDay(e.date); html += `<h2 class="day">${esc(d.label)}${d.rel ? `<span>${d.rel}</span>` : ""}</h2>`; day = k; }
    html += `<section class="group"><div class="group-h static">${leagueMark(e.league, e.sport)}<b>${esc(groupName(e))}</b></div>${fixture(e)}</section>`;
  }
  box.innerHTML = `<p class="note" style="margin:4px 2px 10px">${found.length} ${found.length === 1 ? "partita trovata" : "partite trovate"}</p>` + html;
}
function showListKeepScroll() { const y = window.scrollY; showList(); window.scrollTo(0, y); }

function groupName(e) {
  if (e.sport === "tennis") return e.league_name.replace(" · ", " – ");
  return e.league_name;
}

/* ------------------------------------------------------------------ partite concluse */
/* indice dell'esito uscito (0 = 1, 1 = X oppure 2 nelle sfide a due, 2 = 2); null se non c'è */
function outcomeIx(e, f = e.final) {
  if (!f || f.void || f.h == null) return null;
  if (e.sport === "tennis") return f.w ?? (f.h > f.a ? 0 : 1);
  if (e.main.length === 3) return f.h > f.a ? 0 : f.h === f.a ? 1 : 2;
  return f.h > f.a ? 0 : 1;
}
const isEnded = e => !!e.final || Date.now() - new Date(e.date).getTime() > (e.sport === "tennis" ? 30 : 4) * 3600e3;
const isPastDay = e => isoDay(e.date) < isoDay(Date.now());

/* ------------------------------------------------------------------ filtro per giocata */
const totKey = e => Object.keys(e.extra || {}).find(k => /^Over \d+\.5$/.test(k));
const MARKETS = [
  ["fav", "Vince la favorita", e => Math.max(e.main[0], e.main[e.main.length - 1])],
  ["1", "1", e => e.main[0]],
  ["X", "X", e => e.main.length === 3 ? e.main[1] : null],
  ["2", "2", e => e.main[e.main.length - 1]],
  ["1X", "1X", e => e.main.length === 3 ? e.main[0] + e.main[1] : null],
  ["X2", "X2", e => e.main.length === 3 ? e.main[1] + e.main[2] : null],
  ["o25", "Over 2,5", e => e.extra?.["Over 2,5"] ?? null],
  ["u25", "Under 2,5", e => e.extra?.["Over 2,5"] != null ? 1 - e.extra["Over 2,5"] : null],
  ["gg", "Goal", e => e.extra?.Goal ?? null],
  ["ng", "No Goal", e => e.extra?.Goal != null ? 1 - e.extra.Goal : null],
  ["ot", "Over punti/game", e => { const k = totKey(e); return k ? e.extra[k] : null; }],
  ["ut", "Under punti/game", e => { const k = totKey(e); return k ? 1 - e.extra[k] : null; }],
];
const MK = Object.fromEntries(MARKETS.map(m => [m[0], m]));
const mkValue = e => state.mk ? MK[state.mk.m]?.[2](e) : null;
const mkPass = e => !state.mk || (mkValue(e) ?? -1) >= state.mk.min;
function mkLabel(e) {
  if (!state.mk) return "";
  const [k, l] = MK[state.mk.m];
  if (k === "ot" || k === "ut") { const t = totKey(e); return t ? `${k === "ot" ? "Over" : "Under"} ${line(t.slice(5))}` : l; }
  if (k === "fav") return `Vince ${e.main[0] >= e.main[e.main.length - 1] ? e.home : e.away}`;
  return l;
}
function showMarketSheet() {
  const cur = state.mk || { m: "o25", min: 0.65 };
  const { el, close } = openSheet(`<h3 class="sheet-t">Filtra per giocata</h3>
    <p class="sheet-p">Mostra solo le partite in cui la giocata scelta ha almeno la probabilità indicata.</p>
    <div class="mk-grid">${MARKETS.map(([k, l]) => `<button type="button" class="nt-chip" data-mk="${k}" aria-pressed="${cur.m === k}">${l}</button>`).join("")}</div>
    <h3 class="lb-h3">Almeno</h3>
    <div class="mk-grid">${[0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85].map(v => `<button type="button" class="nt-chip" data-mkmin="${v}" aria-pressed="${cur.min === v}">${Math.round(v * 100)}%</button>`).join("")}</div>
    <div class="sheet-acts"><button type="button" class="btn-main alt" data-mk-off>Togli il filtro</button><button type="button" class="btn-main" data-mk-ok>Mostra</button></div>`, { label: "Filtra per giocata" });
  let pick = { ...cur };
  el.querySelectorAll("[data-mk]").forEach(b => b.onclick = () => { pick.m = b.dataset.mk; el.querySelectorAll("[data-mk]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
  el.querySelectorAll("[data-mkmin]").forEach(b => b.onclick = () => { pick.min = Number(b.dataset.mkmin); el.querySelectorAll("[data-mkmin]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
  el.querySelector("[data-mk-ok]").onclick = () => { state.mk = pick; close(); showList(); };
  el.querySelector("[data-mk-off]").onclick = () => { state.mk = null; close(); showList(); };
}

function fixture(e) {
  if (e.final) return fixtureDone(e);
  const three = e.main.length === 3;
  const pH = e.main[0], pA = e.main[three ? 2 : 1];
  const [cH, cA] = e.sport === "tennis" ? flagColors(e.home_short, e.away_short) : teamColors({ color: e.home_color }, { color: e.away_color });
  const max = Math.max(...e.main);
  const labels = three ? ["1", "X", "2"] : ["1", "2"];
  const sub = [];
  if (state.mk && mkValue(e) != null) sub.push(`<span class="mk-hit">${esc(mkLabel(e))} <b>${pct(mkValue(e))}</b></span>`);
  for (const [k, v] of Object.entries(e.extra || {})) if (v != null && !state.mk) sub.push(`${esc(line(k))} <b>${pct(v)}</b>`);
  if (e.sport === "nba" && e.exp_score) sub.push(`atteso <b>${Math.round(e.exp_score[0])}–${Math.round(e.exp_score[1])}</b>`);
  if (e.out && (e.out[0].length || e.out[1].length)) sub.push(`<span class="out-tag">🚑 fuori ${esc([...e.out[0], ...e.out[1]].map(lastName).join(", "))}</span>`);
  if (e.sport === "tennis" && e.surface) sub.push(surfaceIt(e.surface));
  if (e.book) {
    const gap = Math.max(...e.main.map((p, i) => Math.abs(p - (e.book[i] ?? p))));
    if (gap >= 0.07) sub.push(`<span class="gap">${Math.round(gap * 100)} punti dalle quote</span>`);
  }
  return `<a class="fx tc" style="--ch:${cH};--ca:${cA}" href="#/e/${encodeURIComponent(e.id)}">
    <div class="fx-time">${e.time_valid === false ? "da def." : fmtTime(e.date)}${typeof bellBtn === "function" ? bellBtn(e, true) : ""}</div>
    <div class="fx-mid">
      <div class="fx-t ${pH >= pA ? "fav" : ""}">${teamMark(e.home_logo, e.home_flag, cH)}<span>${esc(e.home)}</span></div>
      <div class="fx-t ${pA > pH ? "fav" : ""}">${teamMark(e.away_logo, e.away_flag, cA)}<span>${esc(e.away)}</span></div>
      ${sub.length ? `<div class="fx-sub">${sub.map(x => `<span>${x}</span>`).join("")}</div>` : ""}
    </div>
    <div class="fx-rings">${e.main.map((p, i) => `<span class="fx-ring">${ring(p, p === max)}<small>${labels[i]}</small></span>`).join("")}</div>
  </a>`;
}

/* partita conclusa: risultato al posto dell'orario, e quale percentuale ha preso */
function fixtureDone(e) {
  const f = e.final, three = e.main.length === 3;
  const [cH, cA] = e.sport === "tennis" ? flagColors(e.home_short, e.away_short) : teamColors({ color: e.home_color }, { color: e.away_color });
  const labels = three ? ["1", "X", "2"] : ["1", "2"];
  const oi = outcomeIx(e), max = Math.max(...e.main), top = e.main.indexOf(max);
  const sc = side => f.void ? "" : `<b class="fx-sc">${side === "h" ? f.h : f.a}</b>`;
  const wH = oi === 0, wA = oi === (three ? 2 : 1);
  let verdict = "";
  if (f.void) verdict = `<span class="res void">${esc(f.void)}</span>`;
  else if (oi != null) verdict = oi === top ? `<span class="res ok">✓ Pronostico preso (${pct(max)})</span>` : `<span class="res ko">✗ Uscito ${labels[oi]} al ${pct(e.main[oi])}</span>`;
  if (!f.void && e.sport === "soccer" && e.extra?.["Over 2,5"] != null) {
    const over = f.h + f.a > 2.5, p = e.extra["Over 2,5"];
    verdict += `<span>${over ? "Over" : "Under"} 2,5 <b>${pct(over ? p : 1 - p)}</b></span>`;
  }
  if (!f.void && e.sport === "tennis" && f.sets) verdict += `<span>${f.sets[0].map((g, i) => `${g}-${f.sets[1][i]}`).join(" ")}</span>`;
  return `<a class="fx done tc" style="--ch:${cH};--ca:${cA}" href="#/e/${encodeURIComponent(e.id)}">
    <div class="fx-time">${f.void ? "–" : "Finale"}<small>${fmtTime(e.date, e.time_valid)}</small></div>
    <div class="fx-mid">
      <div class="fx-t ${wH ? "fav" : ""}">${teamMark(e.home_logo, e.home_flag, cH)}<span class="fx-n">${esc(e.home)}</span>${sc("h")}</div>
      <div class="fx-t ${wA ? "fav" : ""}">${teamMark(e.away_logo, e.away_flag, cA)}<span class="fx-n">${esc(e.away)}</span>${sc("a")}</div>
      <div class="fx-sub">${verdict}</div>
    </div>
    <div class="fx-rings">${e.main.map((p, i) => `<span class="fx-ring ${i === oi ? "hit" : "dim"}">${ring(p, i === oi)}<small>${labels[i]}</small></span>`).join("")}</div>
  </a>`;
}

/* ------------------------------------------------------------------ mattoncini delle schede */

/* ogni riquadro si chiude toccando il titolo; quelli chiusi sono ricordati su questo telefono (per sport e titolo) */
function shutList() { try { return JSON.parse(localStorage.getItem("p_shut") || "[]"); } catch { return []; } }
function secKey(title, key) { return `${CUR?.sport || "gen"}|${key || String(title).replace(/<[^>]*>/g, "")}`; }
function sec(title, inner, right = "", key = "") {
  const k = secKey(title, key), shut = shutList().includes(k);
  return `<section class="sec ${shut ? "shut" : ""}" data-sec="${esc(k)}"><h2 role="button" tabindex="0" aria-expanded="${!shut}"><span class="sec-t">${title}<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></span>${right ? `<small>${right}</small>` : ""}</h2>${inner}</section>`;
}

function picks(items, book, { fav = true } = {}) {
  const max = Math.max(...items.map(x => x[1] ?? 0));
  return `<div class="rgrid" style="--n:${items.length}">${items.map(([lab, p, favLab], i) => `
    <div class="rcell ${p === max && items.length > 1 ? "lead" : ""}">${fav ? star(favKey(favLab || lab, p, book ? book[i] : null)) : ""}${ring(p, p === max)}<span class="lab">${esc(lab)}</span>
    <span class="q">quota equa ${odd(p)}${book && book[i] != null ? `<br>quote ${pct(book[i])}` : ""}</span></div>`).join("")}</div>`;
}

function rows(obj, { label = k => k, book = null } = {}) {
  return `<div class="bars">${Object.entries(obj).filter(([, v]) => v != null).map(([k, v]) =>
    `<div class="bar ${v >= 0.6 ? "hi" : ""}"><i style="width:${Math.round(v * 100)}%"></i>
      <span>${esc(label(k))}<small>${odd(v)}${book && book[k] != null ? ` · quote ${pct(book[k])}` : ""}</small></span><b>${pct(v)}</b>${star(favKey(label(k), v, book ? book[k] : null))}</div>`).join("")}</div>`;
}

const formSeq = seq => `<span class="form">${(seq || []).map(r => `<span class="f ${r}" title="${{ V: "vittoria", N: "pareggio", P: "sconfitta" }[r]}">${r}</span>`).join("")}</span>`;

const tpill = (name, c) => `<span class="tpill" style="background:${c};color:${onColor(c)}">${esc(name)}</span>`;
/* ultimi risultati: una riga per squadra, così non si confondono */
function formStrip(hName, aName, cH, cA, hSeq, aSeq) {
  const row = (n, c, s) => `<div class="fs-row">${tpill(n, c)}<span class="fs-seq ${(s || []).length > 5 ? "many" : ""}">${formSeq(s)}</span></div>`;
  return `<div class="fstrip">${row(hName, cH, hSeq)}${row(aName, cA, aSeq)}<div class="fs-note">ultime partite, la più recente a sinistra</div></div>`;
}
function vsTable(hName, aName, cH, cA, lines) {
  return `<table class="vs-table"><tr><th></th><th>${tpill(hName, cH)}</th><th>${tpill(aName, cA)}</th></tr>
    ${lines.map(([lab, h, a, better = "none", f = x => x ?? "–"]) => {
      const hb = better !== "none" && h != null && a != null && (better === "hi" ? h > a : h < a);
      const ab = better !== "none" && h != null && a != null && (better === "hi" ? a > h : a < h);
      return `<tr><td>${lab}</td><td class="${hb ? "best" : ""}">${f(h)}</td><td class="${ab ? "best" : ""}">${f(a)}</td></tr>`;
    }).join("")}</table>`;
}

function seg(name, opts, cur) {
  return `<span class="seg" role="group" data-seg="${name}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join("")}</span>`;
}

/* stessa regola dell'elenco: se il modello e le quote sono lontani almeno 7 punti su un esito, lo dico */
function bookGap(probs, book, labels) {
  if (!book) return "";
  let gi = -1, gap = 0;
  probs.forEach((p, i) => { if (book[i] != null && Math.abs(p - book[i]) > gap) { gap = Math.abs(p - book[i]); gi = i; } });
  if (gap < 0.07) return "";
  const more = probs[gi] > book[gi];
  return `<div class="board-gap"><b>${Math.round(gap * 100)} punti dalle quote</b> su «${esc(labels[gi])}»: il modello dice ${pct(probs[gi])}, i bookmaker ${pct(book[gi])}. Il modello è ${more ? "più" : "meno"} ottimista: possono pesare cose che non vede, come infortuni o formazioni.</div>`;
}

function board(d, { subH = "", subA = "", probs, labels, favLabels = labels, book = null, foot = [] }) {
  const max = Math.max(...probs);
  const [cH, cA] = d.sport === "tennis" ? flagColors(d.home.cc, d.away.cc) : teamColors(d.home, d.away);
  const crest = (t, c) => t.logo ? img(t.logo, "") : t.photo ? img(t.photo, "pphoto") + img(t.flag, "tflag") : t.flag ? img(t.flag, "tflag") :
    `<span class="mono" style="background:${c};color:${onColor(c)}">${esc(initials(t.name))}</span>`;
  const team = (t, sub, c) => { const href = t.href || (d.sport !== "tennis" && t.lk && t.id ? teamHref(t.lk, t.id) : "");
    return `<${href ? `a href="${href}"` : "div"} class="board-t ${href ? "linked" : ""}"><span class="crest">${crest(t, c)}</span>
    <div class="board-name">${esc(t.name)}${href ? `<span class="tl-arrow">›</span>` : ""}</div>${sub ? `<div class="board-sub">${sub}</div>` : ""}</${href ? "a" : "div"}>`; };
  const when = `${fmtDay(d.date).label}, ${fmtTime(d.date, d.time_valid)}`;
  // barra delle probabilità con i colori delle squadre (1 / X / 2)
  const segs = probs.map((p, i) => {
    const c = probs.length === 3 ? [cH, "var(--ink-3)", cA][i] : [cH, cA][i];
    return `<span style="flex:${Math.max(p, 0.04)};background:${c};color:${probs.length === 3 && i === 1 ? "var(--card)" : onColor(c)}">${p >= 0.12 ? `${esc(labels[i])} ${pct(p)}` : ""}</span>`;
  }).join("");
  return `<div class="board tc" style="--ch:${cH};--ca:${cA}">
    <div class="board-meta"><span class="bm-txt"><b>${esc(d.league_name)}</b><span>${esc(when)}</span></span>
      ${typeof bellBtn === "function" && !d.final ? bellBtn({ id: d.id, sport: d.sport, date: d.date, home: d.home.name, away: d.away.name, league_name: d.league_name }) : ""}</div>
    <div class="board-vs">${team(d.home, subH, cH)}<div class="board-mid">vs</div>${team(d.away, subA, cA)}</div>
    <div class="pbar" aria-hidden="true">${segs}</div>
    <div class="board-rings">${probs.map((p, i) => `<div class="cell">${star(favKey(favLabels[i], p, book ? book[i] : null))}${ring(p, p === max)}<span class="lab">${esc(labels[i])}</span>
      <span class="bk">${book && book[i] != null ? `quote ${pct(book[i])}` : `quota equa ${odd(p)}`}</span></div>`).join("")}</div>
    ${bookGap(probs, book, favLabels)}
    ${foot.filter(Boolean).length ? `<div class="board-foot">${foot.filter(Boolean).map(x => `<span>${x}</span>`).join("")}</div>` : ""}
  </div>`;
}

function tabsView(id, tabs) {
  const cur = state.tab[id] && tabs.some(t => t[0] === state.tab[id]) ? state.tab[id] : tabs[0][0];
  return `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === cur}">${l}</button>`).join("")}</div>
    ${tabs.map(([k, , body]) => `<div role="tabpanel" data-pane="${k}" ${k !== cur ? "hidden" : ""}>${body}</div>`).join("")}`;
}

function wire(id) {
  $app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
    state.tab[id] = b.dataset.tab;
    $app.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x === b));
    $app.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
    const brd = $app.querySelector(".board"), head = document.querySelector(".top").offsetHeight;
    const y = brd ? brd.getBoundingClientRect().bottom + window.scrollY - head : 0;
    if (window.scrollY > y) window.scrollTo(0, y);
  });
  $app.querySelectorAll("[data-seg]").forEach(g => g.querySelectorAll("button").forEach(b => b.onclick = () => {
    const name = g.dataset.seg;
    g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    $app.querySelectorAll(`[data-segpane^="${name}:"]`).forEach(p => p.hidden = p.dataset.segpane !== `${name}:${b.dataset.v}`);
  }));
}

function reliabilityBlock(g) {
  if (!g) return `<p class="note">Non ancora calcolata.</p>`;
  return `<p style="margin:0"><span class="grade g${g.level}">${esc(g.label)}</span>${esc(g.text)}</p>
    <p class="note">La verifica rifà le previsioni sulle partite già giocate. <a href="#/info/affidabilita" style="color:var(--rosa);font-weight:600">Vedi i dettagli</a></p>`;
}

async function showEvent(id) {
  const back = `<button class="back" onclick="history.length > 1 ? history.back() : location.hash='#/'">‹ Partite</button>`;
  $app.innerHTML = back + `<p class="muted">Caricamento…</p>`;
  let d;
  try { d = await getJSON(`data/events/${encodeURIComponent(id)}.json`); }
  catch {
    const tg = typeof espnTarget === "function" ? espnTarget(id) : null;
    if (!tg) { $app.innerHTML = back + `<div class="empty"><b>Partita non più disponibile</b>Torna all'elenco per vedere quelle in programma.</div>`; return; }
    // la scheda con le percentuali non c'è più (partita iniziata da tempo o finita): mostro solo la diretta
    const m = id.match(/^(calcio|basket|tennis)-(.+)-\d+$/);
    d = { id, sport: tg.sport, league: m ? m[2] : "", date: new Date(Date.now() - 3600e3).toISOString(), home: { name: "" }, away: { name: "" } };
    CUR = null;
    $app.innerHTML = back + `<p class="note" style="margin:0 2px 10px">Le percentuali di questa partita non sono più in elenco: qui c'è il risultato in diretta.</p>`;
    attachLive(d);
    return;
  }
  CUR = { event: d.id, match: `${d.home.name} – ${d.away.name}`, date: d.date, time_valid: d.time_valid, league_name: d.league_name, sport: d.sport };
  const body = d.sport === "soccer" ? soccerView(d) : d.sport === "nba" ? nbaView(d) : tennisView(d);
  const extra = sec("Segui in diretta", followLinks(d)) + sec("Dove vederla", whereToWatch(d.league));
  $app.innerHTML = back + body + extra + `<p class="note">Dati aggiornati ${esc(ago(d.updated))}. Le percentuali sono stime statistiche, non certezze.</p>`;
  // in alto la partita (squadre e campanella), poi diretta e "com'è andata"
  const rv = reviewBox(d), brd = $app.querySelector(".board");
  if (rv) brd ? brd.insertAdjacentHTML("afterend", rv) : $app.querySelector(".back")?.insertAdjacentHTML("afterend", rv);
  if (typeof eventActions === "function") { brd?.insertAdjacentHTML("afterend", eventActions(d)); wireEventActions(d); }
  // classifica con le due squadre, sotto i pulsanti (arriva un attimo dopo: il file del campionato si carica a parte)
  if (typeof matchTable === "function") matchTable(d).then(h => {
    if (!h || !$app.contains(brd)) return;
    const after = $app.querySelector(".ev-acts") || brd;
    after.insertAdjacentHTML("afterend", h);
  }).catch(() => null);
  wire(d.sport);
  attachLive(d);
  attachLineups(d);
}

/* ------------------------------------------------------------------ com'è andata: pronostico, quote ed esito */
const stIt = s => ({ FT: "finita", Final: "finita", "Final/OT": "finita ai supplementari", AET: "dopo i supplementari", "FT-Pens": "ai rigori", "Final/2OT": "finita dopo 2 supplementari" }[s] || (/pen/i.test(s || "") ? "ai rigori" : /ret/i.test(s || "") ? "ritiro" : "finita"));
const rvHead = (h, score, a) => `<span>${esc(h)}</span><b>${esc(score)}</b><span>${esc(a)}</span>`;
function reviewBox(d) {
  const f = d.final;
  if (!f) return "";
  if (f.void) return sec("Com'è andata", `<p class="note" style="margin:0">Partita ${esc(f.void.toLowerCase())}: nessun esito da confrontare.</p>`, "", "review");
  const m = d.markets, b = d.book || {}, H = d.home.short || d.home.name, A = d.away.short || d.away.name;
  const rows = [];   // [giocata, modello, quote, è successo]
  const add = (lab, p, bk, yes) => p != null && rows.push([lab, p, bk, yes]);
  let head = "", foot = "";
  if (d.sport === "soccer") {
    const r = f.h > f.a ? 0 : f.h === f.a ? 1 : 2, tot = f.h + f.a;
    head = rvHead(d.home.name, `${f.h}-${f.a}`, d.away.name);
    [`1 · ${H}`, "X · pareggio", `2 · ${A}`].forEach((l, i) => add(l, m["1x2"][i], b["1x2"]?.[i], r === i));
    if (m.ou?.["2.5"] != null) { add("Over 2,5", m.ou["2.5"], b.ou25?.[0], tot > 2.5); add("Under 2,5", 1 - m.ou["2.5"], b.ou25?.[1], tot < 2.5); }
    if (m.ou?.["1.5"] != null) add("Over 1,5", m.ou["1.5"], null, tot > 1.5);
    if (m.btts != null) { add("Goal", m.btts, null, f.h > 0 && f.a > 0); add("No Goal", 1 - m.btts, null, !(f.h > 0 && f.a > 0)); }
    if (f.periods?.[0]?.length && m.ht?.["1x2"]) {
      const hh = f.periods[0][0], ha = f.periods[1][0], hr = hh > ha ? 0 : hh === ha ? 1 : 2;
      add(`Primo tempo ${["1", "X", "2"][hr]} (${hh}-${ha})`, m.ht["1x2"][hr], null, true);
    }
    const ex = (m.exact || []).find(x => x.score === `${f.h}-${f.a}`);
    foot = `Gol attesi dal modello <b>${num(m.xg[0], 2)}–${num(m.xg[1], 2)}</b>, finita <b>${f.h}-${f.a}</b>. ` +
      (ex ? `Il ${f.h}-${f.a} era dato al <b>${pct(ex.p)}</b>.` : `Il ${f.h}-${f.a} non era tra i 10 risultati più probabili.`);
  } else if (d.sport === "nba") {
    const r = f.h > f.a ? 0 : 1, tot = f.h + f.a;
    head = rvHead(d.home.name, `${f.h}-${f.a}`, d.away.name);
    add(`Vince ${H}`, m.win[0], b.p_home, r === 0); add(`Vince ${A}`, m.win[1], b.p_away, r === 1);
    const tl = m.total_line, pt = m.totals?.[String(tl)];
    if (tl && pt != null) { add(`Over ${line(tl)} punti`, pt, null, tot > tl); add(`Under ${line(tl)} punti`, 1 - pt, null, tot < tl); }
    foot = `Punteggio atteso <b>${Math.round(m.exp[0])}–${Math.round(m.exp[1])}</b> (totale ${num(m.total, 1)}), finita <b>${f.h}-${f.a}</b> (totale ${tot}).`;
  } else {
    const w = f.w ?? (f.h > f.a ? 0 : 1);
    head = rvHead(d.home.name, f.sets ? f.sets[0].map((g, i) => `${g}-${f.sets[1][i]}`).join(" ") : `${f.h}-${f.a}`, d.away.name);
    add(`Vince ${lastName(d.home.name)}`, m.win[0], null, w === 0); add(`Vince ${lastName(d.away.name)}`, m.win[1], null, w === 1);
    const sk = `${f.h}-${f.a}`;
    if (m.sets?.[sk] != null) add(`Set ${sk}`, m.sets[sk], null, true);
    if (f.games != null && m.totals) {
      const ln = Object.keys(m.totals).map(Number).sort((a, c) => Math.abs(a - m.exp_games) - Math.abs(c - m.exp_games))[0];
      add(`Over ${line(ln)} game`, m.totals[String(ln)], null, f.games > ln); add(`Under ${line(ln)} game`, 1 - m.totals[String(ln)], null, f.games < ln);
    }
    if (f.sets && m.tiebreak != null) add("Almeno un tie-break", m.tiebreak, null, f.sets[0].some((g, i) => Math.max(g, f.sets[1][i]) === 7 && Math.min(g, f.sets[1][i]) === 6));
    foot = `Game attesi <b>${num(m.exp_games, 1)}</b>, giocati <b>${f.games ?? "–"}</b>${f.ret ? " (partita interrotta per ritiro)" : ""}.`;
  }
  const hasBook = rows.some(x => x[2] != null);
  const mine = favs().filter(x => x.event === d.id);
  const table = `<div class="rv">${rows.map(([lab, p, bk, yes]) => `<div class="rv-row ${yes ? "yes" : "no"}"><span class="rv-l">${yes ? "✓" : "✗"} ${esc(lab)}</span>
    <span class="rv-p"><b>${pct(p)}</b>${hasBook ? `<small>${bk != null ? `quote ${pct(bk)}` : ""}</small>` : ""}</span></div>`).join("")}</div>`;
  return sec("Com'è andata", `<div class="rv-head">${head}</div>${table}
    <p class="note">${foot} ✓ = è successo. Un 60% che non esce non è per forza un errore: succede circa 4 volte su 10.</p>
    ${mine.length ? `<p class="note">Avevi in schedina: ${mine.map(x => esc(x.label)).join(", ")}.</p>` : ""}`, esc(stIt(f.st)), "review");
}

/* ------------------------------------------------------------------ calcio */

function soccerView(d) {
  const m = d.markets, b = d.book || {}, H = d.home, A = d.away;
  const [cH, cA] = teamColors(H, A);
  const pos = t => t.pos ? `${t.pos}ª in classifica, ${t.pts} punti` : "";
  const bookTxt = b["1x2"] ? `${b.provider === "media bookmaker" || !b.provider ? "Quote" : esc(b.provider)}: ${b["1x2"].map(pct).join(" / ")}` : "";
  let s = board(d, { subH: pos(H), subA: pos(A), probs: m["1x2"], labels: ["1", "X", "2"], favLabels: [`${H.short} vince`, "Pareggio", `${A.short} vince`], book: b["1x2"],
    foot: [`Gol attesi <b class="num">${num(m.xg[0], 2)}–${num(m.xg[1], 2)}</b>`, b["1x2"] ? `Quote: ${esc(b.provider && b.provider !== "media bookmaker" ? b.provider : "media bookmaker")}` : ""] });
  if (d.cup === "women") s += `<div class="warn">Per la Champions femminile ci sono solo i risultati della competizione stessa: le percentuali sono indicative.</div>`;
  else if (d.cup === "national") {
    if (d.friendly) s += `<div class="warn">Amichevole: i CT cambiano spesso molti giocatori e le squadre non giocano per il risultato, quindi le percentuali sono più incerte.</div>`;
    if (d.low_data) s += `<div class="warn">Una delle due nazionali ha giocato poche partite negli ultimi anni: la sua forza è stimata con meno dati.</div>`;
    if (d.neutral) s += `<p class="note">Si gioca in campo neutro: nessun vantaggio per la squadra di casa.</p>`;
  }
  else if (d.low_data) s += `<div class="warn">Una delle due squadre gioca in un campionato che il modello non segue: la sua forza è stimata solo dalle partite di coppa.</div>`;

  const esito = sec("Esito finale", picks([["1 " + H.short, m["1x2"][0], `${H.short} vince`], ["X", m["1x2"][1], "Pareggio"], ["2 " + A.short, m["1x2"][2], `${A.short} vince`]], b["1x2"]), `gol attesi ${num(m.xg[0], 2)}–${num(m.xg[1], 2)}`)
    + sec("Doppia chance", rows(m.dc, { label: k => ({ "1X": `${H.short} o pareggio`, "X2": `${A.short} o pareggio`, "12": "Una delle due vince" }[k] || k) }))
    + sec("Combo", rows(m.combo))
    + sec("Risultato esatto", rows(Object.fromEntries(m.exact.map(x => [x.score, x.p]))), "i 10 più probabili")
    + sec("Primo tempo", picks([["1", m.ht["1x2"][0], `${H.short} vince il primo tempo`], ["X", m.ht["1x2"][1], "Pareggio nel primo tempo"], ["2", m.ht["1x2"][2], `${A.short} vince il primo tempo`]]) + rows(m.ht.ou, { label: k => `Over ${line(k)} nel primo tempo` }));

  const ouBook = b.ou25 ? { "2.5": b.ou25[0] } : null;
  const gol = sec("Gol in sintesi", picks([["Over 1,5", m.ou["1.5"]], ["Over 2,5", m.ou["2.5"]], ["Over 3,5", m.ou["3.5"]], ["Goal", m.btts, "Goal, segnano entrambe"]]))
    + sec("Under / Over", rows(m.ou, { label: k => `Over ${line(k)}`, book: ouBook }))
    + sec("Goal / No Goal", rows({ "Goal, segnano entrambe": m.btts, "No Goal": 1 - m.btts }))
    + sec("Multigol", rows(m.multigol, { label: k => `Multigol ${k}` }))
    + sec(`Gol di ${esc(H.short)}`, rows({ ...Object.fromEntries(Object.entries(m.team_ou.home).map(([k, v]) => [`${H.short} over ${line(k)}`, v])), [`${H.short} porta inviolata`]: m.clean_sheet[0] }), "", "Gol squadra di casa")
    + sec(`Gol di ${esc(A.short)}`, rows({ ...Object.fromEntries(Object.entries(m.team_ou.away).map(([k, v]) => [`${A.short} over ${line(k)}`, v])), [`${A.short} porta inviolata`]: m.clean_sheet[1] }), "", "Gol squadra ospite")
    + (d.corners ? sec("Calci d'angolo", rows(d.corners.ou, { label: k => `Over ${line(k)} angoli` }), `attesi ${num(d.corners.exp[2])}`) : "")
    + (d.cards ? sec("Cartellini gialli", rows(d.cards.ou, { label: k => `Over ${line(k)} gialli` }), `attesi ${num(d.cards.exp[2])}`) : "");

  const forma = trendsSection(d, cH, cA) + sec("Forma recente", soccerForm(d, cH, cA), seg("form", [[5, "5"], [10, "10"], [15, "15"]], 5))
    + sec("In stagione", soccerSplit(d, cH, cA))
    + sec("Ultime partite", lastSoccer(d));

  const gioc = sec("Giocatori", soccerPlayers(d, cH, cA), seg("pl", [["home", H.short], ["away", A.short]], "home"));

  s += tabsView("soccer", [["esito", "Esito", esito], ["gol", "Gol e angoli", gol], ["forma", "Forma", forma], ["h2h", "Testa a testa", h2hView(d, cH, cA)], ["gioc", "Giocatori", gioc],
    ["mod", "Affidabilità", sec("Quanto fidarsi", reliabilityBlock(d.reliability))]]);
  return s;
}

function soccerForm(d, cH, cA) {
  const H = d.form.home, A = d.form.away;
  const pair = (h, a) => h != null ? `${num(h)} / ${num(a)}` : null;
  return [5, 10, 15].map(n => {
    const h = H["form" + n], a = A["form" + n];
    return `<div data-segpane="form:${n}" ${n !== 5 ? "hidden" : ""}>${formStrip(d.home.short, d.away.short, cH, cA, h.seq?.slice(0, n), a.seq?.slice(0, n))}${vsTable(d.home.short, d.away.short, cH, cA, [
      ["Vinte, pari, perse", `${h.w}-${h.d}-${h.l}`, `${a.w}-${a.d}-${a.l}`],
      ["Punti", h.pts, a.pts, "hi"],
      ["Gol fatti a partita", h.gf, a.gf, "hi", x => num(x)],
      ["Gol subiti a partita", h.ga, a.ga, "lo", x => num(x)],
      ["Over 2,5", h.over25, a.over25, "none", pct],
      ["Goal", h.btts, a.btts, "none", pct],
      ["Porta inviolata", h.clean, a.clean, "hi", pct],
      ["Senza segnare", h.fail, a.fail, "lo", pct],
      ["Tiri / in porta", pair(h.shots_f, h.sot_f), pair(a.shots_f, a.sot_f)],
      ["Angoli fatti / subiti", pair(h.corners_f, h.corners_a), pair(a.corners_f, a.corners_a)],
      ["Gialli a partita", h.yellow_f, a.yellow_f, "none", x => num(x)],
      ...(h.xg_f != null ? [["Gol attesi fatti / subiti", pair(h.xg_f, h.xg_a), pair(a.xg_f, a.xg_a)]] : []),
    ])}</div>`;
  }).join("");
}

function soccerSplit(d, cH, cA) {
  const h = d.form.home.home_season, a = d.form.away.away_season;
  const r = d.home.rating, ra = d.away.rating;
  return vsTable(`${d.home.short} in casa`, `${d.away.short} fuori`, cH, cA, [
    ["Vinte, pari, perse", h.n ? `${h.w}-${h.d}-${h.l}` : null, a.n ? `${a.w}-${a.d}-${a.l}` : null],
    ["Gol fatti a partita", h.gf, a.gf, "hi", x => num(x)],
    ["Gol subiti a partita", h.ga, a.ga, "lo", x => num(x)],
    ["Over 2,5", h.n ? h.over25 : null, a.n ? a.over25 : null, "none", pct],
    ["Goal", h.n ? h.btts : null, a.n ? a.btts : null, "none", pct],
  ]) + (r ? `<p class="note">Forza stimata dal modello (100 è la media del campionato): attacco ${Math.round(r.att * 100)} contro ${ra ? Math.round(ra.att * 100) : "–"}, difesa ${Math.round(r.def * 100)} contro ${ra ? Math.round(ra.def * 100) : "–"}. In difesa, meno è meglio.</p>` : "");
}

/* testa a testa: solo gli scontri diretti tra le due squadre */
function h2hView(d, cH, cA) {
  const h = d.h2h, soccer = d.sport === "soccer";
  if (!h || !h.n) return sec("Testa a testa", `<p class="note">Nessuno scontro diretto ${soccer ? "nelle ultime tre stagioni" : "nelle ultime due stagioni"} tra queste due squadre.</p>`);
  const H = d.home, A = d.away;
  const isH = g => soccer ? g.home === H.fd : String(g.home) === String(H.id);
  // punti di vista della squadra di casa di oggi
  const rows = h.games.map(g => {
    const hs = soccer ? g.hg : g.hs, as = soccer ? g.ag : g.as;
    const mine = isH(g) ? hs : as, theirs = isH(g) ? as : hs;
    return { g, home: isH(g), mine, theirs, res: mine > theirs ? "V" : mine < theirs ? "P" : "N", hs, as };
  });
  const n = rows.length, wH = h.a, wA = h.b, dr = soccer ? h.d : 0;
  const avg = f => rows.reduce((s, r) => s + f(r), 0) / n;
  const bar = `<div class="h2h-bar">${wH ? `<span style="flex:${wH};background:${cH}"></span>` : ""}${dr ? `<span class="dr" style="flex:${dr}"></span>` : ""}${wA ? `<span style="flex:${wA};background:${cA}"></span>` : ""}</div>`;
  const head = `<div class="h2h-head">
      <div>${tpill(H.short || H.name, cH)}<b>${wH}</b><small>${wH === 1 ? "vittoria" : "vittorie"}</small></div>
      ${soccer ? `<div><span class="tpill neutral">Pari</span><b>${dr}</b><small>${dr === 1 ? "pareggio" : "pareggi"}</small></div>` : ""}
      <div>${tpill(A.short || A.name, cA)}<b>${wA}</b><small>${wA === 1 ? "vittoria" : "vittorie"}</small></div>
    </div>${bar}`;
  const unit = soccer ? "Gol" : "Punti";
  const stats = vsTable(H.short || H.name, A.short || A.name, cH, cA, [
    [`${unit} fatti a partita`, avg(r => r.mine), avg(r => r.theirs), "hi", x => num(x)],
    [`Vittorie in casa propria`, `${rows.filter(r => r.home && r.res === "V").length} su ${rows.filter(r => r.home).length}`, `${rows.filter(r => !r.home && r.res === "P").length} su ${rows.filter(r => !r.home).length}`],
    ...(soccer ? [["Partite senza subire gol", rows.filter(r => r.theirs === 0).length, rows.filter(r => r.mine === 0).length, "hi"]] : []),
  ]);
  const both = soccer
    ? `<div class="rows"><div class="r"><span class="l">Gol a partita, in totale</span><span class="v num">${num(avg(r => r.hs + r.as))}</span></div>
       <div class="r"><span class="l">Over 2,5</span><span class="v num">${pct(h.over25)}</span></div>
       <div class="r"><span class="l">Goal, segnano entrambe</span><span class="v num">${pct(h.btts)}</span></div></div>`
    : `<div class="rows"><div class="r"><span class="l">Punti totali a partita</span><span class="v num">${num(h.avg_total ?? avg(r => r.hs + r.as))}</span></div>
       <div class="r"><span class="l">Scarto medio</span><span class="v num">${num(avg(r => Math.abs(r.mine - r.theirs)))}</span></div></div>`;
  const nm = id => soccer ? id : ((d.names || {})[id] || id);
  const list = `<div class="rows games h2h-games">${rows.map(r => `<div class="r"><span class="l">${fmtShort(r.g.date)}<br><span class="faint">${esc(nm(r.g.home))} – ${esc(nm(r.g.away))}</span></span>
      <span class="v num"><span class="f ${r.res}">${r.res}</span> ${r.hs}-${r.as}</span></div>`).join("")}</div>
    <p class="note">V, N e P sono dal punto di vista di ${esc(H.short || H.name)}. Il punteggio è scritto come casa – ospite di quella partita.</p>`;
  return sec("Chi ha vinto", head, `${n} ${n === 1 ? "scontro diretto" : "scontri diretti"}`)
    + sec("Numeri degli scontri diretti", stats + `<h3>Nelle partite tra loro</h3>` + both)
    + sec("Tutti gli scontri diretti", list, soccer ? "ultime tre stagioni" : "ultime due stagioni");
}

function lastSoccer(d) {
  const list = (t, name) => `<h3>${esc(name)}</h3><div class="rows games">${t.last.slice(0, 6).map(g =>
    `<div class="r"><span class="l">${fmtShort(g.date)}, ${g.home ? "in casa con" : "fuori con"} ${esc(g.opp)}</span><span class="v num"><span class="f ${g.res}">${g.res}</span> ${g.gf}-${g.ga}</span></div>`).join("")}</div>`;
  return list(d.form.home, d.home.name) + list(d.form.away, d.away.name);
}

/* con le formazioni ufficiali: un titolare gioca la partita intera, chi parte dalla panchina
   entra circa una volta su due per uno spezzone, chi non è convocato non gioca */
const LU_LABEL = { start: "Titolare", bench: "In panchina", out: "Non convocato" };
function withLineup(p, st) {
  if (!st) return p;
  const inv = Math.max(p.involvement || 1, .2);
  const e = Math.min(st === "start" ? 1 / inv : st === "bench" ? .2 / inv : 0, 3);
  const f = q => q == null ? q : 1 - (1 - q) ** e;
  return { ...p, lu: st, p_goal: f(p.p_goal), p_assist: f(p.p_assist), p_sot: f(p.p_sot), p_card: f(p.p_card) };
}

function soccerPlayers(d, cH, cA, lu = null, side = "home") {
  const status = (side, p) => {
    if (!lu) return null;
    const t = lu[side], pid = String(p.pid), n = p.name;
    const has = list => list.some(x => (x.pid && x.pid === pid) || x.name === n);
    return has(t.starters) ? "start" : has(t.bench) ? "bench" : "out";
  };
  const order = { start: 0, bench: 1, out: 2 };
  const tbl = (side, c) => {
    let list = d.players[side];
    if (!list.length) return `<p class="note">${d.cup === "women" ? "Per la Champions femminile non ci sono dati sui singoli giocatori." : d.cup === "national" ? "Per le nazionali non ci sono ancora dati sui singoli giocatori: le convocazioni cambiano a ogni finestra." : d.cup ? `Per ${esc(d[side].short || d[side].name)} non ci sono dati sui giocatori: gioca in un campionato che l'app non segue.` : "I dati sui giocatori arrivano con i tabellini delle prime partite."}</p>`;
    if (lu) list = list.map(p => withLineup(p, status(side, p))).sort((a, b) => order[a.lu] - order[b.lu] || b.p_goal - a.p_goal);
    return `<div class="sp-row head"><span></span><span>Giocatore</span><span>Segna</span><span>Assist</span><span>Tiro in porta</span><span>Giallo</span></div>
    ${list.map(p => `<div class="sp-row ${p.lu === "out" ? "sp-out" : ""}">${avatar(p.name, c, null, p.photo ?? headshot("soccer", p.pid))}<span class="sp-name"><b>${esc(p.name)}</b><span>${p.lu ? `<i class="lu lu-${p.lu}">${LU_LABEL[p.lu]}</i> ` : ""}${esc(p.pos || "")} · ${p.tot.g} gol, ${p.tot.a} assist</span></span>
      <span class="v ${p.p_goal >= .4 ? "hot" : ""}">${pct(p.p_goal)}</span><span class="v">${pct(p.p_assist)}</span><span class="v">${pct(p.p_sot)}</span><span class="v">${pct(p.p_card)}</span></div>`).join("")}`;
  };
  return `<div id="sp-wrap"><div data-segpane="pl:home" ${side !== "home" ? "hidden" : ""}>${tbl("home", cH)}</div><div data-segpane="pl:away" ${side !== "away" ? "hidden" : ""}>${tbl("away", cA)}</div>
    <p class="note">${lu ? "Percentuali ricalcolate con le formazioni ufficiali: un titolare gioca tutta la partita, chi è in panchina entra circa una volta su due per uno spezzone." : `${d.cup ? "Nelle coppe i numeri dei giocatori vengono dal loro campionato. " : ""}Stime da presenze, titolarità e gol attesi della squadra in questa partita. Quando escono le formazioni ufficiali (circa un'ora prima) vengono ricalcolate qui.`}</p></div>`;
}

/* formazioni ufficiali arrivate (da live.js): riquadro con titolari e panchina, e tabella giocatori ricalcolata */
function showLineups(d, lu) {
  const wrap = document.getElementById("sp-wrap");
  if (!wrap) return;
  const [cH, cA] = teamColors(d.home, d.away);
  const side = $app.querySelector('[data-seg="pl"] [aria-pressed="true"]')?.dataset.v || "home";
  wrap.outerHTML = soccerPlayers(d, cH, cA, lu, side);
  let box = document.getElementById("lu-box");
  if (!box) {
    box = document.createElement("section"); box.id = "lu-box"; box.className = "sec";
    document.getElementById("sp-wrap")?.closest(".sec")?.before(box);
  }
  const team = (t, name, c) => `<div class="lu-team"><h3><span class="tdot" style="background:${c}"></span>${esc(name)}${t.formation ? `<small>${esc(t.formation)}</small>` : ""}</h3>
    <ol>${t.starters.map(p => `<li><b>${esc(p.jersey)}</b>${esc(p.name)}<small>${esc(p.pos)}</small></li>`).join("")}</ol>
    ${t.bench.length ? `<details><summary>Panchina (${t.bench.length})</summary><p>${t.bench.map(p => esc(p.name)).join(", ")}</p></details>` : ""}</div>`;
  box.innerHTML = `<h2>Formazioni ufficiali<small>da ESPN</small></h2><div class="lu-grid">${team(lu.home, d.home.short, cH)}${team(lu.away, d.away.short, cA)}</div>`;
  const tab = document.querySelector('[data-tab="gioc"]');
  if (tab && !tab.querySelector(".lu-dot")) tab.insertAdjacentHTML("beforeend", `<span class="lu-dot" title="Formazioni ufficiali"></span>`);
}

/* ------------------------------------------------------------------ NBA */

const PROP_UNIT = { pts: "punti", reb: "rimbalzi", ast: "assist", tpm: "triple", pra: "P+R+A" };
const PROP_NAME = { pts: "Punti", reb: "Rimbalzi", ast: "Assist", tpm: "Triple", pra: "P+R+A" };

function nbaView(d) {
  const m = d.markets, H = d.home, A = d.away, b = d.book || {};
  const [cH, cA] = teamColors(H, A);
  const sub = t => `${t.record.w} vinte, ${t.record.l} perse${t.b2b ? ", seconda sera di fila" : ""}`;
  const bookTxt = b.p_home ? `${esc(b.provider || "Quote")}: ${pct(b.p_home)} / ${pct(b.p_away)}` : "";
  let s = board(d, { subH: sub(H), subA: sub(A), probs: m.win, labels: [H.short || "Casa", A.short || "Ospite"], favLabels: [`${H.short || H.name} vince`, `${A.short || A.name} vince`], book: b.p_home ? [b.p_home, b.p_away] : null,
    foot: [`Punteggio atteso <b class="num">${Math.round(m.exp[0])}–${Math.round(m.exp[1])}</b>`, b.p_home ? `Quote: ${esc(b.provider || "")}` : ""] });

  const bpi = m.espn_bpi != null ? `<p class="note">Il modello di previsione di ESPN (BPI) dà ${esc(H.short)} al ${pct(m.espn_bpi)}. ${m.espn_weight ? `Pesa per il ${Math.round(m.espn_weight * 100)}% nella percentuale qui sopra: è il peso che ha sbagliato meno sulle partite già giocate.` : "Non è incluso nel calcolo."}</p>` : "";
  const esito = sec("Vincente", picks([[H.short || H.name, m.win[0], `${H.short || H.name} vince`], [A.short || A.name, m.win[1], `${A.short || A.name} vince`]], b.p_home ? [b.p_home, b.p_away] : null) + bpi)
    + sec("Handicap", rows(m.spreads, { label: k => `${H.short || "Casa"} ${line(k)}` }), `margine atteso ${m.margin > 0 ? "+" : ""}${num(m.margin)}`)
    + sec("Margine di vittoria", rows(Object.fromEntries(Object.entries(m.bands).map(([k, v]) =>
      [k.replace("casa", `${H.short || "Casa"} vince di`).replace("ospite", `${A.short || "Ospite"} vince di`), v]))));
  const tl = `${m.total_line}`, pOver = m.totals[`${Number(m.total_line)}`] ?? m.totals[tl];
  const punti = (pOver != null ? sec("Linea principale", picks([[`Over ${line(m.total_line)}`, pOver, `Over ${line(m.total_line)} punti`], [`Under ${line(m.total_line)}`, 1 - pOver, `Under ${line(m.total_line)} punti`]]), `attesi ${num(m.total)}`) : "")
    + sec("Punti totali", rows(m.totals, { label: k => `Over ${line(k)} punti` }), `attesi ${num(m.total)}, linea ${line(m.total_line)}`)
    + sec(`Punti di ${esc(H.name)}`, rows(m.team_totals.home, { label: k => `${H.short} over ${line(k)}` }), "", "Punti squadra di casa")
    + sec(`Punti di ${esc(A.name)}`, rows(m.team_totals.away, { label: k => `${A.short} over ${line(k)}` }), "", "Punti squadra ospite");
  const forma = trendsSection(d, cH, cA) + sec("Forma recente", nbaForm(d, cH, cA), seg("form", [[5, "5"], [10, "10"], [15, "15"]], 5))
    + sec("Infortuni", injuries(d));
  const gioc = sec("Giocatori", nbaPlayers(d, cH, cA), seg("pl", [["home", H.short || "Casa"], ["away", A.short || "Ospite"]], "home"));
  s += tabsView("nba", [["esito", "Esito", esito], ["punti", "Punti", punti], ["gioc", "Giocatori", gioc], ["forma", "Forma", forma],
    ["h2h", "Testa a testa", h2hView(d, cH, cA)], ["mod", "Affidabilità", sec("Quanto fidarsi", reliabilityBlock(d.reliability))]]);
  return s;
}

function nbaForm(d, cH, cA) {
  const H = d.form.home, A = d.form.away;
  return [5, 10, 15].map(n => {
    const h = H["form" + n], a = A["form" + n];
    return `<div data-segpane="form:${n}" ${n !== 5 ? "hidden" : ""}>${formStrip(d.home.short, d.away.short, cH, cA, h.seq?.slice(0, n), a.seq?.slice(0, n))}${vsTable(d.home.short, d.away.short, cH, cA, [
      ["Vinte, perse", `${h.w ?? 0}-${h.l ?? 0}`, `${a.w ?? 0}-${a.l ?? 0}`],
      ["Punti fatti", h.pf, a.pf, "hi", x => num(x)],
      ["Punti subiti", h.pa, a.pa, "lo", x => num(x)],
      ["Totale medio", h.total, a.total, "none", x => num(x)],
    ])}</div>`;
  }).join("") + `<h3>In stagione</h3>` + vsTable(`${d.home.short} in casa`, `${d.away.short} fuori`, cH, cA, [
    ["Vinte, perse", `${d.form.home.home_season.w ?? 0}-${d.form.home.home_season.l ?? 0}`, `${d.form.away.away_season.w ?? 0}-${d.form.away.away_season.l ?? 0}`],
    ["Punti fatti", d.form.home.home_season.pf, d.form.away.away_season.pf, "hi", x => num(x)],
    ["Punti subiti", d.form.home.home_season.pa, d.form.away.away_season.pa, "lo", x => num(x)],
  ]);
}

function injuries(d) {
  const list = t => t.injuries.length ? `<div class="rows">${t.injuries.map(i =>
    `<div class="r"><span class="l">${esc(i.name)} <span class="faint">${esc(i.detail || "")}</span></span><span class="v" style="font-size:17px">${esc(statusIt(i.status))}</span></div>`).join("")}</div>`
    : `<p class="note">Nessun infortunio segnalato.</p>`;
  return `<h3 style="margin-top:0">${esc(d.home.name)}</h3>${list(d.home)}<h3>${esc(d.away.name)}</h3>${list(d.away)}`;
}

function nbaPlayers(d, cH, cA) {
  const block = (list, c) => list.length ? list.map(p => {
    const a = p.avg5 || {}, a10 = p.avg10 || {}, a15 = p.avg15 || {};
    const props = Object.entries(p.props || {}).map(([k, v]) => {
      const chips = Object.entries(v.p).map(([L, pr]) => {
        const key = favKey(`${p.name} almeno ${L} ${PROP_UNIT[k]}`, pr);
        return `<button type="button" class="chip ${pr >= .6 ? "hot" : ""} ${isFav(key) ? "on" : ""}" data-fav="${esc(key)}" aria-label="${esc(p.name)} almeno ${L} ${PROP_UNIT[k]}, ${pct(pr)}. Tocca per salvarla nella schedina">${L}+<b>${pct(pr)}</b></button>`;
      }).join("");
      return chips ? `<div class="line"><span>${PROP_NAME[k]}<br><b>${num(v.mean)}</b> attesi</span><div class="chips">${chips}</div></div>` : "";
    }).join("");
    const tag = p.out ? `<span class="p-tag out">Fuori</span>` : `<span class="p-tag">${p.status ? esc(statusIt(p.status)) + ", " : ""}${num(p.min_proj, 0)} minuti attesi</span>`;
    return `<div class="player">${avatar(p.name, c, p.pos, headshot("nba", p.pid))}<div>
      <div class="p-head"><span class="p-name">${esc(p.name)}</span>${tag}</div>
      <div class="p-avg" aria-label="Medie nelle ultime 5 partite">
        <div><b>${num(a.pts)}</b><span>punti</span></div><div><b>${num(a.reb)}</b><span>rimbalzi</span></div>
        <div><b>${num(a.ast)}</b><span>assist</span></div><div><b>${num(a.tpm)}</b><span>triple</span></div>
        <div><b>${a.fg_pct != null ? Math.round(a.fg_pct * 100) : "–"}</b><span>% al tiro</span></div></div>
      <div class="p-trend">Medie ultime 5. Ultime 10: ${num(a10.pts)} punti, ${num(a10.reb)} rimbalzi, ${num(a10.ast)} assist. Ultime 15: ${num(a15.pts)}, ${num(a15.reb)}, ${num(a15.ast)}.</div>
      ${p.out ? "" : `<div class="lines">${props}</div>`}</div></div>`;
  }).join("") : `<p class="note">Tabellini non ancora disponibili.</p>`;
  return `<div data-segpane="pl:home">${block(d.players.home, cH)}</div><div data-segpane="pl:away" hidden>${block(d.players.away, cA)}</div>
    <p class="note">Ogni riquadro è la probabilità di arrivare almeno a quella soglia, da minuti attesi, medie recenti e avversario.</p>`;
}

/* ------------------------------------------------------------------ tennis */

function tennisView(d) {
  const m = d.markets, P = d.players;
  const [cH, cA] = flagColors(P.home.cc, P.away.cc);
  const sub = p => [p.country || (p.cc ? p.cc.toUpperCase() : ""), p.rank ? `testa di serie ${p.rank}` : "", p.elo ? `Elo ${p.elo}` : ""].filter(Boolean).join(", ");
  // foto: quella trovata dalla raccolta dati (ESPN o Wikipedia); "" = nessuna foto, resta la bandiera
  const ph = p => p.photo !== undefined ? p.photo : headshot("tennis", p.pid);
  d = { ...d, home: { ...d.home, cc: P.home.cc, flag: P.home.flag, photo: ph(P.home), href: playerHref(d.league, d.home.name) },
    away: { ...d.away, cc: P.away.cc, flag: P.away.flag, photo: ph(P.away), href: playerHref(d.league, d.away.name) } };
  let s = board(d, { subH: sub(P.home), subA: sub(P.away), probs: m.win, labels: [lastName(d.home.name), lastName(d.away.name)], favLabels: [`${d.home.name} vince`, `${d.away.name} vince`],
    foot: [esc(d.round || ""), `${surfaceIt(d.surface)}, al meglio dei ${m.best_of} set`] });
  if (d.low_data) s += `<div class="warn">Uno dei due giocatori ha pochi incontri nello storico: queste percentuali sono meno affidabili.</div>`;
  const ln = n => lastName(n);
  const esito = sec("Vincente", picks([[ln(d.home.name), m.win[0], `${d.home.name} vince`], [ln(d.away.name), m.win[1], `${d.away.name} vince`]]))
    + sec("Risultato in set", rows(Object.fromEntries(Object.entries(m.sets).map(([k, v]) => {
      const [a, b] = k.split("-").map(Number);
      return [`${a > b ? ln(d.home.name) : ln(d.away.name)} ${Math.max(a, b)}-${Math.min(a, b)}`, v];
    }))))
    + sec("Tie-break e set decisivo", rows({ "Almeno un tie-break": m.tiebreak, "Si arriva al set decisivo": m.deciding_set }));
  const tt = Object.entries(m.totals), mid = tt[Math.floor(tt.length / 2)];
  const game = sec("In sintesi", picks([[`Over ${line(mid[0])}`, mid[1], `Over ${line(mid[0])} game`], ["Tie-break", m.tiebreak, "Almeno un tie-break"], ["Set decisivo", m.deciding_set, "Si arriva al set decisivo"]]))
    + sec("Game totali", rows(m.totals, { label: k => `Over ${line(k)} game` }), `attesi ${num(m.exp_games)}`)
    + sec("Handicap game", rows(m.handicap, { label: k => `${ln(d.home.name)} ${line(k)}` }))
    + `<p class="note">Game di servizio tenuti, stima: ${ln(d.home.name)} ${pct(m.hold[0])}, ${ln(d.away.name)} ${pct(m.hold[1])}.</p>`;
  const gioc = sec("Confronto", tennisPlayers(d, cH, cA)) + sec("Testa a testa", tennisH2h(d), d.h2h.n ? `${d.h2h.a}–${d.h2h.b}` : "");
  const forma = sec("Forma recente", tennisForm(d, cH, cA), seg("form", [[5, "5"], [10, "10"], [15, "15"]], 5)) + sec("Ultimi incontri", tennisLast(d));
  s += tabsView("tennis", [["esito", "Esito", esito], ["game", "Game", game], ["forma", "Forma", forma], ["gioc", "Giocatori", gioc],
    ["mod", "Affidabilità", sec("Quanto fidarsi", reliabilityBlock(d.reliability))]]);
  return s;
}

function tennisPlayers(d, cH, cA) {
  const A = d.players.home, B = d.players.away;
  const rec = r => r ? `${r.w}-${r.l}` : "–";
  const surf = surfaceIt(d.surface).toLowerCase();
  return vsTable(lastName(d.home.name), lastName(d.away.name), cH, cA, [
    [`Elo su ${surf}`, A.elo, B.elo, "hi"],
    ["Quest'anno", rec(A.year), rec(B.year)],
    [`Su ${surf}, 12 mesi`, rec(A.surface12m), rec(B.surface12m)],
    ["Set finiti al tie-break", A.tb_rate, B.tb_rate, "none", pct],
    ["Game medi (3 set)", A.avg_games_bo3, B.avg_games_bo3, "none", x => num(x)],
  ]);
}

/* forma dei tennisti sugli ultimi 5, 10 o 15 incontri, come per calcio e basket */
function tennisForm(d, cH, cA) {
  const A = d.players.home, B = d.players.away, hN = lastName(d.home.name), aN = lastName(d.away.name);
  if (!A.form5 && !B.form5) {          // dati della versione precedente: solo gli ultimi 10
    return formStrip(hN, aN, cH, cA, A.form10?.seq, B.form10?.seq);
  }
  const fr = (x, y) => x ? `${x[0]}-${x[1]}` : "–";
  return [5, 10, 15].map(n => {
    const h = A["form" + n] || {}, a = B["form" + n] || {};
    const few = (h.n ?? 0) < n || (a.n ?? 0) < n;
    return `<div data-segpane="form:${n}" ${n !== 5 ? "hidden" : ""}>${formStrip(hN, aN, cH, cA, h.seq, a.seq)}${vsTable(hN, aN, cH, cA, [
      ["Vinte, perse", h.n ? `${h.w}-${h.l}` : null, a.n ? `${a.w}-${a.l}` : null],
      ["Set vinti, persi", fr(h.sets), fr(a.sets)],
      ["Game vinti", h.game_pct, a.game_pct, "hi", pct],
      ["Game fatti / subiti", h.gw != null ? `${num(h.gw)} / ${num(h.gl)}` : null, a.gw != null ? `${num(a.gw)} / ${num(a.gl)}` : null],
      ["Game totali a incontro", h.games, a.games, "none", x => x != null ? num(x) : "–"],
      ["Vittorie senza perdere set", h.straight, a.straight, "hi", x => x != null ? pct(x) : "–"],
      ["Tie-break vinti", h.tb?.[1] ? `${h.tb[0]} su ${h.tb[1]}` : "–", a.tb?.[1] ? `${a.tb[0]} su ${a.tb[1]}` : "–"],
    ])}${few ? `<p class="note">Nello storico ci sono meno di ${n} incontri per almeno uno dei due: i conti usano quelli disponibili.</p>` : ""}</div>`;
  }).join("");
}

function tennisH2h(d) {
  const h = d.h2h;
  if (!h.n) return `<p class="note">Nessun precedente negli ultimi due anni.</p>`;
  return `<div class="rows games">${h.games.map(g => `<div class="r"><span class="l">${fmtShort(g.date)}, ${esc(g.tournament)}, ${esc(surfaceIt(g.surface).toLowerCase())}<br>vince ${esc(g.winner)}</span><span class="v num" style="font-size:16px">${esc(g.score)}</span></div>`).join("")}</div>`;
}

function tennisLast(d) {
  const list = (p, name) => `<h3>${esc(name)}</h3>` + ((p.last || []).length ? `<div class="rows games">${p.last.slice(0, 5).map(g =>
    `<div class="r"><span class="l">${fmtShort(g.date)}, con ${esc(g.opp)} <span class="faint">${esc(surfaceIt(g.surface).toLowerCase())}</span></span><span class="v num" style="font-size:16px"><span class="f ${g.res}">${g.res}</span> ${esc(g.score)}</span></div>`).join("")}</div>`
    : `<p class="note">Nessun incontro nello storico.</p>`);
  return list(d.players.home, d.home.name) + list(d.players.away, d.away.name);
}

/* ------------------------------------------------------------------ migliori giocate */

const SPORT_OF = { soccer: "soccer", nba: "nba", tennis: "tennis" };

function ring(p, lead = false) {
  const v = Math.max(0, Math.min(1, p ?? 0));
  const cls = v >= .7 ? "r-hi" : v >= .5 ? "r-md" : "";
  return `<span class="ring ${cls} ${lead ? "lead" : ""}" aria-hidden="true"><svg viewBox="0 0 36 36"><circle class="rb" cx="18" cy="18" r="15.9155" stroke-width="3.2"/>
    <circle class="rf" cx="18" cy="18" r="15.9155" stroke-width="3.2" stroke-dasharray="${(v * 100).toFixed(1)} 100"/></svg><b>${pct(p)}</b></span>`;
}

function pickMark(it) {
  if (it.player) return avatar(it.player, it.color, it.pos, it.photo ?? headshot(it.sport, it.pid));
  if (it.logo) return `<span class="pk-logo">${img(it.logo, "", "")}</span>`;
  const c = usable(it.color) ? it.color : "#6d5a6b";
  return `<span class="ava" style="background:${c};color:${onColor(c)}" aria-hidden="true">${esc((it.tag || "").slice(0, 3))}</span>`;
}

const SPORT_NAME = { soccer: "Calcio", nba: "NBA", tennis: "Tennis" };

function pickRow(it, big, showCat = false) {
  const key = favKey(it.label, it.p, it.book, { event: it.event, match: it.match, date: it.date, time_valid: it.time_valid, league_name: it.league_name, sport: it.sport });
  const when = `${fmtDay(it.date).rel || fmtShort(it.date)}, ${fmtTime(it.date, it.time_valid)}`;
  const edge = it.edge != null ? `<span class="edge ${it.edge >= .05 ? "pos" : it.edge <= -.05 ? "neg" : ""}">bookmaker ${pct(it.book)}</span>` : "";
  return `<a class="pk ${big ? "big" : ""}" href="#/e/${encodeURIComponent(it.event)}">
    ${ring(it.p, it.p >= .75)}
    ${big ? pickMark(it) : ""}
    ${star(key)}<span class="pk-txt"><b>${esc(it.label)}</b><span>${showCat ? `${esc(SPORT_NAME[it.sport] || "")} · ${esc(it.cat)} · ` : ""}${esc(it.match)}, ${esc(when)}${it.low ? ", pochi dati" : ""}</span>${edge}</span>
  </a>`;
}

const HIGH = 0.70;   // soglia della classifica "in assoluto"
async function showBest() {
  if (!BEST) { try { BEST = await getJSON("data/migliori.json"); } catch { BEST = { categories: [] }; } }
  const now = Date.now();
  const live = it => new Date(it.date).getTime() > now - 3 * 3600e3 && (state.sport === "all" || it.sport === state.sport);
  const ok = it => live(it) && (state.day === "all" || isoDay(it.date) === state.day);
  const allItems = BEST.categories.flatMap(c => c.items.filter(live));
  const seen = new Set(), oneEach = allItems.filter(it => !seen.has(it.event) && seen.add(it.event));
  const cats = BEST.categories.map(c => ({ name: c.name, items: c.items.filter(ok) })).filter(c => c.items.length);
  const count = k => BEST.categories.reduce((n, c) => n + c.items.filter(it => (k === "all" || it.sport === k) && new Date(it.date).getTime() > now - 3 * 3600e3).length, 0);
  let html = `<div class="filters"><div class="sports" role="group" aria-label="Sport">${SPORTS.map(s =>
    `<button data-sport="${s.key}" class="sp-${s.key}" aria-pressed="${state.sport === s.key}"><span class="sp-l">${sportDot(s.key)}${s.label}</span><small>${count(s.key)} giocate</small></button>`).join("")}</div>
    ${dayChips(oneEach, it => it.date, "partite")}</div>`;
  if (!cats.length) html += `<div class="empty"><b>Nessuna giocata per questa scelta</b>Prova un altro giorno o un altro sport.</div>`;
  // classifica unica tra tutti gli sport e le categorie: tutte le giocate con probabilità alta, senza la doppia chance
  if (cats.length) {
    const main = it => it.cat === "Gol" ? /2,5|Goal/.test(it.label) : it.cat === "Angoli" ? /9,5/.test(it.label) : true;
    const sorted = cats.filter(c => c.name !== "Doppia chance").flatMap(c => c.items.map(it => ({ ...it, cat: c.name }))).filter(main)
      .sort((a, b) => b.p - a.p);
    const high = sorted.filter(it => it.p >= HIGH);
    const best = (high.length >= 5 ? high : sorted.slice(0, 5)).slice(0, 60);
    const top = best.slice(0, 10), rest = best.slice(10);
    const who = { all: "di tutti gli sport", soccer: "del calcio", nba: "del basket", tennis: "del tennis" }[state.sport];
    html += `<section class="sec best overall"><h2>Le migliori in assoluto<small>${who}, ${high.length >= 5 ? `dal ${Math.round(HIGH * 100)}% in su` : "le più probabili"}</small></h2>
      ${top.map(it => pickRow(it, true, true)).join("")}
      ${rest.length ? `<details class="more"><summary>Altre ${rest.length} in classifica</summary>${rest.map(it => pickRow(it, false, true)).join("")}</details>` : ""}
    </section>`;
  }
  // tendenze in corso
  const trs = (BEST.trends || []).filter(ok);
  if (trs.length) {
    const tRow = t => `<a class="pk tr-pk" href="#/e/${encodeURIComponent(t.event)}">${t.logo ? `<span class="pk-logo">${img(t.logo, "", "")}</span>` : `<span class="ava" style="background:${usable(t.color) ? t.color : "#6d5a6b"};color:#fff">${esc((t.team || "").slice(0, 3))}</span>`}
      <span class="pk-txt"><b>${esc(t.team)}: ${esc(t.text.charAt(0).toLowerCase() + t.text.slice(1))}</b><span>${esc(SPORT_NAME[t.sport] || "")} · ${esc(t.match)}, ${esc(`${fmtDay(t.date).rel || fmtShort(t.date)}, ${fmtTime(t.date, t.time_valid)}`)}</span></span></a>`;
    const top = trs.slice(0, 6), rest = trs.slice(6);
    html += `<section class="sec best"><h2>Tendenze in corso<small>le serie più lunghe</small></h2>${top.map(tRow).join("")}
      ${rest.length ? `<details class="more"><summary>Altre ${rest.length}</summary>${rest.map(tRow).join("")}</details>` : ""}
      <p class="note">Serie aperte delle squadre che giocano a breve. Sono un'informazione, non un pronostico: le percentuali restano quelle del modello.</p></section>`;
  }
  // dove il modello e i bookmaker non sono d'accordo
  const gaps = (BEST.disagree || []).filter(ok);
  if (gaps.length) {
    const gapRow = it => pickRow({ ...it, cat: it.cat }, false, true).replace(/<span class="edge[^"]*">bookmaker [^<]*<\/span>/,
      `<span class="edge pos">modello ${pct(it.p)}, bookmaker ${pct(it.book)}: +${Math.round(it.edge * 100)} punti</span>`);
    const top = gaps.slice(0, 8), rest = gaps.slice(8);
    html += `<section class="sec best gaps"><h2>Modello contro bookmaker<small>dove il modello è più ottimista</small></h2>
      ${top.map(gapRow).join("")}
      ${rest.length ? `<details class="more"><summary>Altre ${rest.length}</summary>${rest.map(gapRow).join("")}</details>` : ""}
      <p class="note">Le giocate a cui il modello dà più probabilità dei bookmaker (quote senza il loro margine). Una differenza grande non vuol dire che il modello abbia ragione: spesso i bookmaker sanno cose che il modello non vede (infortuni, formazioni, motivazioni). Quanto ci prende ciascuno lo vedi in Affidabilità.</p>
    </section>`;
  }
  for (const c of cats) {
    const top = c.items.slice(0, 3), rest = c.items.slice(3);
    html += `<section class="sec best"><h2>${esc(c.name)}<small>${c.items.length} giocate</small></h2>
      ${top.map(it => pickRow(it, true)).join("")}
      ${rest.length ? `<details class="more"><summary>Altre giocate: ${esc(c.name)} (${rest.length})</summary>${rest.map(it => pickRow(it, false)).join("")}</details>` : ""}
    </section>`;
  }
  html += `<p class="note">Classifica per probabilità stimata dal modello. Dove ci sono le quote, sotto c'è la percentuale dei bookmaker, in verde quando il modello è più ottimista di almeno 5 punti. La classifica in assoluto raccoglie tutte le giocate dal 70% in su, anche più di una per partita, e le stesse giocate restano anche nella loro categoria qui sotto. Usa solo le linee principali (esito, Over/Under 2,5, Goal, angoli 9,5, vincente, linea punti dei bookmaker, soglie dei giocatori): giocate scontate come Over 1,5 o la doppia chance starebbero sempre in cima. Le probabilità alte non sono certezze, e più giocate insieme si moltiplicano tra loro.</p>`;
  $app.innerHTML = html;
  $app.querySelectorAll("[data-sport]").forEach(b => b.onclick = () => { state.sport = b.dataset.sport; state.league = "all"; save("sport", state.sport); save("league", "all"); showBest(); });
  $app.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { state.day = b.dataset.day; showBest(); });
}

/* ------------------------------------------------------------------ schedina */

/* tipo di giocata, per le statistiche dello storico */
function kindOf(f) {
  const l = f.label || "";
  if (f.sport === "tennis") return /game/i.test(l) ? "Game nel tennis" : "Vincente tennis";
  if (f.sport === "nba") return / almeno /.test(l) ? "Giocatori NBA" : /vince/.test(l) ? "Vincente NBA" : "Punti NBA";
  if (/\+/.test(l)) return "Combo";
  if (/primo tempo/i.test(l)) return "Primo tempo";
  if (/^\d+-\d+$/.test(l)) return "Risultato esatto";
  if (/angol/i.test(l)) return "Angoli";
  if (/gialli/i.test(l)) return "Cartellini";
  if (/ (segna|fa assist|assist|tiro in porta|ammonito)/i.test(l) && !/vince/.test(l)) return "Giocatori";
  if (/vince|pareggio|Pareggio|Una delle due/.test(l)) return "Esito";
  if (/Over|Under|Goal|Multigol|inviolata/.test(l)) return "Gol";
  return "Altro";
}

/* riga di una giocata salvata, con il suo esito (o come sta andando) */
function slipRow(f, now = Date.now()) {
  FAVMETA.set(f.key, f);
  const when = `${fmtDay(f.date).rel || fmtShort(f.date)}, ${fmtTime(f.date, f.time_valid)}`;
  const res = f.result ? `<span class="slip-live ${f.result}"><span class="ls-dot ${f.result}"></span>${esc(f.result_txt || (f.result === "win" ? "Vinta" : "Persa"))}</span>`
    : new Date(f.date).getTime() <= now ? (now - new Date(f.date).getTime() < 4 * 864e5
      ? `<span class="slip-live" data-slip-event="${esc(f.event)}" data-slip-label="${esc(f.label)}">Controllo com'è andata…</span>`
      : `<span class="slip-live">Esito non disponibile</span>`) : "";
  return `<div class="pk slip">${ring(f.p, f.p >= .75)}<a class="pk-txt" href="#/e/${encodeURIComponent(f.event)}"><b>${esc(f.label)}</b>
    <span>${esc(f.match)}</span><span>${esc(f.league_name)}, ${esc(when)}${f.book != null ? `, bookmaker ${pct(f.book)}` : ""}</span>
    ${res}</a>${f.result ? "" : star(f.key)}</div>`;
}
const slipStarted = (f, now = Date.now()) => new Date(f.date).getTime() <= now - 3 * 3600e3;

/* Schedina: solo per comporre la schedina e salvarla. Quelle salvate e lo storico stanno in Tu. */
function showSlip() {
  const now = Date.now();
  const all = favs().sort((a, b) => a.date.localeCompare(b.date));
  const next = all.filter(f => !slipStarted(f, now) && !f.result);
  const doneNow = all.filter(f => !slipStarted(f, now) && f.result);   // già decise ma la partita è ancora in corso
  const open = [...next, ...doneNow];
  const multi = `<a class="std-link" href="#/multipla"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M4 12h16M4 17h7"/><circle cx="18" cy="7" r="2"/><circle cx="15" cy="17" r="2"/></svg>Costruisci una multipla<span>›</span></a>`;
  const toMe = mySlips().length || all.some(f => f.result || slipStarted(f, now))
    ? `<a class="std-link" href="#/tu"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>Schedine salvate e storico<span>›</span></a>` : "";
  if (!open.length) {
    $app.innerHTML = multi + `<div class="empty"><b>Nessuna schedina in costruzione</b>Tocca la stella accanto a una giocata, nelle schede delle partite o in Migliori, per aggiungerla qui. Poi tocca <b>Salva come schedina</b>: la ritrovi in Tu, dove l'app segna da sola com'è andata.</div>` + toMe;
    return;
  }
  const events = new Set(open.map(f => f.event));
  const prod = open.reduce((a, f) => a * f.p, 1);
  const sameMatch = events.size < open.length;
  let html = multi + `<section class="sec slip-sum"><h2>La tua schedina<small>${open.length} ${open.length === 1 ? "giocata" : "giocate"}</small></h2>
    <div class="slip-nums"><div>${ring(prod, prod >= .5)}<span>probabilità che escano tutte</span></div>
    <div class="big-odd"><b>${odd(prod)}</b><span>quota equa della multipla</span></div></div>
    <p class="note">${sameMatch ? "Ci sono più giocate sulla stessa partita: sono collegate tra loro, quindi la probabilità complessiva è solo indicativa. " : ""}Le probabilità sono quelle del momento in cui hai aggiunto la giocata. La quota equa è quella sotto cui il modello la ritiene sfavorevole.</p>
    ${next.length ? `<div class="slip-acts"><button type="button" class="btn-main" id="slip-save"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>Salva come schedina</button>
      <button type="button" class="btn-main alt" id="slip-share"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3"/></svg>Condividi</button>
      <button type="button" class="btn-main alt" id="slip-img"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/></svg>Immagine</button>
      <button type="button" class="link-btn" id="slip-clear">Svuota la schedina</button></div>` : ""}</section>
    <section class="sec">${open.map(f => slipRow(f, now)).join("")}</section>` + toMe;
  $app.innerHTML = html;
  const sv = document.getElementById("slip-save");
  if (sv) sv.onclick = async () => {
    const name = await askText("Nome della schedina", `Schedina ${mySlips().length + 1}`, { hint: "La ritrovi in Tu, dove l'app segna da sola com'è andata." });
    if (name === null) return;
    saveAsSlip(next, name.trim() || undefined);
    saveFavs(all.filter(f => !next.includes(f)));   // la schedina in costruzione si svuota: le giocate sono in quella salvata
    toast("Schedina salvata: la trovi in Tu");
    showSlip();
  };
  const sh = document.getElementById("slip-share");
  if (sh) sh.onclick = () => shareSlip(next);
  const si = document.getElementById("slip-img");
  if (si) si.onclick = () => shareSlipImage(next, "La mia schedina");
  const c = document.getElementById("slip-clear");
  if (c) c.onclick = async () => {
    if (await askConfirm("Togliere tutte le giocate dalla schedina in costruzione?", { title: "Svuotare la schedina?", ok: "Sì, svuota", danger: true })) {
      saveFavs(all.filter(f => !next.includes(f))); toast("Schedina svuotata"); showSlip();
    }
  };
  attachSlipStatus();
}

/* giocate singole già iniziate o chiuse: in attesa dell'esito e storico (pagina Tu) */
function playedHtml() {
  const now = Date.now();
  const all = favs();
  const waiting = all.filter(f => slipStarted(f, now) && !f.result).sort((a, b) => b.date.localeCompare(a.date));
  // storico: giocate singole chiuse più quelle delle schedine salvate, ognuna una volta sola
  const seen = new Set();
  const done = [...all, ...mySlips().flatMap(s => s.legs.map(f => ({ ...f, league_name: f.league_name || "" })))]
    .filter(f => f.result && !seen.has(f.key) && seen.add(f.key)).sort((a, b) => b.date.localeCompare(a.date));
  let html = "";
  if (waiting.length) html += sec("Giocate in attesa dell'esito", waiting.map(f => slipRow(f, now)).join(""), `${waiting.length}`, "Tu attesa");
  if (done.length) {
    const w = done.filter(f => f.result === "win").length, exp = done.reduce((a, f) => a + f.p, 0);
    const kinds = new Map();
    for (const f of done) { const k = kindOf(f); const o = kinds.get(k) || { n: 0, w: 0, e: 0 }; o.n++; o.w += f.result === "win"; o.e += f.p; kinds.set(k, o); }
    const kRows = [...kinds].sort((a, b) => b[1].n - a[1].n).map(([k, o]) =>
      `<div class="r"><span class="l">${esc(k)} <span class="faint">${o.n} ${o.n === 1 ? "giocata" : "giocate"}</span></span><span class="v num">${o.w} ${o.w === 1 ? "vinta" : "vinte"} <span class="faint">su ${o.n}, ${Math.round(100 * o.w / o.n)}% · stima ${Math.round(100 * o.e / o.n)}%</span></span></div>`).join("");
    const verdict = done.length < 15 ? "Sono ancora poche giocate per dire se ti va meglio o peggio del previsto."
      : w >= exp + Math.sqrt(exp) ? "Ne hai prese più di quante ne prevedeva il modello."
      : w <= exp - Math.sqrt(exp) ? "Ne hai prese meno di quante ne prevedeva il modello."
      : "Sei in linea con quello che prevedeva il modello.";
    const recent = done.slice(0, 15), older = done.slice(15);
    html += sec("Storico delle giocate", `<div class="slip-nums"><div>${ring(w / done.length, w / done.length >= .5)}<span>prese: ${w} su ${done.length}</span></div>
      <div class="big-odd"><b>${exp.toFixed(1).replace(".", ",")}</b><span>quelle che il modello si aspettava</span></div></div>
      <p class="note">${verdict} Ogni giocata delle schedine conta una volta; la stima è quella del momento in cui l'hai aggiunta.</p>
      <h3 class="lb-h3">Per tipo di giocata</h3><div class="rows">${kRows}</div>
      <details class="more"><summary>Le ultime ${recent.length}${older.length ? ` (più ${older.length} precedenti)` : ""}</summary>${recent.map(f => slipRow(f, now)).join("")}${older.map(f => slipRow(f, now)).join("")}</details>
      <button type="button" class="link-btn" id="slip-clear-hist">Cancella lo storico</button>`, `${done.length} chiuse`, "Tu storico");
  }
  return html;
}
function wirePlayed() {
  const ch = document.getElementById("slip-clear-hist");
  if (ch) ch.onclick = async () => { if (await askConfirm("Le schedine salvate restano finché non le elimini.", { title: "Cancellare lo storico delle giocate singole?", ok: "Sì, cancella", danger: true })) { saveFavs(favs().filter(f => !f.result && !slipStarted(f))); showMe(); } };
}

/* ------------------------------------------------------------------ affidabilità */

function calibChart(bins) {
  if (!bins.length) return "";
  const W = 320, H = 180, p = 30;
  const x = v => p + v * (W - p - 10), y = v => H - p - v * (H - p - 10);
  const pts = bins.map(b => `<circle class="pt" cx="${x(b.pred)}" cy="${y(b.real)}" r="${Math.min(7, 2.5 + Math.sqrt(b.n) / 6)}"><title>Previsto ${pct(b.pred)}, successo ${pct(b.real)} su ${b.n}</title></circle>`).join("");
  return `<svg class="calib" viewBox="0 0 ${W} ${H}" role="img" aria-label="Taratura: probabilità prevista contro frequenza reale">
    <line class="ax" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(0)}"/><line class="ax" x1="${x(0)}" y1="${y(0)}" x2="${x(0)}" y2="${y(1)}"/>
    <line class="diag" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}"/>${pts}
    <text x="${x(0)}" y="${H - 10}">0%</text><text x="${x(1) - 26}" y="${H - 10}">100%</text>
    <text x="${x(.5) - 22}" y="${H - 10}">previsto</text><text x="2" y="${y(1) + 4}">100%</text><text x="2" y="${y(.5)}">reale</text></svg>`;
}

boot();
