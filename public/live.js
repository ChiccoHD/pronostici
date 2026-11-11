"use strict";
/* Pronostici — sezione Live e collegamenti "Segui in diretta" / "Dove vederla".
   I risultati in diretta arrivano da ESPN direttamente dal telefono mentre la pagina è aperta:
   ogni pochi secondi se c'è una partita in corso, ogni 30 secondi altrimenti. Con l'app in secondo piano si ferma.
   Usa funzioni e dati di app.js (INDEX, esc, pct, ring, fmtTime, favs...). */

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_CODE = {
  "serie-a": "ita.1", "premier-league": "eng.1", "la-liga": "esp.1", "bundesliga": "ger.1", "ligue-1": "fra.1",
  "primeira-liga": "por.1", "j1": "jpn.1", "mls": "usa.1", "eliteserien": "nor.1",
  "champions": "uefa.champions", "europa-league": "uefa.europa", "conference": "uefa.europa.conf",
  "champions-femminile": "uefa.wchampions",
};
const LIVE_FAST = 8000;     // con una partita in corso: ESPN aggiorna i suoi dati ogni 10 secondi circa, più spesso non serve
const LIVE_SLOW = 30000;    // nessuna partita in corso (o in attesa del fischio d'inizio)

/* punteggi visti l'ultima volta: se cambiano, il numero lampeggia (gol, canestro, game) */
const lastScore = new Map();
function scoreChanged(id, info) {
  const now = info.sport === "tennis" ? info.sets.map(s => s.join(".")).join("|") : `${info.H}-${info.A}`;
  const before = lastScore.get(id);
  lastScore.set(id, now);
  return before != null && before !== now;
}
/* rimanda un aggiornamento: se l'app è in secondo piano aspetta che torni visibile */
function later(fn, ms) {
  return setTimeout(() => { if (document.hidden) pending.add(fn); else fn(); }, ms);
}
const pending = new Set();
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

async function espnJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
const espnBoard = async (sport, league) => (await espnJSON(`${ESPN_SITE}/${sport}/${league}/scoreboard`)).events || [];

/* "calcio-serie-a-12345" -> dove chiedere a ESPN */
function espnTarget(eventId) {
  const m = String(eventId).match(/^(calcio|basket|tennis)-(.+)-(\d+)$/);
  if (!m) return null;
  const [, kind, league, id] = m;
  if (kind === "calcio") return ESPN_CODE[league] ? { sport: "soccer", path: `soccer/${ESPN_CODE[league]}`, league, id } : null;
  if (kind === "basket") return { sport: "nba", path: "basketball/nba", league: "nba", id };
  return { sport: "tennis", path: `tennis/${league}`, league, id };
}

const normName = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const statNum = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };

/* stato di una partita (calcio/NBA) da una "competition" ESPN: va bene sia quella del tabellone sia quella del riepilogo */
function infoFromComp(c, sport, extraStatus) {
  if (!c) return null;
  const t = {}; for (const x of c.competitors || []) t[x.homeAway] = x;
  if (!t.home || !t.away) return null;
  const st = c.status || extraStatus || {}, ty = st.type || {};
  const names = side => { const tm = t[side].team || {}; return [tm.displayName, tm.shortDisplayName, tm.abbreviation, tm.name, tm.location].filter(Boolean).map(normName); };
  const half = (t.home.linescores || []).length && (t.away.linescores || []).length
    ? [statNum(t.home.linescores[0].displayValue ?? t.home.linescores[0].value), statNum(t.away.linescores[0].displayValue ?? t.away.linescores[0].value)] : null;
  return {
    sport, state: ty.state || "pre", detail: ty.shortDetail || ty.detail || "", clock: st.displayClock, period: st.period || 0,
    H: statNum(t.home.score), A: statNum(t.away.score), half,
    home: { name: t.home.team?.displayName, logo: t.home.team?.logo, keys: names("home") },
    away: { name: t.away.team?.displayName, logo: t.away.team?.logo, keys: names("away") },
    comp: c, players: new Map(), teamStats: null, winProb: null,
  };
}

