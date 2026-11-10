"use strict";
/* Pronostici — sezione Live e collegamenti "Segui in diretta" / "Dove vederla".
   I risultati in diretta arrivano da ESPN direttamente dal telefono, ogni 30 secondi mentre la pagina è aperta.
   Usa funzioni e dati di app.js (INDEX, esc, pct, ring, fmtTime, favs...). */

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_CODE = {
  "serie-a": "ita.1", "premier-league": "eng.1", "la-liga": "esp.1", "bundesliga": "ger.1", "ligue-1": "fra.1",
  "primeira-liga": "por.1", "j1": "jpn.1", "mls": "usa.1", "eliteserien": "nor.1",
  "champions": "uefa.champions", "europa-league": "uefa.europa", "conference": "uefa.europa.conf",
  "champions-femminile": "uefa.wchampions",
};
const LIVE_REFRESH = 30000;
let liveTimer = null;

/* ------------------------------------------------------------------ dove vederla (Italia, stagione 2026-27) */

const TV = {
  dazn: ["DAZN", "https://www.dazn.com/it-IT/welcome"],
  sky: ["Sky Sport", "https://sport.sky.it/"],
  now: ["NOW", "https://www.nowtv.it/sport"],
  prime: ["Prime Video", "https://www.primevideo.com/"],
  tv8: ["TV8, in chiaro", "https://www.tv8.it/"],
  ligue1: ["Ligue 1+", "https://www.ligue1plus.fr/"],
  apple: ["Apple TV, MLS Season Pass", "https://tv.apple.com/channel/mls-season-pass"],
  leaguepass: ["NBA League Pass", "https://www.nba.com/watch/league-pass-stream"],
  supertennis: ["SuperTennis, gratis con registrazione", "https://plus.supertennis.tv/benvenuto"],
};
const WHERE = {
  "serie-a": { tv: ["dazn", "sky", "now"], note: "DAZN tutte le partite, Sky e NOW tre per giornata. Qualche partita all'anno è gratis su DAZN." },
  "champions": { tv: ["sky", "now", "prime", "tv8"], note: "Quasi tutte su Sky e NOW, la migliore del mercoledì su Prime Video. Alcune sfide tra club stranieri sono in chiaro su TV8." },
  "europa-league": { tv: ["sky", "now"] },
  "conference": { tv: ["sky", "now"] },
  "premier-league": { tv: ["sky", "now"] },
  "bundesliga": { tv: ["sky", "now"] },
  "la-liga": { tv: ["dazn"] },
  "ligue-1": { tv: ["ligue1"] },
  "mls": { tv: ["apple"] },
  "nba": { tv: ["sky", "now", "leaguepass"] },
  "atp": { tv: ["sky", "now"], note: "La maggior parte dei tornei ATP è su Sky e NOW." },
  "wta": { tv: ["supertennis", "sky", "now"], note: "Molti tornei WTA sono gratis su SuperTennis: controlla il palinsesto." },
};

function whereToWatch(league) {
  const w = WHERE[league];
  if (!w) return `<p class="note">Per questa competizione non ho trovato un canale italiano verificato: controlla i siti di risultati qui sopra.</p>`;
  return `<div class="watch">${w.tv.map(k => `<a class="watch-chip ${k === "tv8" || k === "supertennis" ? "free" : ""}" href="${TV[k][1]}" target="_blank" rel="noopener">${esc(TV[k][0])}</a>`).join("")}</div>
    ${w.note ? `<p class="note">${esc(w.note)}</p>` : ""}<p class="note">Servizi ufficiali in Italia per la stagione 2026-27; i diritti possono cambiare.</p>`;
}

/* ------------------------------------------------------------------ segui in diretta */

function espnId(eventId) { return (eventId.match(/-(\d+)$/) || [])[1]; }

function followLinks(d) {
  const id = espnId(d.id);
  const q = encodeURIComponent(`${d.home.name} ${d.away.name}`);
  const links = [];
  if (d.sport === "soccer" && id) links.push(["Diretta ESPN", `https://www.espn.com/soccer/match/_/gameId/${id}`]);
  if (d.sport === "nba" && id) links.push(["Diretta ESPN", `https://www.espn.com/nba/game/_/gameId/${id}`]);
  if (d.sport === "tennis") links.push(["Risultati ESPN", "https://www.espn.com/tennis/scoreboard"]);
  const sec = { soccer: "", nba: "basket/", tennis: "tennis/" }[d.sport];
  links.push(["Diretta.it", `https://www.diretta.it/${sec}`]);
  links.push(["SofaScore", `https://www.sofascore.com/it/search?q=${q}`]);
  return `<div class="watch">${links.map(([l, u]) => `<a class="watch-chip" href="${u}" target="_blank" rel="noopener">${esc(l)}</a>`).join("")}</div>
    <p class="note">Risultato, cronaca e statistiche in diretta, gratis. Diretta.it apre la pagina dello sport del giorno.</p>`;
}