/* riepilogo completo di una partita: risultato, marcatori, angoli, gialli, tabellino NBA */
async function eventInfo(tg) {
  if (tg.sport === "tennis") return tennisInfo(tg, await espnBoard("tennis", tg.league));
  const s = await espnJSON(`${ESPN_SITE}/${tg.path}/summary?event=${tg.id}`);
  const info = infoFromComp(s.header?.competitions?.[0], tg.sport);
  if (!info) return null;
  const sideOf = {}; for (const x of s.header.competitions[0].competitors) sideOf[String(x.team?.id ?? x.id)] = x.homeAway;
  const ts = {};
  for (const t of s.boxscore?.teams || []) {
    const side = t.homeAway || sideOf[String(t.team?.id)];
    if (!side) continue;
    ts[side] = Object.fromEntries((t.statistics || []).map(x => [x.name, statNum(x.displayValue ?? x.value)]));
  }
  if (ts.home && ts.away) info.teamStats = ts;
  // per la scheda in diretta: statistiche così come le dà ESPN, cronaca, punteggio per periodo
  info.rawStats = {};
  for (const t of s.boxscore?.teams || []) {
    const side = t.homeAway || sideOf[String(t.team?.id)];
    if (side) info.rawStats[side] = Object.fromEntries((t.statistics || []).map(x => [x.name, x.displayValue ?? x.value]));
  }
  const seen = new Set();
  info.events = (s.keyEvents || []).filter(k => !seen.has(k.id) && seen.add(k.id)).map(k => ({
    type: k.type?.type || "", clock: k.clock?.displayValue || "", period: k.period?.number || 0,
    side: k.team ? sideOf[String(k.team.id)] : null, who: (k.participants || []).map(p => p.athlete?.displayName).filter(Boolean),
  }));
  info.periods = ["home", "away"].map(side => {
    const c = s.header.competitions[0].competitors.find(x => x.homeAway === side);
    return (c?.linescores || []).map(x => statNum(x.displayValue ?? x.value));
  });
  if (tg.sport === "nba") info.plays = (s.plays || []).slice(-15).reverse().map(p => ({
    text: p.text || p.shortDescription || "", q: p.period?.number || 0, clock: p.clock?.displayValue || "",
    score: `${p.homeScore ?? ""}-${p.awayScore ?? ""}`, scoring: !!p.scoringPlay,
  }));
  if (tg.sport === "soccer") {
    for (const team of s.rosters || []) for (const p of team.roster || []) {
      const st = Object.fromEntries((p.stats || []).map(x => [x.name, statNum(x.value ?? x.displayValue)]));
      info.players.set(normName(p.athlete?.displayName), { g: st.totalGoals || 0 });
    }
  } else {
    for (const team of s.boxscore?.players || []) for (const block of team.statistics || []) {
      const labs = block.labels || [];
      for (const a of block.athletes || []) {
        const v = Object.fromEntries(labs.map((l, i) => [l, a.stats?.[i]]));
        const pts = statNum(v.PTS), reb = statNum(v.REB), ast = statNum(v.AST), tpm = statNum(String(v["3PT"] || "0").split("-")[0]);
        info.players.set(normName(a.athlete?.displayName), { pts, reb, ast, tpm, pra: pts + reb + ast });
      }
    }
    const wp = s.winprobability;
    if (Array.isArray(wp) && wp.length && info.state === "in") info.winProb = wp[wp.length - 1].homeWinPercentage;
  }
  return info;
}

/* tennis: lo cerco nel tabellone del torneo */
function tennisInfo(tg, evs) {
  for (const ev of evs) for (const g of ev.groupings || []) for (const c of g.competitions || []) {
    if (String(c.id) !== tg.id) continue;
    const ps = [...(c.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    if (ps.length !== 2) return null;
    const ty = c.status?.type || {};
    const sets = ps.map(p => (p.linescores || []).map(x => statNum(x.value)));
    let won = [0, 0];
    sets[0].forEach((g, i) => { const o = sets[1][i] ?? 0; const done = ty.state === "post" || i < sets[0].length - 1; if (done && g !== o) won[g > o ? 0 : 1]++; });
    return { sport: "tennis", state: ty.state || "pre", detail: ty.shortDetail || "", tournament: ev.name, sets, won,
      winner: ps[0].winner ? 0 : ps[1].winner ? 1 : null, H: won[0], A: won[1],
      games: sets[0].reduce((a, b) => a + b, 0) + sets[1].reduce((a, b) => a + b, 0),
      home: { name: ps[0].athlete?.displayName, flag: ps[0].athlete?.flag?.href, keys: [normName(ps[0].athlete?.displayName)] },
      away: { name: ps[1].athlete?.displayName, flag: ps[1].athlete?.flag?.href, keys: [normName(ps[1].athlete?.displayName)] },
      players: new Map() };
  }
  return null;
}

/* ------------------------------------------------------------------ formazioni ufficiali (calcio) */

/* ESPN pubblica le formazioni circa un'ora prima: le chiedo dal telefono da 90 minuti prima del via */
const LINEUPS = new Map();      // id partita -> { home, away } con titolari e panchina
let lineupTimer = null;

async function fetchLineups(tg) {
  const s = await espnJSON(`${ESPN_SITE}/${tg.path}/summary?event=${tg.id}`);
  const out = {};
  for (const team of s.rosters || []) {
    const side = team.homeAway;
    if (side !== "home" && side !== "away") continue;
    const people = (team.roster || []).map(p => ({
      pid: String(p.athlete?.id ?? ""), name: p.athlete?.displayName || p.athlete?.fullName || "",
      jersey: p.jersey || "", pos: p.position?.abbreviation || "", starter: !!p.starter,
    })).filter(p => p.name);
    out[side] = { formation: team.formation || "", starters: people.filter(p => p.starter), bench: people.filter(p => !p.starter) };
  }
  return out.home?.starters.length >= 11 && out.away?.starters.length >= 11 ? out : null;
}

async function attachLineups(d) {
  clearTimeout(lineupTimer);
  const tg = espnTarget(d.id), hash = location.hash;
  if (d.sport !== "soccer" || !tg) return;
  const start = new Date(d.date).getTime(), now = Date.now();
  if (now > start + 4 * 3600e3) return;
  if (now < start - 90 * 60e3) {   // troppo presto: riprovo all'ora giusta se la scheda resta aperta
    if (start - 90 * 60e3 - now < 3 * 3600e3) lineupTimer = later(() => { if (location.hash === hash) attachLineups(d); }, start - 90 * 60e3 - now);
    return;
  }
  let lu = LINEUPS.get(d.id);
  if (!lu) { try { lu = await fetchLineups(tg); } catch { lu = null; } }
  if (location.hash !== hash) return;
  if (lu) { LINEUPS.set(d.id, lu); showLineups(d, lu); }
  else lineupTimer = later(() => { if (location.hash === hash) attachLineups(d); }, 3 * 60e3);
}

/* ------------------------------------------------------------------ come sta andando una giocata salvata */

/* risultato: cls "win" vinta, "lose" persa, "ok" per ora va bene, "ko" per ora va male, "" da vedere */
function pickStatus(label, info) {
  if (!info || info.state === "pre") return null;
  const L = label, end = info.state === "post", H = info.H, A = info.A;
  const unit = info.sport === "nba" ? "punti" : info.sport === "tennis" ? "set" : "gol";
  const score = info.sport === "tennis" ? `set ${H}-${A}` : `${H}-${A}`;
  const R = (cls, txt) => ({ cls, txt });
  const sideOfText = txt => {
    const k = normName(txt);
    const hit = side => info[side].keys.some(x => x && (x === k || k.startsWith(x + " ") || x.startsWith(k)));
    return hit("home") ? "home" : hit("away") ? "away" : null;
  };
  const sideName = side => info[side].name;
  /* conteggi "over": quanti ne servono */
  const over = (c, n, what) => c > n ? R("win", `${end ? "Vinta" : "Già vinta"}: ${c} ${what}`)
    : end ? R("lose", `Persa: finita con ${c} ${what}`)
    : R("", `${n + 1 - c === 1 ? "Manca" : "Mancano"} ${n + 1 - c} ${what}, ora ${c}`);
  const under = (c, n, what) => c > n ? R("lose", `Persa: già ${c} ${what}`)
    : end ? R("win", `Vinta: finita con ${c} ${what}`)
    : R("ok", `Per ora va bene: ${c} ${what}, il massimo è ${n}`);
  /* esiti: f(h, a) -> vero se la giocata è presa con quel punteggio */
  const outcome = (f, h = H, a = A, ended = end) => f(h, a)
    ? R(ended ? "win" : "ok", ended ? `Vinta, ${h}-${a}` : `Per ora la stai vincendo, ${h}-${a}`)
    : R(ended ? "lose" : "ko", ended ? `Persa, ${h}-${a}` : `Per ora la stai perdendo, ${h}-${a}`);
  let m;

  if (info.sport === "tennis") {
    if ((m = L.match(/^(.+) vince$/))) {
      const side = sideOfText(m[1]); if (!side) return null;
      const i = side === "home" ? 0 : 1;
      if (end) return info.winner === i ? R("win", `Vinta, ${score}`) : R("lose", `Persa, ${score}`);
      return info.won[i] > info.won[1 - i] ? R("ok", `Avanti nei set, ${score}`) : info.won[i] < info.won[1 - i] ? R("ko", `Indietro nei set, ${score}`) : R("", `Set in parità, ${score}`);
    }
    if ((m = L.match(/^Over (\d+),5 game$/))) return over(info.games, +m[1], "game");
    if ((m = L.match(/^Under (\d+),5 game$/))) return under(info.games, +m[1], "game");
    return R("", end ? `Finita, ${score}` : `In corso, ${score}`);
  }

  if ((m = L.match(/^Over (\d+),5 angoli$/))) return info.teamStats ? over((info.teamStats.home.wonCorners || 0) + (info.teamStats.away.wonCorners || 0), +m[1], "angoli") : null;
  if ((m = L.match(/^Under (\d+),5 angoli$/))) return info.teamStats ? under((info.teamStats.home.wonCorners || 0) + (info.teamStats.away.wonCorners || 0), +m[1], "angoli") : null;
  if ((m = L.match(/^Over (\d+),5 gialli$/))) return info.teamStats ? over((info.teamStats.home.yellowCards || 0) + (info.teamStats.away.yellowCards || 0), +m[1], "gialli") : null;
  if ((m = L.match(/^(Over|Under) (\d+),5 nel primo tempo$/))) {
    const firstDone = end || info.period >= 2;
    const c = info.half && firstDone ? info.half[0] + info.half[1] : H + A;
    if (firstDone) return (m[1] === "Over") === (c > +m[2]) ? R("win", `Vinta: ${c} gol nel primo tempo`) : R("lose", `Persa: ${c} gol nel primo tempo`);
    return m[1] === "Over" ? (c > +m[2] ? R("win", `Già vinta: ${c} gol`) : R("", `${+m[2] + 1 - c === 1 ? "Manca" : "Mancano"} ${+m[2] + 1 - c} gol prima dell'intervallo`)) : under(c, +m[2], "gol");
  }
  if ((m = L.match(/^Over (\d+),5( punti)?$/))) return over(H + A, +m[1], unit);
  if ((m = L.match(/^Under (\d+),5( punti)?$/))) return under(H + A, +m[1], unit);
  if (L === "Goal, segnano entrambe") {
    if (H > 0 && A > 0) return R("win", `${end ? "Vinta" : "Già vinta"}, ${score}`);
    if (end) return R("lose", `Persa, ${score}`);
    return R("", H === 0 && A === 0 ? "Non ha ancora segnato nessuna delle due" : `Manca il gol di ${H === 0 ? sideName("home") : sideName("away")}`);
  }
  if (L === "No Goal") return H > 0 && A > 0 ? R("lose", `Persa: hanno segnato entrambe, ${score}`) : end ? R("win", `Vinta, ${score}`) : R("ok", `Per ora va bene, ${score}`);
  if ((m = L.match(/^Multigol (\d+)-(\d+)$/))) {
    const c = H + A, lo = +m[1], hi = +m[2];
    if (c > hi) return R("lose", `Persa: già ${c} gol`);
    if (end) return c >= lo ? R("win", `Vinta: ${c} gol`) : R("lose", `Persa: solo ${c} gol`);
    return c >= lo ? R("ok", `Per ora va bene: ${c} gol, il massimo è ${hi}`) : R("", `${lo - c === 1 ? "Manca" : "Mancano"} ${lo - c} gol, ora ${c}`);
  }
  if (L === "Pareggio") return outcome((h, a) => h === a);
  if (L === "Una delle due vince") return outcome((h, a) => h !== a);
  if (L === "Pareggio nel primo tempo" || (m = L.match(/^(.+) vince il primo tempo$/))) {
    const firstDone = end || info.period >= 2, h = info.half && firstDone ? info.half[0] : H, a = info.half && firstDone ? info.half[1] : A;
    if (L === "Pareggio nel primo tempo") return outcome((x, y) => x === y, h, a, firstDone);
    const side = sideOfText(m[1]); if (!side) return null;
    return outcome((x, y) => side === "home" ? x > y : y > x, h, a, firstDone);
  }
  if ((m = L.match(/^(.+) o pareggio$/))) { const side = sideOfText(m[1]); if (!side) return null; return outcome((h, a) => side === "home" ? h >= a : a >= h); }
  if ((m = L.match(/^(.+) vince$/))) {
    const side = sideOfText(m[1]); if (!side) return null;
    if (!end && H === A) return R("", `Per ora in parità, ${score}`);
    return outcome((h, a) => side === "home" ? h > a : a > h);
  }
  if ((m = L.match(/^(.+) segna$/))) {
    const p = info.players.get(normName(m[1]));
    if (!p) return info.players.size ? R(end ? "lose" : "", end ? "Persa: non ha segnato" : "Non ha ancora segnato") : null;
    return p.g > 0 ? R("win", `${end ? "Vinta" : "Già vinta"}: ${p.g === 1 ? "ha segnato" : `${p.g} gol`}`) : end ? R("lose", "Persa: non ha segnato") : R("", "Non ha ancora segnato");
  }
  if ((m = L.match(/^(.+) almeno (\d+) (punti|rimbalzi|assist|triple|P\+R\+A)$/))) {
    const key = { punti: "pts", rimbalzi: "reb", assist: "ast", triple: "tpm", "P+R+A": "pra" }[m[3]];
    const p = info.players.get(normName(m[1]));
    if (!p) return info.players.size ? R(end ? "lose" : "", end ? "Persa: non ha giocato" : "Non è ancora entrato") : null;
    const v = p[key], need = +m[2];
    return v >= need ? R("win", `${end ? "Vinta" : "Già vinta"}: ${v} ${m[3]}`) : end ? R("lose", `Persa: ${v} ${m[3]}`) : R("", `${need - v === 1 ? "Manca" : "Ne mancano"} ${need - v}, ora ${v}`);
  }
  if ((m = L.match(/^(.+) over (\d+),5$/))) { const side = sideOfText(m[1]); if (!side) return null; return over(side === "home" ? H : A, +m[2], "punti"); }
  if ((m = L.match(/^(.+) ([+-]\d+(?:,\d)?)$/))) {
    const side = sideOfText(m[1]); if (!side) return null;
    const hc = parseFloat(m[2].replace(",", "."));
    return outcome((h, a) => (side === "home" ? h - a : a - h) + hc > 0);
  }
  return R("", end ? `Finita, ${score}` : `In corso, ${score}`);
}

function statusChips(list, info) {
  if (!list.length) return "";
  return `<div class="live-slip">${list.map(f => {
    const s = pickStatus(f.label, info);
    return `<div class="ls ${s?.cls || ""}"><b>★ ${esc(f.label)}</b>${s ? `<span>${esc(s.txt)}</span>` : `<span>Si vede a fine partita</span>`}</div>`;
  }).join("")}</div>`;
}

/* ------------------------------------------------------------------ percentuali durante la partita */

function liveRings(info, ix) {
  if (info.state !== "in") return "";
  if (info.sport === "soccer") {
    const p = soccerLive(ix?.xg, info.H, info.A, minuteOf(info));
    return { rings: p.win.map((x, i) => `<span class="fx-ring">${ring(x, x === Math.max(...p.win))}<small>${["1", "X", "2"][i]}</small></span>`).join(""),
      sub: `Adesso Over 2,5 <b>${pct(p.over25)}</b>, Goal <b>${pct(p.btts)}</b>${ix ? `. Prima del via: ${ix.main.map(pct).join(" / ")}` : ""}` };
  }
  if (info.sport === "nba") {
    const p = info.winProb != null ? [info.winProb, 1 - info.winProb] : nbaLive(info.comp, ix?.exp_score ? ix.exp_score[0] - ix.exp_score[1] : 0, info.H, info.A);
    return { rings: p.map((x, i) => `<span class="fx-ring">${ring(x, x === Math.max(...p))}<small>${i ? "2" : "1"}</small></span>`).join(""),
      sub: ix ? `Prima del via: ${ix.main.map(pct).join(" / ")}` : "" };
  }
  return "";
}

function minuteOf(info) {
  const m = parseInt(String(info.clock || info.detail || "").replace(/[^\d+]/g, "").split("+")[0], 10);
  return isNaN(m) ? (info.period === 2 ? 60 : 20) : m;
}

/* ------------------------------------------------------------------ riquadro live nella scheda della partita */

let boxTimer = null;
async function attachLive(d) {
  clearTimeout(boxTimer);
  const tg = espnTarget(d.id), hash = location.hash;
  if (!tg) return;
  const start = new Date(d.date).getTime();
  if (Date.now() < start - 15 * 60e3) return;           // non ancora iniziata
  let box = document.getElementById("live-box");
  if (!box) { box = document.createElement("div"); box.id = "live-box"; $app.querySelector(".back")?.after(box); }
  let info = null, failed = false;
  try { info = await eventInfo(tg); } catch { failed = true; }
  if (location.hash !== hash) return;
  box = document.getElementById("live-box");
  if (!box) return;
  if (failed) box.innerHTML = `<div class="warn">Non riesco a leggere il risultato in diretta adesso. Riprovo tra poco; intanto usa i link in fondo alla scheda.</div>`;
  else if (info && info.state !== "pre") box.innerHTML = liveBox(info, d, scoreChanged(d.id, info));
  else box.innerHTML = "";
  if (failed || info?.state === "in" || (info?.state === "pre" && Date.now() > start - 15 * 60e3))
    boxTimer = later(() => { if (location.hash === hash) attachLive(d); }, info?.state === "in" ? LIVE_FAST : LIVE_SLOW);
}

function liveBox(info, d, flash = false) {
  const ix = INDEX.events.find(e => e.id === d.id);
  const on = info.state === "in";
  const head = `<div class="lb-head">${on ? `<span class="pulse"></span><b>In diretta</b>` : `<b>Finita</b>`}<small>${esc(on ? (info.sport === "soccer" ? info.clock || info.detail : info.detail) : "risultato finale")}</small></div>`;
  let score;
  if (info.sport === "tennis") {
    const row = (p, i) => `<div class="lb-tennis">${img(p.flag, "tflag")}<span>${esc(p.name)}</span>${info.sets[i].map((g, k) => `<b class="${(info.sets[1 - i][k] ?? 0) < g ? "w" : ""}">${g}</b>`).join("")}</div>`;
    score = `<div class="${flash ? "flash" : ""}">${row(info.home, 0) + row(info.away, 1)}</div>`;
  } else {
    score = `<div class="lb-score"><span>${esc(info.home.name)}</span><b class="${flash ? "flash" : ""}">${info.H}<i>-</i>${info.A}</b><span>${esc(info.away.name)}</span></div>`;
  }
  const lr = liveRings(info, ix);
  const probs = lr ? `<div class="live-probs">${lr.rings ? `<div class="fx-rings">${lr.rings}</div>` : ""}${lr.sub ? `<div class="live-sub">${lr.sub}</div>` : ""}</div>` : "";
  const mine = favs().filter(f => f.event === d.id);
  const slip = mine.length ? `<h3 class="lb-h3">Le tue giocate su questa partita</h3>${statusChips(mine, info)}` : "";
  return `<section class="sec live-box">${head}${score}${probs}${slip}</section>` + liveDetails(info, d);
}

/* ------------------------------------------------------------------ cronaca e statistiche in diretta */

const EV_ICON = { goal: "⚽", own: "⚽", pen: "⚽", miss: "✕", yellow: "🟨", red: "🟥", sub: "🔁", var: "📺" };
function evKind(t) {
  if (/own-goal/.test(t)) return "own";
  if (/penalty---missed|penalty---saved/.test(t)) return "miss";
  if (/penalty/.test(t)) return "pen";
  if (/goal/.test(t)) return "goal";
  if (/red/.test(t)) return "red";
  if (/yellow/.test(t)) return "yellow";
  if (/substitution/.test(t)) return "sub";
  if (/var/.test(t)) return "var";
  if (/halftime/.test(t)) return "ht";
  if (/end-regular-time|end-extra-time|full-time/.test(t)) return "end";
  return null;
}
function soccerTimeline(info) {
  const rows = (info.events || []).map(e => ({ ...e, k: evKind(e.type) })).filter(e => e.k).reverse();
  if (!rows.length) return "";
  const txt = e => {
    const [a, b] = e.who;
    if (e.k === "goal") return `<b>${esc(a || "Gol")}</b>${e.type.includes("header") ? " <i>di testa</i>" : ""}${b ? `<small>assist ${esc(b)}</small>` : ""}`;
    if (e.k === "pen") return `<b>${esc(a || "Gol")}</b> <i>su rigore</i>`;
    if (e.k === "own") return `<b>${esc(a || "Autogol")}</b> <i>autogol</i>`;
    if (e.k === "miss") return `<b>${esc(a || "")}</b> <i>rigore sbagliato</i>`;
    if (e.k === "yellow") return `<b>${esc(a || "")}</b> <i>ammonito</i>`;
    if (e.k === "red") return `<b>${esc(a || "")}</b> <i>espulso</i>`;
    if (e.k === "sub") return `<span class="in">↑ ${esc(a || "")}</span><span class="out">↓ ${esc(b || "")}</span>`;
    if (e.k === "var") return `<i>controllo VAR</i>`;
    return "";
  };
  const html = rows.map(e => {
    if (e.k === "ht" || e.k === "end") return `<div class="tl-sep">${e.k === "ht" ? "Intervallo" : "Fine partita"}</div>`;
    const cell = `<div class="tl-ev tl-${e.k}"><span class="tl-ic">${EV_ICON[e.k]}</span><span class="tl-tx">${txt(e)}</span></div>`;
    return `<div class="tl-row"><div class="tl-h">${e.side === "home" ? cell : ""}</div><div class="tl-min">${esc(e.clock)}</div><div class="tl-a">${e.side === "away" ? cell : ""}</div></div>`;
  }).join("");
  return sec("Cronaca", `<div class="timeline">${html}</div>`, "la più recente in alto", "Cronaca live");
}

const SOCCER_STATS = [
  ["possessionPct", "Possesso palla", v => `${Math.round(v)}%`],
  ["totalShots", "Tiri"], ["shotsOnTarget", "Tiri in porta"], ["wonCorners", "Calci d'angolo"],
  ["saves", "Parate"], ["foulsCommitted", "Falli"], ["yellowCards", "Ammonizioni"], ["redCards", "Espulsioni"],
  ["offsides", "Fuorigioco"], ["totalPasses", "Passaggi"], ["accuratePasses", "Passaggi riusciti"],
  ["totalTackles", "Contrasti"], ["interceptions", "Intercetti"], ["totalCrosses", "Cross"],
];
const NBA_STATS = [
  ["fieldGoalsMade-fieldGoalsAttempted", "Tiri dal campo", null, "fieldGoalPct"],
  ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "Triple", null, "threePointFieldGoalPct"],
  ["freeThrowsMade-freeThrowsAttempted", "Tiri liberi", null, "freeThrowPct"],
  ["totalRebounds", "Rimbalzi"], ["offensiveRebounds", "Rimbalzi offensivi"], ["assists", "Assist"],
  ["turnovers", "Palle perse"], ["steals", "Recuperi"], ["blocks", "Stoppate"],
  ["pointsInPaint", "Punti in area"], ["fastBreakPoints", "Punti in contropiede"], ["largestLead", "Vantaggio massimo"],
];
function liveStats(info, cH, cA) {
  const S = info.rawStats || {};
  if (!S.home || !S.away) return "";
  const list = info.sport === "soccer" ? SOCCER_STATS : NBA_STATS;
  const rows = list.filter(([k]) => S.home[k] != null && S.away[k] != null).map(([k, label, fmt, pctKey]) => {
    const raw = [S.home[k], S.away[k]];
    const val = raw.map(v => statNum(String(v).split("-")[0]));   // "37-84": conta i realizzati
    const show = raw.map((v, i) => fmt ? fmt(statNum(v)) : pctKey ? `${v} <small>${Math.round(statNum(S[i ? "away" : "home"][pctKey]))}%</small>` : esc(String(v)));
    const tot = val[0] + val[1], w = tot ? val[0] / tot * 100 : 50;
    return `<div class="st-row"><div class="st-top"><b class="${val[0] > val[1] ? "lead" : ""}">${show[0]}</b><span>${esc(label)}</span><b class="${val[1] > val[0] ? "lead" : ""}">${show[1]}</b></div>
      <div class="st-bar"><span style="width:${w}%;background:${cH}"></span><span style="width:${100 - w}%;background:${cA}"></span></div></div>`;
  }).join("");
  return rows ? sec("Statistiche", `<div class="st-head">${tpill(info.home.name, cH)}${tpill(info.away.name, cA)}</div>${rows}`, info.state === "in" ? "in diretta" : "finale", "Statistiche live") : "";
}
function nbaPeriods(info, cH, cA) {
  const [h, a] = info.periods || [];
  if (!h?.length || !a?.length) return "";
  const lab = i => i < 4 ? `${i + 1}°` : `S${i - 3}`;
  return sec("Punteggio per quarto", `<table class="vs-table q-table"><tr><th></th>${h.map((_, i) => `<th>${lab(i)}</th>`).join("")}<th>Tot</th></tr>
    <tr><td>${tpill(info.home.name, cH)}</td>${h.map((v, i) => `<td class="${v > (a[i] ?? 0) ? "best" : ""}">${v}</td>`).join("")}<td><b>${info.H}</b></td></tr>
    <tr><td>${tpill(info.away.name, cA)}</td>${a.map((v, i) => `<td class="${v > (h[i] ?? 0) ? "best" : ""}">${v}</td>`).join("")}<td><b>${info.A}</b></td></tr></table>`, "", "Quarti live");
}
function nbaPlays(info) {
  if (!info.plays?.length) return "";
  const row = p => `<div class="r ${p.scoring ? "scoring" : ""}"><span class="l"><span class="faint">${p.q ? `${p.q}° ` : ""}${esc(p.clock)}</span> ${esc(p.text)}</span><span class="v num">${esc(p.score)}</span></div>`;
  const top = info.plays.slice(0, 8), rest = info.plays.slice(8);
  return sec("Ultime azioni", `<div class="rows plays">${top.map(row).join("")}</div>${rest.length ? `<details class="more"><summary>Altre ${rest.length}</summary><div class="rows plays">${rest.map(row).join("")}</div></details>` : ""}
    <p class="note">Descrizioni in inglese, come le scrive ESPN. Il punteggio è casa-ospite.</p>`, "le più recenti in alto", "Azioni live");
}
function liveDetails(info, d) {
  if (info.sport === "tennis") return "";
  const [cH, cA] = teamColors(d.home, d.away);
  if (info.sport === "soccer") return soccerTimeline(info) + liveStats(info, cH, cA);
  return nbaPeriods(info, cH, cA) + liveStats(info, cH, cA) + nbaPlays(info);
}

/* ------------------------------------------------------------------ esito delle giocate nella schedina */

let slipTimer = null;
async function attachSlipStatus() {
  clearTimeout(slipTimer);
  const now = Date.now(), hash = location.hash;
  const started = favs().filter(f => { const t = new Date(f.date).getTime(); return !f.result && t <= now && now - t < 4 * 864e5; });
  const ids = [...new Set(started.map(f => f.event))].slice(0, 12);
  if (!ids.length) return;
  const tennisBoards = {};
  const infos = {};
  await Promise.allSettled(ids.map(async id => {
    const tg = espnTarget(id); if (!tg) return;
    if (tg.sport === "tennis") {
      tennisBoards[tg.league] ??= espnBoard("tennis", tg.league);
      infos[id] = tennisInfo(tg, await tennisBoards[tg.league]);
    } else infos[id] = await eventInfo(tg);
  }));
  if (location.hash !== hash) return;
  let anyLive = false;
  const closed = new Map();   // giocate con esito ormai deciso: restano nello storico
  document.querySelectorAll("[data-slip-event]").forEach(el => {
    const info = infos[el.dataset.slipEvent];
    if (!info) return;
    if (info.state === "in") anyLive = true;
    const s = pickStatus(el.dataset.slipLabel, info);
    el.innerHTML = s ? `<span class="ls-dot ${s.cls}"></span>${info.state === "in" ? "<b>Live</b> " : ""}${esc(s.txt)}` : "";
    el.className = `slip-live ${s?.cls || ""}`;
    if (s && (s.cls === "win" || s.cls === "lose")) closed.set(`${el.dataset.slipEvent}|${el.dataset.slipLabel}`, s);
  });
  if (closed.size) {
    const list = favs();
    let changed = false;
    for (const f of list) {
      const s = closed.get(f.key);
      if (s && !f.result) { f.result = s.cls; f.result_txt = s.txt; f.closed = new Date().toISOString(); changed = true; }
    }
    if (changed) { saveFavs(list); if (location.hash.startsWith("#/schedina")) { showSlip(); return; } }
  }
  if (anyLive) slipTimer = later(() => { if (location.hash === hash) attachSlipStatus(); }, LIVE_FAST);
}

/* ------------------------------------------------------------------ pagina Live */

async function loadLive() {
  const today = new Set(INDEX.events.filter(e => Math.abs(new Date(e.date) - Date.now()) < 20 * 3600e3).map(e => e.league));
  const jobs = [];
  for (const [k, code] of Object.entries(ESPN_CODE)) if (today.has(k))
    jobs.push(espnBoard("soccer", code).then(evs => evs.map(ev => ({ id: `calcio-${k}-${ev.id}`, league: k, info: infoFromComp(ev.competitions?.[0], "soccer", ev.status) }))));
  if (today.has("nba")) jobs.push(espnBoard("basketball", "nba").then(evs => evs.map(ev => ({ id: `basket-nba-${ev.id}`, league: "nba", info: infoFromComp(ev.competitions?.[0], "nba", ev.status) }))));
  for (const t of ["atp", "wta"]) if (today.has(t)) jobs.push(espnBoard("tennis", t).then(evs => {
    const slug = t === "atp" ? "mens-singles" : "womens-singles", out = [];
    for (const ev of evs) for (const g of ev.groupings || []) if (g.grouping?.slug === slug)
      for (const c of g.competitions || []) if (c.status?.type?.state === "in") out.push({ id: `tennis-${t}-${c.id}`, league: t, info: tennisInfo({ id: String(c.id) }, [ev]) });
    return out;
  }));
  const res = await Promise.allSettled(jobs);
  return { events: res.flatMap(r => r.status === "fulfilled" ? r.value.filter(x => x.info) : []), failed: res.filter(r => r.status === "rejected").length, total: jobs.length };
}

async function showLive() {
  clearTimeout(liveTimer);
  if (!$app.querySelector(".live-page")) $app.innerHTML = `<div class="live-page"><p class="muted" style="padding:20px 4px">Carico le partite in corso…</p></div>`;
  let data;
  try { data = await loadLive(); } catch { data = { events: [], failed: 1, total: 1 }; }
  if (!location.hash.startsWith("#/live")) return;
  const byKey = Object.fromEntries(INDEX.events.map(e => [e.id, e]));
  const live = data.events.filter(e => e.info.state === "in");
  const done = data.events.filter(e => e.info.state === "post" && Date.now() - new Date(e.info.comp?.date || byKey[e.id]?.date || 0) < 6 * 3600e3);
  const soon = INDEX.events.filter(e => { const t = new Date(e.date) - Date.now(); return t > 0 && t < 3 * 3600e3; });

  const card = e => {
    const ix = byKey[e.id], info = e.info;
    const fl = info.state === "in" && scoreChanged(e.id, info) ? "flash" : "";
    const href = ix ? `#/e/${encodeURIComponent(ix.id)}` : "#/live";
    const mine = statusChips(favs().filter(f => f.event === e.id), info);
    if (info.sport === "tennis") {
      const row = (p, i) => `<div>${img(p.flag, "tflag")}<span>${esc(p.name)}</span><b>${info.sets[i].join(" ")}</b></div>`;
      return `<a class="live-row" href="${href}"><div class="live-main"><div class="live-min on">${esc(info.detail || "Live")}</div>
        <div class="live-teams ${fl}">${row(info.home, 0)}${row(info.away, 1)}</div></div>${mine}</a>`;
    }
    const lr = liveRings(info, ix);
    const min = info.state === "in" ? (info.sport === "soccer" ? (info.clock || info.detail) : info.detail) : "Finale";
    return `<a class="live-row" href="${href}"><div class="live-main"><div class="live-min ${info.state === "in" ? "on" : ""}">${esc(min)}</div>
      <div class="live-teams ${fl}"><div>${teamMark(ix?.home_logo || info.home.logo, null, ix?.home_color)}<span>${esc(info.home.name)}</span><b>${info.H}</b></div>
      <div>${teamMark(ix?.away_logo || info.away.logo, null, ix?.away_color)}<span>${esc(info.away.name)}</span><b>${info.A}</b></div></div></div>
      ${lr ? `<div class="live-probs">${lr.rings ? `<div class="fx-rings">${lr.rings}</div>` : ""}${lr.sub ? `<div class="live-sub">${lr.sub}</div>` : ""}</div>` : ""}${mine}</a>`;
  };

  const groups = list => {
    const m = new Map();
    for (const e of list) {
      const g = e.info.sport === "tennis" ? `${e.league.toUpperCase()} – ${e.info.tournament || ""}` : (byKey[e.id]?.league_name || leagueLabel(e.league));
      if (!m.has(g)) m.set(g, []); m.get(g).push(e);
    }
    return [...m].map(([g, l]) => `<section class="group"><div class="group-h static"><span class="group-dot g-${l[0].info.sport}"></span><b>${esc(g)}</b><small>${l.length}</small></div>${l.map(card).join("")}</section>`).join("");
  };

  let html = `<div class="live-page"><div class="live-head"><span class="pulse"></span><b>${live.length ? `${live.length} ${live.length === 1 ? "partita" : "partite"} in corso` : "Nessuna partita in corso"}</b>
    <small>${live.length ? "si aggiorna ogni pochi secondi" : "si aggiorna ogni 30 secondi"}</small></div>`;
  if (data.failed && data.failed === data.total) html += `<div class="warn">Non riesco a leggere i risultati in diretta in questo momento. Riprovo tra poco; intanto puoi usare Diretta.it o SofaScore dalla scheda della partita.</div>`;
  if (live.length) html += groups(live);
  if (done.length) html += `<h2 class="day">Finite da poco</h2>` + groups(done);
  if (!live.length && soon.length) html += `<h2 class="day">Tra poco</h2>` + soon.slice(0, 15).map(e => `<section class="group">${fixture(e)}</section>`).join("");
  if (!live.length && !done.length && !soon.length) html += `<div class="empty"><b>Niente in diretta adesso</b>Le partite compaiono qui appena iniziano.</div>`;
  html += `<p class="note">Sotto ogni partita vedi come stanno andando le giocate che hai salvato nella schedina. Tocca una partita per il risultato aggiornato e i dettagli.</p>
    <p class="note">Durante le partite di calcio le percentuali ripartono dal risultato del momento e dai gol attesi del modello per il tempo che resta. Nell'NBA uso la probabilità in diretta di ESPN quando c'è. Sono stime: un gol o un canestro le cambia subito.</p></div>`;
  $app.innerHTML = html;
  liveTimer = later(() => { if (location.hash.startsWith("#/live")) showLive(); }, live.length ? LIVE_FAST : LIVE_SLOW);
}

function leagueLabel(k) {
  for (const list of Object.values(LEAGUES)) for (const [key, l] of list) if (key === k) return l;
  return k === "nba" ? "NBA" : k;
}

window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#/live")) clearTimeout(liveTimer);
  clearTimeout(boxTimer); clearTimeout(slipTimer); clearTimeout(lineupTimer);
});
/* tornando sull'app (o quando torna la rete) i risultati si aggiornano subito, senza aspettare il prossimo giro */
function resume() {
  if (document.hidden) return;
  const fns = [...pending]; pending.clear();
  fns.forEach(fn => fn());
}
document.addEventListener("visibilitychange", resume);
window.addEventListener("online", () => { if (location.hash.startsWith("#/live")) showLive(); else resume(); });