/* ------------------------------------------------------------------ probabilità durante la partita */

function poisson(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }

/* calcio: dal risultato attuale e dai gol attesi residui */
function soccerLive(xg, hs, as, minute) {
  const rem = Math.max(0, (95 - Math.min(minute, 95)) / 92);
  const lh = (xg?.[0] ?? 1.35) * rem, la = (xg?.[1] ?? 1.1) * rem;
  let p1 = 0, px = 0, p2 = 0, over = 0, btts = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const p = poisson(lh, i) * poisson(la, j), H = hs + i, A = as + j;
    if (H > A) p1 += p; else if (H === A) px += p; else p2 += p;
    if (H + A > 2.5) over += p;
    if (H > 0 && A > 0) btts += p;
  }
  const s = p1 + px + p2;
  return { win: [p1 / s, px / s, p2 / s], over25: over / s, btts: btts / s };
}

/* NBA: probabilità ESPN se c'è, altrimenti vantaggio attuale + margine atteso sul tempo che resta */
function nbaLive(comp, expMargin, hs, as) {
  const pr = comp?.situation?.lastPlay?.probability?.homeWinPercentage;
  if (pr != null) return [pr, 1 - pr];
  const period = comp?.status?.period || 1;
  const clock = comp?.status?.clock ?? 720;
  const remMin = Math.max(0, (4 - period) * 12 + clock / 60);
  const frac = Math.max(remMin / 48, 0.002);
  const z = ((hs - as) + (expMargin || 0) * frac) / (13 * Math.sqrt(frac));
  const p = 0.5 * (1 + erf(z / Math.SQRT2));
  return [p, 1 - p];
}
function erf(x) { const t = 1 / (1 + .3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

/* ------------------------------------------------------------------ dati live da ESPN */

async function espnBoard(sport, league) {
  const r = await fetch(`${ESPN_SITE}/${sport}/${league}/scoreboard`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  return (await r.json()).events || [];
}

function parseTeamEvent(ev, sport, leagueKey) {
  const c = ev.competitions?.[0]; if (!c) return null;
  const t = {}; for (const x of c.competitors || []) t[x.homeAway] = x;
  if (!t.home || !t.away) return null;
  const st = (ev.status || c.status || {}).type || {};
  return {
    id: String(ev.id), sport, league: leagueKey, state: st.state, detail: st.shortDetail || st.detail || "",
    date: ev.date, comp: c, clock: c.status?.displayClock, period: c.status?.period,
    home: { name: t.home.team?.displayName, logo: t.home.team?.logo, score: Number(t.home.score ?? 0) },
    away: { name: t.away.team?.displayName, logo: t.away.team?.logo, score: Number(t.away.score ?? 0) },
  };
}

function parseTennis(evs, tour) {
  const slug = tour === "atp" ? "mens-singles" : "womens-singles", out = [];
  for (const ev of evs) for (const g of ev.groupings || []) {
    if (g.grouping?.slug !== slug) continue;
    for (const c of g.competitions || []) {
      const st = c.status?.type || {};
      if (st.state !== "in") continue;
      const ps = (c.competitors || []).sort((a, b) => (a.order || 0) - (b.order || 0));
      if (ps.length !== 2) continue;
      out.push({ id: String(c.id), sport: "tennis", league: tour, state: "in", detail: st.shortDetail || "", date: c.date, tournament: ev.name,
        players: ps.map(p => ({ name: p.athlete?.displayName, flag: p.athlete?.flag?.href, sets: (p.linescores || []).map(x => x.value) })) });
    }
  }
  return out;
}

function minuteOf(e) {
  const m = parseInt(String(e.clock || e.detail).replace(/[^\d+]/g, "").split("+")[0], 10);
  return isNaN(m) ? (e.period === 2 ? 60 : 20) : m;
}

async function loadLive() {
  const today = new Set(INDEX.events.filter(e => Math.abs(new Date(e.date) - Date.now()) < 20 * 3600e3).map(e => e.league));
  const jobs = [];
  for (const [k, code] of Object.entries(ESPN_CODE)) if (today.has(k)) jobs.push(espnBoard("soccer", code).then(evs => evs.map(ev => parseTeamEvent(ev, "soccer", k))));
  if (today.has("nba")) jobs.push(espnBoard("basketball", "nba").then(evs => evs.map(ev => parseTeamEvent(ev, "nba", "nba"))));
  for (const t of ["atp", "wta"]) if (today.has(t)) jobs.push(espnBoard("tennis", t).then(evs => parseTennis(evs, t)));
  const res = await Promise.allSettled(jobs);
  const failed = res.filter(r => r.status === "rejected").length;
  return { events: res.flatMap(r => r.status === "fulfilled" ? r.value.filter(Boolean) : []), failed, total: jobs.length };
}

/* ------------------------------------------------------------------ esito delle giocate salvate durante la partita */

function slipStatus(f, e) {
  if (!e || e.sport === "tennis") return null;
  const H = e.home.score, A = e.away.score, tot = H + A, L = f.label;
  const ended = e.state === "post";
  const mine = side => L.startsWith((side === "home" ? f.match.split(" – ")[0] : f.match.split(" – ")[1]) || "@@");
  let ok = null;
  let m;
  if ((m = L.match(/^Over (\d+),5( punti)?$/))) ok = tot > +m[1] ? true : ended ? false : null;
  else if ((m = L.match(/^Under (\d+),5( punti)?$/))) ok = tot > +m[1] ? false : ended ? true : null;
  else if (L === "Goal, segnano entrambe") ok = H > 0 && A > 0 ? true : ended ? false : null;
  else if (L === "No Goal") ok = H > 0 && A > 0 ? false : ended ? true : null;
  else if (L === "Pareggio") ok = ended ? H === A : null;
  else if (/ vince$/.test(L)) { const home = INDEX.events.find(x => x.id === f.event)?.home_short; const isHome = L.startsWith(home || "@@") || mine("home"); ok = ended ? (isHome ? H > A : A > H) : null; }
  const lead = / vince$/.test(L) || L === "Pareggio" ? `${H}-${A}` : `${tot} ${e.sport === "nba" ? "punti" : "gol"}`;
  if (ok === true) return { cls: "win", txt: ended ? `presa, ${lead}` : `già presa, ${lead}` };
  if (ok === false) return { cls: "lose", txt: `persa, ${lead}` };
  return { cls: "", txt: ended ? `finita ${H}-${A}` : `in corso, ${H}-${A}` };
}

/* ------------------------------------------------------------------ pagina Live */

async function showLive() {
  clearTimeout(liveTimer);
  if (!$app.querySelector(".live-page")) $app.innerHTML = `<div class="live-page"><p class="muted" style="padding:20px 4px">Carico le partite in corso…</p></div>`;
  let data;
  try { data = await loadLive(); } catch { data = { events: [], failed: 1, total: 1 }; }
  if (!location.hash.startsWith("#/live")) return;
  const byKey = Object.fromEntries(INDEX.events.map(e => [e.id, e]));
  const live = data.events.filter(e => e.state === "in");
  const done = data.events.filter(e => e.state === "post" && Date.now() - new Date(e.date) < 6 * 3600e3);
  const soon = INDEX.events.filter(e => { const t = new Date(e.date) - Date.now(); return t > 0 && t < 3 * 3600e3; });
  const evId = e => e.sport === "soccer" ? `calcio-${e.league}-${e.id}` : e.sport === "nba" ? `basket-nba-${e.id}` : `tennis-${e.league}-${e.id}`;

  const card = e => {
    const ix = byKey[evId(e)];
    const href = ix ? `#/e/${encodeURIComponent(ix.id)}` : "#/live";
    if (e.sport === "tennis") {
      const [a, b] = e.players;
      return `<a class="live-row" href="${href}"><div class="live-main"><div class="live-min on">${esc(e.detail || "Live")}</div>
        <div class="live-teams"><div>${img(a.flag, "tflag")}<span>${esc(a.name)}</span><b>${a.sets.join(" ")}</b></div>
        <div>${img(b.flag, "tflag")}<span>${esc(b.name)}</span><b>${b.sets.join(" ")}</b></div></div></div></a>`;
    }
    let rings = "", sub = "";
    if (e.state === "in" && e.sport === "soccer") {
      const p = soccerLive(ix?.xg, e.home.score, e.away.score, minuteOf(e));
      rings = p.win.map((x, i) => `<span class="fx-ring">${ring(x, x === Math.max(...p.win))}<small>${["1", "X", "2"][i]}</small></span>`).join("");
      sub = `Adesso Over 2,5 <b>${pct(p.over25)}</b>, Goal <b>${pct(p.btts)}</b>${ix ? `. Prima del via: ${ix.main.map(pct).join(" / ")}` : ""}`;
    } else if (e.state === "in" && e.sport === "nba") {
      const p = nbaLive(e.comp, ix?.exp_score ? ix.exp_score[0] - ix.exp_score[1] : 0, e.home.score, e.away.score);
      rings = p.map((x, i) => `<span class="fx-ring">${ring(x, x === Math.max(...p))}<small>${i ? "2" : "1"}</small></span>`).join("");
      if (ix) sub = `Prima del via: ${ix.main.map(pct).join(" / ")}`;
    }
    const mine = favs().filter(f => f.event === evId(e));
    const slip = mine.length ? `<div class="live-slip">${mine.map(f => { const s = slipStatus(f, e); return `<span class="ls ${s?.cls || ""}">★ ${esc(f.label)}${s ? `: ${esc(s.txt)}` : ""}</span>`; }).join("")}</div>` : "";
    const min = e.state === "in" ? (e.sport === "soccer" ? (e.clock || e.detail) : e.detail) : "Finale";
    return `<a class="live-row" href="${href}"><div class="live-main"><div class="live-min ${e.state === "in" ? "on" : ""}">${esc(min)}</div>
      <div class="live-teams"><div>${teamMark(ix?.home_logo || e.home.logo, null, ix?.home_color)}<span>${esc(e.home.name)}</span><b>${e.home.score}</b></div>
      <div>${teamMark(ix?.away_logo || e.away.logo, null, ix?.away_color)}<span>${esc(e.away.name)}</span><b>${e.away.score}</b></div></div></div>
      ${rings || sub ? `<div class="live-probs">${rings ? `<div class="fx-rings">${rings}</div>` : ""}${sub ? `<div class="live-sub">${sub}</div>` : ""}</div>` : ""}${slip}</a>`;
  };

  const groups = list => {
    const m = new Map();
    for (const e of list) { const g = e.sport === "tennis" ? `${e.league.toUpperCase()} – ${e.tournament || ""}` : (byKey[evId(e)]?.league_name || leagueLabel(e.league)); if (!m.has(g)) m.set(g, []); m.get(g).push(e); }
    return [...m].map(([g, l]) => `<section class="group"><div class="group-h static"><span class="group-dot g-${l[0].sport}"></span><b>${esc(g)}</b><small>${l.length}</small></div>${l.map(card).join("")}</section>`).join("");
  };

  let html = `<div class="live-page"><div class="live-head"><span class="pulse"></span><b>${live.length ? `${live.length} ${live.length === 1 ? "partita" : "partite"} in corso` : "Nessuna partita in corso"}</b>
    <small>si aggiorna ogni 30 secondi</small></div>`;
  if (data.failed && data.failed === data.total) html += `<div class="warn">Non riesco a leggere i risultati in diretta in questo momento. Riprovo tra 30 secondi; intanto puoi usare Diretta.it o SofaScore dalla scheda della partita.</div>`;
  if (live.length) html += groups(live);
  if (done.length) html += `<h2 class="day">Finite da poco</h2>` + groups(done);
  if (!live.length && soon.length) html += `<h2 class="day">Tra poco</h2>` + soon.slice(0, 15).map(e => `<section class="group">${fixture(e)}</section>`).join("");
  if (!live.length && !done.length && !soon.length) html += `<div class="empty"><b>Niente in diretta adesso</b>Le partite compaiono qui appena iniziano.</div>`;
  html += `<p class="note">Durante le partite di calcio le percentuali ripartono dal risultato del momento e dai gol attesi del modello per il tempo che resta. Nell'NBA uso la probabilità in diretta di ESPN quando c'è. Sono stime: un gol o un canestro le cambia subito.</p></div>`;
  $app.innerHTML = html;
  liveTimer = setTimeout(() => { if (location.hash.startsWith("#/live") && !document.hidden) showLive(); else liveTimer = setTimeout(showLive, LIVE_REFRESH); }, LIVE_REFRESH);
}

function leagueLabel(k) {
  for (const list of Object.values(LEAGUES)) for (const [key, l] of list) if (key === k) return l;
  return k === "nba" ? "NBA" : k;
}

window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/live")) clearTimeout(liveTimer); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && location.hash.startsWith("#/live")) showLive(); });
