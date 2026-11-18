"use strict";
/* Pronostici — sezione Live e collegamenti "Segui in diretta" / "Dove vederla".
   I risultati in diretta arrivano da ESPN direttamente dal telefono mentre la pagina è aperta:
   ogni pochi secondi se c'è una partita in corso, ogni 30 secondi altrimenti. Con l'app in secondo piano si ferma.
   Usa funzioni e dati di app.js (INDEX, esc, pct, ring, fmtTime, favs...). */

const ESPN_SITE = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_CODE = {
  "serie-a": "ita.1", "premier-league": "eng.1", "la-liga": "esp.1", "bundesliga": "ger.1", "ligue-1": "fra.1",
  "serie-b": "ita.2", "championship": "eng.2", "eredivisie": "ned.1", "super-lig": "tur.1", "scozia": "sco.1", "belgio": "bel.1",
  "primeira-liga": "por.1", "j1": "jpn.1", "mls": "usa.1", "eliteserien": "nor.1", "brasileirao": "bra.1", "argentina": "arg.1",
  "champions": "uefa.champions", "europa-league": "uefa.europa", "conference": "uefa.europa.conf",
  "champions-femminile": "uefa.wchampions",
  "nations-league": "uefa.nations", "mondiali": "fifa.world", "europei": "uefa.euro", "qual-europei": "uefa.euroq",
  "qual-mondiali": "fifa.worldq.uefa", "qual-mondiali-sudamerica": "fifa.worldq.conmebol", "qual-mondiali-concacaf": "fifa.worldq.concacaf",
  "qual-mondiali-asia": "fifa.worldq.afc", "qual-mondiali-africa": "fifa.worldq.caf", "copa-america": "conmebol.america",
  "coppa-africa": "caf.nations", "qual-coppa-africa": "caf.nations_qual", "coppa-asia": "afc.asian.cup", "gold-cup": "concacaf.gold",
  "concacaf-nations": "concacaf.nations.league", "amichevoli": "fifa.friendly",
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
  labchannel: ["LaB Channel", "https://www.primevideo.com/"],
  supertennis: ["SuperTennis, gratis con registrazione", "https://plus.supertennis.tv/benvenuto"],
  rai: ["Rai 1 e RaiPlay, in chiaro", "https://www.raiplay.it/dirette/rai1"],
};
const WHERE = {
  "nations-league": { tv: ["rai", "sky", "now"], note: "L'Italia in chiaro su Rai 1 e RaiPlay; le altre partite su Sky e NOW (stagione 2026/27)." },
  "amichevoli": { tv: ["rai"], note: "Le amichevoli dell'Italia sono in chiaro su Rai 1 e RaiPlay; per le altre nazionali controlla il palinsesto." },
  "qual-europei": { tv: ["rai", "sky", "now"], note: "L'Italia in chiaro sulla Rai; controlla il palinsesto per le altre partite." },
  "qual-mondiali": { tv: ["rai", "sky", "now"], note: "L'Italia in chiaro sulla Rai; controlla il palinsesto per le altre partite." },
  "serie-a": { tv: ["dazn", "sky", "now"], note: "DAZN tutte le partite, Sky e NOW tre per giornata. Qualche partita all'anno è gratis su DAZN." },
  "champions": { tv: ["sky", "now", "prime", "tv8"], note: "Quasi tutte su Sky e NOW, la migliore del mercoledì su Prime Video. Alcune sfide tra club stranieri sono in chiaro su TV8." },
  "europa-league": { tv: ["sky", "now"] },
  "conference": { tv: ["sky", "now"] },
  "premier-league": { tv: ["sky", "now"] },
  "bundesliga": { tv: ["sky", "now"] },
  "la-liga": { tv: ["dazn"] },
  "serie-b": { tv: ["dazn", "labchannel"], note: "DAZN tutte le partite; tutte anche sul LaB Channel della Lega B (canale aggiuntivo su Prime Video o OneFootball)." },
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
/* ------------------------------------------------------------------ probabilità adesso, per qualsiasi giocata
   Calcio: gol che restano con Poisson sul tempo che manca, sommati al risultato attuale.
   Basket: margine e punti totali con una normale che si stringe man mano che il tempo passa.
   Tennis: catena di Markov game per game dal punteggio di set e game (chi serve non lo sappiamo: media dei due casi). */

function soccerDist(xg, hs, as, minute) {
  const rem = Math.max(0, (95 - Math.min(minute, 95)) / 92);
  const lh = (xg?.[0] ?? 1.35) * rem, la = (xg?.[1] ?? 1.1) * rem;
  const out = []; let s = 0;
  for (let i = 0; i <= 9; i++) for (let j = 0; j <= 9; j++) { const p = poisson(lh, i) * poisson(la, j); s += p; out.push([hs + i, as + j, p]); }
  out.forEach(x => x[2] /= s);
  return { cells: out, lh, la };
}
const soccerP = (dist, f) => dist.cells.reduce((a, [h, a2, p]) => a + (f(h, a2) ? p : 0), 0);

function nbaFrac(info) {
  const st = info.comp?.status || {};
  const period = st.period || info.period || 1, clock = st.clock ?? 720;
  const remMin = period > 4 ? Math.max(0, clock / 60) : Math.max(0, (4 - period) * 12 + clock / 60);
  return Math.max(remMin / 48, 0.002);
}
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

function tHold(p) { const q = 1 - p; return p ** 4 * (1 + 4 * q + 10 * q * q) + 20 * p ** 3 * q ** 3 * (p * p / (p * p + q * q)); }
function tTiebreak(pa, pb) {
  const q = (pa + 1 - pb) / 2, memo = new Map();
  const f = (i, j) => {
    if (i >= 7 && i - j >= 2) return 1; if (j >= 7 && j - i >= 2) return 0;
    if (i >= 6 && j >= 6 && i === j) return q * q / (q * q + (1 - q) * (1 - q));
    const k = i * 40 + j; if (memo.has(k)) return memo.get(k);
    const v = q * f(i + 1, j) + (1 - q) * f(i, j + 1); memo.set(k, v); return v;
  };
  return f(0, 0);
}
function tSetWin(pa, pb, gi, gj) {          // A vince il set dai game gi-gj (media su chi serve adesso)
  const hA = tHold(pa), hB = tHold(pb), tb = tTiebreak(pa, pb), memo = new Map();
  const f = (i, j, s) => {
    if (i >= 6 && i - j >= 2) return 1; if (j >= 6 && j - i >= 2) return 0;
    if (i === 7) return 1; if (j === 7) return 0;
    if (i === 6 && j === 6) return tb;
    const k = (i * 8 + j) * 2 + s; if (memo.has(k)) return memo.get(k);
    const g = s === 0 ? hA : 1 - hB;
    const v = g * f(i + 1, j, 1 - s) + (1 - g) * f(i, j + 1, 1 - s); memo.set(k, v); return v;
  };
  return (f(gi, gj, 0) + f(gi, gj, 1)) / 2;
}
function tMatchWin(pa, pb, bo, sa = 0, sb = 0, gi = 0, gj = 0) {
  const need = bo === 5 ? 3 : 2, ps = tSetWin(pa, pb, 0, 0);
  const M = (a, b) => a >= need ? 1 : b >= need ? 0 : ps * M(a + 1, b) + (1 - ps) * M(a, b + 1);
  if (sa >= need) return 1; if (sb >= need) return 0;
  const pc = gi || gj ? tSetWin(pa, pb, gi, gj) : ps;
  return pc * M(sa + 1, sb) + (1 - pc) * M(sa, sb + 1);
}
/* punti vinti al servizio dei due giocatori, ricavati dalla probabilità di vittoria prima del via */
const SP_CACHE = new Map();
function tennisServe(pWin, league, bo) {
  const key = `${pWin}|${league}|${bo}`;
  if (SP_CACHE.has(key)) return SP_CACHE.get(key);
  const p0 = league === "wta" ? 0.56 : 0.64;
  let lo = -0.25, hi = 0.25;
  for (let k = 0; k < 25; k++) { const mid = (lo + hi) / 2; if (tMatchWin(p0 + mid, p0 - mid, bo) < pWin) lo = mid; else hi = mid; }
  const d = (lo + hi) / 2, sp = [p0 + d, p0 - d];
  SP_CACHE.set(key, sp); return sp;
}
function tennisLive(info, ix, bo = 3) {
  const pre = ix?.main?.[0];
  if (pre == null || !info.sets) return null;
  if (info.state === "post") return info.winner === 0 ? [1, 0] : info.winner === 1 ? [0, 1] : null;
  const league = ix.league || "atp", [pa, pb] = tennisServe(pre, league, bo);
  const n = Math.max(info.sets[0].length, info.sets[1].length), done = (info.won?.[0] || 0) + (info.won?.[1] || 0);
  const gi = n > done ? info.sets[0][n - 1] || 0 : 0, gj = n > done ? info.sets[1][n - 1] || 0 : 0;
  const p = tMatchWin(pa, pb, bo, info.won?.[0] || 0, info.won?.[1] || 0, gi, gj);
  return [p, 1 - p];
}

function sideIn(info, txt) {
  const k = normName(txt);
  const hit = side => (info[side]?.keys || [normName(info[side]?.name)]).some(x => x && (x === k || k.startsWith(x + " ") || x.startsWith(k)));
  return hit("home") ? "home" : hit("away") ? "away" : null;
}
/* giocata del calcio decisa dal risultato finale -> funzione (gol casa, gol ospiti) -> presa? */
function scorePred(L, info) {
  const SIGN = { "1": (h, a) => h > a, "X": (h, a) => h === a, "2": (h, a) => a > h, "1X": (h, a) => h >= a, "X2": (h, a) => a >= h, "12": (h, a) => h !== a };
  if (SIGN[L]) return SIGN[L];
  let m;
  if (L.includes(" + ")) {
    const fs = L.split(" + ").map(x => scorePred(x.trim(), info));
    return fs.every(Boolean) ? (h, a) => fs.every(f => f(h, a)) : null;
  }
  if ((m = L.match(/^(Over|Under) (\d+),5$/))) return m[1] === "Over" ? (h, a) => h + a > +m[2] : (h, a) => h + a <= +m[2];
  if (L === "Goal" || L === "Goal, segnano entrambe") return (h, a) => h > 0 && a > 0;
  if (L === "No Goal") return (h, a) => !(h > 0 && a > 0);
  if ((m = L.match(/^Multigol (\d+)-(\d+)$/))) return (h, a) => h + a >= +m[1] && h + a <= +m[2];
  if (L === "Pareggio") return (h, a) => h === a;
  if (L === "Una delle due vince") return (h, a) => h !== a;
  if ((m = L.match(/^(\d+)-(\d+)$/))) return (h, a) => h === +m[1] && a === +m[2];
  if ((m = L.match(/^(.+) o pareggio$/))) { const s = sideIn(info, m[1]); return s ? (h, a) => s === "home" ? h >= a : a >= h : null; }
  if ((m = L.match(/^(.+) vince$/))) { const s = sideIn(info, m[1]); return s ? (h, a) => s === "home" ? h > a : a > h : null; }
  if ((m = L.match(/^(.+) non subisce gol$/))) { const s = sideIn(info, m[1]); return s ? (h, a) => s === "home" ? a === 0 : h === 0 : null; }
  if ((m = L.match(/^(.+) ([+-]\d+(?:,\d)?)$/))) {
    const s = sideIn(info, m[1]); if (!s) return null;
    const hc = parseFloat(m[2].replace(",", "."));
    return (h, a) => (s === "home" ? h - a : a - h) + hc > 0;
  }
  return null;
}

/* probabilità adesso che una giocata passi (null se non sappiamo stimarla) */
function liveChance(L, info, ix) {
  if (!info || info.state !== "in" || !ix) return null;
  let m;
  if (info.sport === "soccer") {
    const f = scorePred(L, info);
    if (!f || !ix.xg) return null;
    return soccerP(soccerDist(ix.xg, info.H, info.A, minuteOf(info)), f);
  }
  if (info.sport === "nba") {
    const ex = ix.exp_score || [112, 112], frac = nbaFrac(info);
    const marginMu = (info.H - info.A) + (ex[0] - ex[1]) * frac, marginSd = 13 * Math.sqrt(frac);
    if ((m = L.match(/^(.+) vince$/))) {
      const s = sideIn(info, m[1]); if (!s) return null;
      const p = nbaLive(info.comp, ex[0] - ex[1], info.H, info.A)[0];
      return s === "home" ? p : 1 - p;
    }
    if ((m = L.match(/^(Over|Under) (\d+),5( punti)?$/))) {
      const mu = info.H + info.A + (ex[0] + ex[1]) * frac, sd = 18 * Math.sqrt(frac);
      const pOver = 1 - normCdf((+m[2] + 0.5 - mu) / sd);
      return m[1] === "Over" ? pOver : 1 - pOver;
    }
    if ((m = L.match(/^(.+) ([+-]\d+(?:,\d)?)$/))) {
      const s = sideIn(info, m[1]); if (!s) return null;
      const hc = parseFloat(m[2].replace(",", "."));
      const pHome = 1 - normCdf((-hc - marginMu) / marginSd);          // casa: margine + hc > 0
      return s === "home" ? pHome : normCdf((hc - marginMu) / marginSd); // ospiti: -margine + hc > 0
    }
    return null;
  }
  if (info.sport === "tennis" && (m = L.match(/^(.+) vince$/))) {
    const s = sideIn(info, m[1]); if (!s) return null;
    const p = tennisLive(info, ix);
    return p ? p[s === "home" ? 0 : 1] : null;
  }
  return null;
}
const chanceTag = p => p == null ? "" : `<span class="lv-ch ${p >= .6 ? "hi" : p < .3 ? "lo" : ""}" title="Stima del modello adesso">ora ${pct(p)}</span>`;

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
    const tb = ps.map(p => (p.linescores || []).map(x => x.tiebreak ?? null));
    const setWin = (ps[0].linescores || []).map((x, k) => x.winner ? 0 : ps[1].linescores?.[k]?.winner ? 1 : null);
    let won = [0, 0];
    sets[0].forEach((g, i) => { const o = sets[1][i] ?? 0; const done = ty.state === "post" || i < sets[0].length - 1; if (done && g !== o) won[g > o ? 0 : 1]++; });
    return { sport: "tennis", state: ty.state || "pre", detail: ty.shortDetail || "", tournament: ev.name, sets, won, tb, setWin,
      period: c.status?.period || sets[0].length, round: c.round?.displayName || "", note: (c.notes || [])[0]?.text || "",
      winner: ps[0].winner ? 0 : ps[1].winner ? 1 : null, H: won[0], A: won[1],
      games: sets[0].reduce((a, b) => a + b, 0) + sets[1].reduce((a, b) => a + b, 0),
      home: { name: ps[0].athlete?.displayName, flag: ps[0].athlete?.flag?.href, keys: [normName(ps[0].athlete?.displayName)] },
      away: { name: ps[1].athlete?.displayName, flag: ps[1].athlete?.flag?.href, keys: [normName(ps[1].athlete?.displayName)] },
      players: new Map() };
  }
  return null;
}

/* tabellone dei set: una colonna per set, il set in corso evidenziato, tie-break in piccolo */
function tennisBoard(info, compact = false) {
  const n = Math.max(info.sets[0].length, info.sets[1].length, 1);
  const cur = info.state === "in" ? Math.min(info.period || n, n) - 1 : -1;
  // intestazione: ogni colonna dice di che set è; quella del set in corso dice anche "ora"; l'ultima conta i set vinti
  const head = `<div class="tb-row tb-head"><i></i><span></span>${Array.from({ length: n }, (_, k) =>
    `<i class="${k === cur ? "cur" : ""}">${k + 1}° set${k === cur ? "<small>ora</small>" : ""}</i>`).join("")}<i class="tb-tot">Set<small>vinti</small></i></div>`;
  const row = (p, i) => {
    const cells = Array.from({ length: n }, (_, k) => {
      const g = info.sets[i][k], t = info.tb?.[i]?.[k];
      const w = info.setWin?.[k] === i, l = info.setWin?.[k] === 1 - i;
      return `<b class="${k === cur ? "cur" : w ? "w" : l ? "l" : ""}">${g ?? ""}${t != null && k !== cur ? `<sup>${t}</sup>` : ""}</b>`;
    }).join("");
    const lead = info.winner === i;
    return `<div class="tb-row ${lead ? "winner" : ""}"><i class="tb-fl">${img(p.flag, "tflag")}</i><span>${esc(compact ? lastName(p.name) : p.name)}${lead ? " ✓" : ""}</span>${cells}<b class="tb-tot">${info.won[i]}</b></div>`;
  };
  // a parole, sotto il tabellone: com'è finito ogni set e a quanto sta quello in corso
  let say = "";
  if (!compact) {
    const nm = [lastName(info.home.name), lastName(info.away.name)];
    const lines = [];
    for (let k = 0; k < n; k++) {
      const a = info.sets[0][k], b = info.sets[1][k];
      if (a == null && b == null) continue;
      if (k === cur) {
        lines.push(`<div class="tb-say cur"><span>${k + 1}° set, in corso</span><b>${esc(nm[0])} ${a ?? 0} – ${b ?? 0} ${esc(nm[1])}</b><small>game</small></div>`);
      } else {
        const w = info.setWin?.[k] ?? (a > b ? 0 : b > a ? 1 : null);
        if (w == null) continue;
        const t = info.tb?.[0]?.[k] != null || info.tb?.[1]?.[k] != null ? ` (tie-break ${info.tb?.[0]?.[k] ?? 0}-${info.tb?.[1]?.[k] ?? 0})` : "";
        lines.push(`<div class="tb-say"><span>${k + 1}° set</span><b>vinto da ${esc(nm[w])} ${w === 0 ? `${a}-${b}` : `${b}-${a}`}${t}</b></div>`);
      }
    }
    if (lines.length) say = `<div class="tb-says">${lines.join("")}</div>`;
  }
  return `<div class="tboard ${compact ? "compact" : ""}" style="--n:${n}">${compact ? "" : head}${row(info.home, 0)}${row(info.away, 1)}${say}</div>`;
}

/* cronaca del tennis, game per game. La registra il Worker ogni minuto per tutti gli incontri in corso
   (/api/live/<id>), così è completa anche se l'app era chiusa; qui si aggiungono i game visti nel frattempo. */
const TL_CACHE = {};
function tennisLogFetch(id) {
  const c = TL_CACHE[id];
  if (c && (c.busy || Date.now() - c.ts < 20000)) return;
  TL_CACHE[id] = { ...(c || {}), busy: true, ts: Date.now() };
  fetch(`/api/live/${encodeURIComponent(id)}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => {
    TL_CACHE[id] = { log: j?.log || c?.log || [], sets: j?.sets || null, ts: Date.now() };
    const box = document.getElementById("tlog-" + id);
    if (box && box.__info) box.innerHTML = tennisLogHtml(id, box.__info);
  }).catch(() => { TL_CACHE[id] = { ...(c || {}), ts: Date.now() }; });
}
/* set per set: i game in ordine, ciascuno colorato per chi l'ha vinto */
function tennisSets(log, info) {
  const sets = [];
  const at = k => (sets[k] ||= { games: [], pre: null, gap: 0 });
  for (const e of log) {
    const s = at(e.k);
    if (e.pre) s.pre = e.g;
    else if (e.fix) s.games = s.games.filter(x => x.g[0] <= e.g[0] && x.g[1] <= e.g[1]);
    else s.games.push({ g: e.g, w: e.w, n: e.n });
  }
  if (!log.length) {     // cronaca non (ancora) registrata: i game già giocati restano un blocco unico
    info.sets[0].forEach((a1, k) => { const b1 = info.sets[1][k] ?? 0; if (a1 + b1) at(k).pre = [a1, b1]; });
    return sets;
  }
  // game visti dal telefono dopo l'ultimo controllo del Worker
  info.sets[0].forEach((a1, k) => {
    const b1 = info.sets[1][k] ?? 0, s = at(k);
    const last = s.games.length ? s.games[s.games.length - 1].g : s.pre || [0, 0];
    const da = a1 - last[0], db = b1 - last[1];
    if (da < 0 || db < 0 || da + db === 0) return;
    if (da && db) s.games.push({ g: [a1, b1], w: null, n: da + db });
    else for (let i = 1; i <= da + db; i++) s.games.push({ g: da ? [last[0] + i, b1] : [a1, last[1] + i], w: da ? 0 : 1 });
  });
  return sets;
}
function tennisLogHtml(id, info) {
  const names = [lastName(info.home.name), lastName(info.away.name)];
  const sets = tennisSets(TL_CACHE[id]?.log || [], info);
  const n = Math.max(info.sets[0].length, sets.length);
  if (!n) return `<p class="note" style="margin:0">La cronaca comincia con il primo game.</p>`;
  const cur = info.state === "in" ? n - 1 : -1;
  const blocks = [];
  for (let k = n - 1; k >= 0; k--) {
    const s = sets[k] || { games: [], pre: null };
    const a = info.sets[0][k] ?? 0, b = info.sets[1][k] ?? 0, w = info.setWin?.[k];
    const tb = w != null && info.tb?.[w]?.[k] != null ? ` (tie-break ${info.tb[w][k]}-${info.tb[1 - w][k]})` : "";
    const head = k === cur ? `<b>${k + 1}° set</b><span class="tl-now">in corso · ${names[0]} ${a}-${b} ${names[1]}</span>`
      : `<b>${k + 1}° set</b><span>${w != null ? `vinto da <b class="p${w}">${names[w]}</b> ${Math.max(a, b)}-${Math.min(a, b)}${tb}` : `${a}-${b}`}</span>`;
    const pills = [
      s.pre ? `<span class="tg pre" title="game giocati prima che partisse la cronaca">${s.pre[0]}-${s.pre[1]}<small>già giocati</small></span>` : "",
      ...s.games.map(x => x.w == null
        ? `<span class="tg gap" title="${x.n || 2} game nello stesso minuto: ordine non noto">${x.g[0]}-${x.g[1]}<small>${x.n || 2} game</small></span>`
        : `<span class="tg p${x.w}" title="game a ${names[x.w]}">${x.g[0]}-${x.g[1]}<small>${names[x.w]}</small></span>`),
    ].join("");
    blocks.push(`<div class="tl-set ${k === cur ? "cur" : ""}"><div class="tl-h">${head}</div><div class="tl-games">${pills || `<span class="faint">nessun game registrato</span>`}</div></div>`);
  }
  return `<div class="tl-key"><span class="tg p0">${names[0]}</span><span class="tg p1">${names[1]}</span><span class="faint">punteggio del set dopo ogni game, colorato per chi l'ha vinto</span></div>${blocks.join("")}`;
}
/* pulizia delle cronache vecchie */
try { for (const k of Object.keys(localStorage)) if (k.startsWith("p_tl_")) { const v = JSON.parse(localStorage.getItem(k)); if (!v?.ts || Date.now() - v.ts > 2 * 864e5) localStorage.removeItem(k); } } catch { /* niente */ }

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
  const P = (r, cur, need, what) => ({ ...r, prog: { cur, need, what } });     // contatore: a che punto è
  const over = (c, n, what) => P(c > n ? R("win", `${end ? "Vinta" : "Già vinta"}: ${c} ${what}`)
    : end ? R("lose", `Persa: finita con ${c} ${what}`)
    : R("", `${n + 1 - c === 1 ? "Manca" : "Mancano"} ${n + 1 - c} ${what}, ora ${c}`), c, n + 1, what);
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

  // esito secco e doppia chance scritti come sul sito (1, X, 2, 1X, X2, 12)
  const SIGN = { "1": (h, a) => h > a, "X": (h, a) => h === a, "2": (h, a) => a > h, "1X": (h, a) => h >= a, "X2": (h, a) => a >= h, "12": (h, a) => h !== a };
  if (SIGN[L]) {
    if (!end && L !== "X" && L !== "12" && H === A && L.length === 1) return R("", `Per ora in parità, ${score}`);
    return outcome(SIGN[L]);
  }
  // combinate ("1 + Over 2,5"): vince solo se escono tutte le parti
  if (L.includes(" + ")) {
    const parts = L.split(" + ").map(x => x.trim()).map(x => x === "Goal" ? "Goal, segnano entrambe" : x);
    const st = parts.map(x => ({ label: x === "Goal, segnano entrambe" ? "Goal" : x, s: pickStatus(x, info) }));
    if (st.some(x => !x.s)) return R("", end ? `Finita, ${score}` : `In corso, ${score}`);
    const prog = st.find(x => x.s.prog && x.s.cls !== "win")?.s.prog || st.find(x => x.s.prog)?.s.prog;
    const lost = st.find(x => x.s.cls === "lose");
    const base = lost ? R("lose", `Persa: ${lost.label} non presa`)
      : st.every(x => x.s.cls === "win") ? R("win", end ? `Vinta, ${score}` : `Già vinta, ${score}`)
      : end ? R("lose", `Persa, ${score}`)
      : st.every(x => ["ok", "win"].includes(x.s.cls)) ? R("ok", `Per ora la stai vincendo, ${score}`)
      : R(st.some(x => x.s.cls === "ko") ? "ko" : "", `In corso, ${score}`);
    return { ...base, parts: st, ...(prog ? { prog } : {}) };
  }
  if ((m = L.match(/^Over (\d+),5 angoli$/))) return info.teamStats ? over((info.teamStats.home.wonCorners || 0) + (info.teamStats.away.wonCorners || 0), +m[1], "angoli") : null;
  if ((m = L.match(/^Under (\d+),5 angoli$/))) return info.teamStats ? under((info.teamStats.home.wonCorners || 0) + (info.teamStats.away.wonCorners || 0), +m[1], "angoli") : null;
  if ((m = L.match(/^Over (\d+),5 gialli$/))) return info.teamStats ? over((info.teamStats.home.yellowCards || 0) + (info.teamStats.away.yellowCards || 0), +m[1], "gialli") : null;
  if ((m = L.match(/^(Over|Under) (\d+),5 nel primo tempo$/))) {
    const firstDone = end || info.period >= 2;
    const c = info.half && firstDone ? info.half[0] + info.half[1] : H + A;
    if (firstDone) return (m[1] === "Over") === (c > +m[2]) ? R("win", `Vinta: ${c} gol nel primo tempo`) : R("lose", `Persa: ${c} gol nel primo tempo`);
    return m[1] === "Over" ? P(c > +m[2] ? R("win", `Già vinta: ${c} gol`) : R("", `${+m[2] + 1 - c === 1 ? "Manca" : "Mancano"} ${+m[2] + 1 - c} gol prima dell'intervallo`), c, +m[2] + 1, "gol") : under(c, +m[2], "gol");
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
    return c >= lo ? R("ok", `Per ora va bene: ${c} gol, il massimo è ${hi}`) : P(R("", `${lo - c === 1 ? "Manca" : "Mancano"} ${lo - c} gol, ora ${c}`), c, lo, "gol");
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
    return P(v >= need ? R("win", `${end ? "Vinta" : "Già vinta"}: ${v} ${m[3]}`) : end ? R("lose", `Persa: ${v} ${m[3]}`) : R("", `${need - v === 1 ? "Manca" : "Ne mancano"} ${need - v}, ora ${v}`), v, need, m[3]);
  }
  if ((m = L.match(/^(.+) over (\d+),5$/))) { const side = sideOfText(m[1]); if (!side) return null; return over(side === "home" ? H : A, +m[2], "punti"); }
  if ((m = L.match(/^(.+) ([+-]\d+(?:,\d)?)$/))) {
    const side = sideOfText(m[1]); if (!side) return null;
    const hc = parseFloat(m[2].replace(",", "."));
    return outcome((h, a) => (side === "home" ? h - a : a - h) + hc > 0);
  }
  return R("", end ? `Finita, ${score}` : `In corso, ${score}`);
}

/* giocata in diretta, compatta: una riga con minuto, risultato e i conteggi (●●○), una frase con cosa manca */
function slipNeed(label, s, info) {
  const H = info.home?.name || "casa", A = info.away?.name || "ospiti", pr = s?.prog;
  if (pr && pr.cur < pr.need) { const k = pr.need - pr.cur; return `${k === 1 ? "un altro" : `altri ${k}`} ${k === 1 ? pr.what.replace(/i$/, "o").replace(/^gol$/, "gol").replace(/^punto$/, "punto") : pr.what}`; }
  return { "1": `la vittoria di ${H}`, "X": "il pareggio", "2": `la vittoria di ${A}`, "1X": `che ${H} non perda`, "X2": `che ${A} non perda`,
    "12": "che non finisca pari", "Goal": "che segnino entrambe", "Goal, segnano entrambe": "che segnino entrambe", "No Goal": "che non segnino entrambe" }[label] || label;
}
function slipDots(pr) {
  if (!pr) return "";
  const need = pr.need, cur = Math.min(pr.cur, need);
  if (need > 8) return `<span class="lv-c"><b>${pr.cur}</b>/${need}</span>`;
  return `<span class="lv-c" title="${pr.cur} di ${need} ${esc(pr.what)}">${"<i class=on></i>".repeat(cur)}${"<i></i>".repeat(need - cur)}</span>`;
}
function slipLiveHtml(s, info, label = "", ch = null) {
  const live = info.state === "in";
  const clock = info.sport === "tennis" ? `${Math.max(1, info.sets?.[0]?.length || 1)}° set` : (info.sport === "soccer" ? (info.clock || info.detail || "") : (info.detail || ""));
  const score = info.sport === "tennis" ? `${info.won?.[0] ?? 0}-${info.won?.[1] ?? 0}` : `${info.H}-${info.A}`;
  const parts = s.parts || [{ label, s }];
  const dots = parts.map(p => slipDots(p.s?.prog)).join("");
  const missing = parts.filter(p => !["ok", "win"].includes(p.s?.cls)).map(p => slipNeed(p.label, p.s, info));
  const lost = parts.find(p => p.s?.cls === "lose");
  const [cls, txt] = s.cls === "win" ? ["win", "✓ Presa"]
    : lost || s.cls === "lose" ? ["lose", "✗ Persa"]
    : !missing.length ? ["ok", "✓ Per ora presa"]
    : [s.cls === "ko" || parts.some(p => p.s?.cls === "ko") ? "ko" : "wait", `${live ? "Ti serve" : "Serviva"}: ${missing.join(" e ")}`];
  return `<div class="lv2"><span class="lv-min ${live ? "" : "done"}">${live ? `<i class="ls-dot live"></i>${esc(clock)}` : "Finita"}</span><b class="lv-score">${esc(score)}</b>${dots}${live && !["win", "lose"].includes(s.cls) ? chanceTag(ch) : ""}</div>
    <div class="lv-say ${cls}">${esc(txt)}</div>`;
}

/* esito da salvare quando una giocata si chiude: risultato finale e, se persa, cosa è mancato */
function closedFields(s, f) {
  const info = s._info || {};
  const score = info.sport === "tennis" ? (info.sets ? info.sets[0].map((g, i) => `${g}-${info.sets[1][i]}`).join(" ") : "") : (info.H != null ? `${info.H}-${info.A}` : "");
  let why = "";
  if (s.cls === "lose") {
    const parts = s.parts || [{ label: f.label, s }];
    const miss = parts.filter(p => p.s?.cls === "lose" || p.s?.cls === "ko" || (p.s?.prog && p.s.prog.cur < p.s.prog.need)).map(p => slipNeed(p.label, p.s, info).replace(/^(un altro|altri \d+) /, m => m));
    if (miss.length) why = `serviva ${miss.join(" e ")}`;
  }
  return { result: s.cls, result_txt: s.txt, final_score: score, result_why: why };
}

/* contatore della giocata: 7 su 10 rimbalzi, con la barra che si riempie */
function progBar(s) {
  if (!s?.prog || !s.prog.need) return "";
  const { cur, need, what } = s.prog, w = Math.min(100, Math.round(cur / need * 100));
  return `<span class="prog ${s.cls}"><span class="prog-bar"><i style="width:${w}%"></i></span><span class="prog-n"><b>${cur}</b> su ${need} ${esc(what)}</span></span>`;
}

function statusChips(list, info) {
  if (!list.length) return "";
  return `<div class="live-slip">${list.map(f => {
    const s = pickStatus(f.label, info);
    const ch = s && !["win", "lose"].includes(s.cls) ? liveChance(f.label, info, INDEX?.events.find(e => e.id === f.event)) : null;
    return `<div class="ls ${s?.cls || ""}"><b>★ ${esc(f.label)} ${chanceTag(ch)}</b>${s ? `<span>${esc(s.txt)}</span>${s.parts ? `<span class="sl-parts">${s.parts.map(p => `<span class="sl-part ${p.s.cls}">${esc(p.label)}</span>`).join("")}</span>` : ""}${progBar(s)}` : `<span>Si vede a fine partita</span>`}</div>`;
  }).join("")}</div>`;
}

/* ------------------------------------------------------------------ percentuali durante la partita */

function liveRings(info, ix) {
  if (info.state !== "in") return "";
  if (info.sport === "soccer") {
    const p = soccerLive(ix?.xg, info.H, info.A, minuteOf(info));
    const dist = soccerDist(ix?.xg, info.H, info.A, minuteOf(info)), G = (f) => pct(soccerP(dist, f));
    const tot = info.H + info.A, lines = [tot + 0.5, tot + 1.5, tot + 2.5].map(x => Math.floor(x) + 0.5);
    const none = Math.exp(-(dist.lh + dist.la)), sh = dist.lh + dist.la ? dist.lh / (dist.lh + dist.la) : .5;
    const grid = `<div class="lp-grid">${lines.map(l => `<span>Over ${String(l).replace(".", ",")}<b>${G((h, a) => h + a > l)}</b></span>`).join("")}
      <span>Goal<b>${G((h, a) => h > 0 && a > 0)}</b></span><span>1X<b>${G((h, a) => h >= a)}</b></span><span>X2<b>${G((h, a) => a >= h)}</b></span></div>
      <div class="lp-next">Prossimo gol: <b>${esc(info.home.name)} ${pct((1 - none) * sh)}</b> · nessuno <b>${pct(none)}</b> · <b>${esc(info.away.name)} ${pct((1 - none) * (1 - sh))}</b></div>`;
    return { rings: p.win.map((x, i) => `<span class="fx-ring">${ring(x, x === Math.max(...p.win))}<small>${["1", "X", "2"][i]}</small></span>`).join(""),
      sub: `<div class="lp-short">Adesso Over 2,5 <b>${pct(p.over25)}</b>, Goal <b>${pct(p.btts)}</b></div>${grid}${ix ? `<div class="lp-pre">Prima del via: ${ix.main.map(pct).join(" / ")}</div>` : ""}` };
  }
  if (info.sport === "nba") {
    const p = info.winProb != null ? [info.winProb, 1 - info.winProb] : nbaLive(info.comp, ix?.exp_score ? ix.exp_score[0] - ix.exp_score[1] : 0, info.H, info.A);
    return { rings: p.map((x, i) => `<span class="fx-ring">${ring(x, x === Math.max(...p))}<small>${i ? "2" : "1"}</small></span>`).join(""),
      sub: ix ? `Prima del via: ${ix.main.map(pct).join(" / ")}` : "" };
  }
  if (info.sport === "tennis") {
    const p = tennisLive(info, ix, ix?.bo || 3);
    if (!p) return "";
    const nm = [lastName(info.home.name), lastName(info.away.name)];
    return { rings: p.map((x, i) => `<span class="fx-ring">${ring(x, x === Math.max(...p))}<small>${esc(nm[i])}</small></span>`).join(""),
      sub: `Chi vince adesso, dal punteggio di set e game${ix ? `. Prima del via: ${ix.main.map(pct).join(" / ")}` : ""}` };
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
  if (!box) { box = document.createElement("div"); box.id = "live-box"; ($app.querySelector(".board") || $app.querySelector(".back"))?.after(box); }
  let info = null, failed = false;
  try { info = await eventInfo(tg); } catch { failed = true; }
  if (location.hash !== hash) return;
  box = document.getElementById("live-box");
  if (!box) return;
  if (failed && d.final) box.innerHTML = "";     // l'esito c'è già nella scheda: niente avviso
  else if (failed) box.innerHTML = `<div class="warn">Non riesco a leggere il risultato in diretta adesso. Riprovo tra poco; intanto usa i link in fondo alla scheda.</div>`;
  else if (info && info.state !== "pre") box.innerHTML = liveBox(info, d, scoreChanged(d.id, info));
  else box.innerHTML = "";
  if ((failed && !d.final) || info?.state === "in" || (info?.state === "pre" && Date.now() > start - 15 * 60e3))
    boxTimer = later(() => { if (location.hash === hash) attachLive(d); }, info?.state === "in" ? LIVE_FAST : LIVE_SLOW);
}

function liveBox(info, d, flash = false) {
  const ix = INDEX.events.find(e => e.id === d.id);
  const on = info.state === "in";
  const detail = info.sport === "tennis" ? `${Math.min(info.period || 1, Math.max(info.sets[0].length, 1))}° set` : info.sport === "soccer" ? info.clock || info.detail : info.detail;
  const head = `<div class="lb-head">${on ? `<span class="pulse"></span><b>In diretta</b>` : `<b>Finita</b>`}<small>${esc(on ? detail : "risultato finale")}</small></div>`;
  let score;
  if (info.sport === "tennis") {
    score = `<div class="${flash ? "flash" : ""}">${tennisBoard(info)}</div>`;
  } else {
    score = `<div class="lb-score"><span>${esc(info.home.name)}</span><b class="${flash ? "flash" : ""}">${info.H}<i>-</i>${info.A}</b><span>${esc(info.away.name)}</span></div>`;
  }
  if (info.sport === "soccer") score += soccerTimebar(info, d);
  const lr = liveRings(info, ix);
  const probs = lr ? `<div class="live-probs">${lr.rings ? `<div class="fx-rings">${lr.rings}</div>` : ""}${lr.sub ? `<div class="live-sub">${lr.sub}</div>` : ""}</div>` : "";
  const mine = favs().filter(f => f.event === d.id);
  const slip = mine.length ? `<h3 class="lb-h3">Le tue giocate su questa partita</h3>${statusChips(mine, info)}` : "";
  const burst = flash && info.state === "in" && info.sport === "soccer" ? `<div class="goal-burst" aria-hidden="true">GOL!</div>` : "";   // solo il gol: game e canestri sarebbero troppi
  return `<section class="sec live-box">${burst}${head}${score}${probs}${slip}</section>` + liveDetails(info, d);
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
/* linea del tempo 0'–90': gol e cartellini della casa sopra, degli ospiti sotto */
function soccerTimebar(info, d) {
  const mins = c => { const m = String(c || "").match(/(\d+)'?(?:\s*\+\s*(\d+))?/); return m ? +m[1] + (+m[2] || 0) : null; };
  const evs = (info.events || []).map(e => ({ ...e, k: evKind(e.type), m: mins(e.clock) })).filter(e => ["goal", "own", "pen", "red", "yellow"].includes(e.k) && e.m != null);
  const now = info.state === "in" ? Math.min(mins(info.clock) ?? 0, 120) : 90;
  const end = Math.max(90, now, ...evs.map(e => e.m));
  const [cH, cA] = typeof teamColors === "function" ? teamColors(d.home || {}, d.away || {}) : ["var(--go)", "var(--ink-3)"];
  const pos = m => `${Math.min(100, 100 * m / end).toFixed(1)}%`;
  const mark = e => `<span class="tb-mk ${e.side} k-${e.k}" style="left:${pos(e.m)}" title="${esc(e.clock)} ${esc((e.who || [])[0] || "")}">${e.k === "yellow" ? "" : e.k === "red" ? "" : "⚽"}</span>`;
  return `<div class="tbar" style="--ch:${cH};--ca:${cA}">
    <div class="tb-side h">${evs.filter(e => e.side === "home").map(mark).join("")}</div>
    <div class="tb-line"><span class="tb-fill" style="width:${pos(now)}"></span><span class="tb-ht" style="left:${pos(45)}"></span></div>
    <div class="tb-side a">${evs.filter(e => e.side === "away").map(mark).join("")}</div>
    <div class="tb-ticks"><span>0'</span><span style="left:${pos(45)}">45'</span><span style="right:0">${end}'</span></div></div>`;
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
  if (info.sport === "tennis") {
    tennisLogFetch(d.id);
    setTimeout(() => { const box = document.getElementById("tlog-" + d.id); if (box) box.__info = info; }, 0);
    return sec("Cronaca game per game", `<div class="tlog2" id="tlog-${esc(d.id)}">${tennisLogHtml(d.id, info)}</div>
      <p class="note">Set più recente in alto. ESPN non dà i punti dentro il game (15-30-40) né chi serve, quindi la cronaca si ferma ai game.</p>`, "", "Cronaca tennis");
  }
  const [cH, cA] = teamColors(d.home, d.away);
  if (info.sport === "soccer") return soccerTimeline(info) + liveStats(info, cH, cA);
  return nbaPeriods(info, cH, cA) + liveStats(info, cH, cA) + nbaPlays(info);
}

/* ------------------------------------------------------------------ esito delle giocate nella schedina */

let slipTimer = null;
async function attachSlipStatus() {
  clearTimeout(slipTimer);
  const now = Date.now(), hash = location.hash;
  if (typeof f1Settle === "function" && f1Settle()) {             // Formula 1: esito dal risultato nei dati, niente diretta ESPN
    if (location.hash.startsWith("#/schedina")) { showSlip(); return; }
    if (location.hash.startsWith("#/tu")) { showMe(); return; }
  }
  const legs = [...favs(), ...mySlips().flatMap(s => s.legs)];   // giocate della schedina e delle schedine salvate
  const started = legs.filter(f => { const t = new Date(f.date).getTime(); return !f.result && t <= now && now - t < 4 * 864e5; });
  const ids = [...new Set(started.map(f => f.event))].slice(0, 20);
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
  const chances = new Map();  // probabilità adesso di ogni giocata in corso
  document.querySelectorAll("[data-slip-event]").forEach(el => {
    const info = infos[el.dataset.slipEvent];
    if (!info) return;
    if (info.state === "in") anyLive = true;
    const s = pickStatus(el.dataset.slipLabel, info);
    const ix = INDEX?.events.find(e => e.id === el.dataset.slipEvent);
    const ch = s?.cls === "win" ? 1 : s?.cls === "lose" ? 0 : liveChance(el.dataset.slipLabel, info, ix);
    chances.set(`${el.dataset.slipEvent}|${el.dataset.slipLabel}`, ch);
    el.innerHTML = s ? slipLiveHtml(s, info, el.dataset.slipLabel, ch) : "";
    el.className = `slip-live lvw ${s?.cls || ""}`;
    if (s && (s.cls === "win" || s.cls === "lose")) closed.set(`${el.dataset.slipEvent}|${el.dataset.slipLabel}`, { ...s, _info: info });
  });
  // schedine salvate: probabilità adesso che passino tutte (giocate non iniziate: stima di prima del via)
  document.querySelectorAll("[data-slip-chance]").forEach(el => {
    const sl = mySlips().find(x => x.id === el.dataset.slipChance);
    if (!sl) return;
    let p = 1, live = false, unknown = false;
    for (const f of sl.legs) {
      if (f.result) { p *= f.result === "win" ? 1 : 0; continue; }
      const c = chances.get(`${f.event}|${f.label}`);
      if (c != null) { p *= c; live = true; }
      else if (new Date(f.date).getTime() > Date.now()) p *= f.p;
      else unknown = true;
    }
    if (!live || unknown) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `${ring(p, p >= .5)}<span><b>Adesso la schedina ha il ${pct(p)} di passare</b><small>stima del modello dal punteggio in diretta; prima del via era ${pct(sl.legs.reduce((a, f) => a * f.p, 1))}</small></span>`;
  });
  if (closed.size) {
    const list = favs();
    let changed = false;
    for (const f of list) {
      const s = closed.get(f.key);
      if (s && !f.result) { Object.assign(f, closedFields(s, f)); f.closed = new Date().toISOString(); changed = true; }
    }
    if (changed) saveFavs(list);
    const slips = mySlips();
    let changedSlips = false;
    for (const sl of slips) for (const f of sl.legs) {
      const s = closed.get(f.key);
      if (s && !f.result) { Object.assign(f, closedFields(s, f)); changedSlips = true; }
    }
    if (changedSlips) saveMySlips(slips);
    if (changed || changedSlips) {
      if (location.hash.startsWith("#/schedina")) { showSlip(); return; }
      if (location.hash.startsWith("#/tu")) { showMe(); return; }
    }
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
      for (const c of g.competitions || []) if (["in", "post"].includes(c.status?.type?.state)) out.push({ id: `tennis-${t}-${c.id}`, league: t, info: tennisInfo({ id: String(c.id) }, [ev]) });
    return out;
  }));
  const res = await Promise.allSettled(jobs);
  return { events: res.flatMap(r => r.status === "fulfilled" ? r.value.filter(x => x.info) : []), failed: res.filter(r => r.status === "rejected").length, total: jobs.length };
}

/* lettura in diretta condivisa (elenco, conteggio "In diretta", esiti): al massimo una ogni pochi secondi */
let LIVE_CACHE = null;
async function liveData(maxAge = 20000) {
  if (LIVE_CACHE && Date.now() - LIVE_CACHE.ts < maxAge) return LIVE_CACHE.data;
  const data = await loadLive();
  LIVE_CACHE = { ts: Date.now(), data };
  recordFinals(data);
  return data;
}
/* partite in corso adesso secondo ESPN (null se non ancora lette) */
function liveNow(sport = "all") {
  if (!LIVE_CACHE) return null;
  return LIVE_CACHE.data.events.filter(e => e.info.state === "in" && (sport === "all" || e.info.sport === sport)).length;
}
/* esiti visti dal telefono: le partite finite vanno subito in "Concluse", senza aspettare l'aggiornamento dei dati */
function phoneFinals() { try { return JSON.parse(localStorage.getItem("p_finals") || "{}"); } catch { return {}; } }
function recordFinals(data) {
  const map = phoneFinals(), known = new Set(INDEX.events.map(e => e.id));
  let added = 0;
  for (const e of data.events) {
    if (e.info.state !== "post" || !known.has(e.id) || map[e.id]) continue;
    const i = e.info;
    map[e.id] = i.sport === "tennis"
      ? { h: i.won[0], a: i.won[1], w: i.winner ?? (i.won[0] > i.won[1] ? 0 : 1), sets: i.sets, games: i.games, st: i.detail || "Finita", t: Date.now() }
      : { h: Number(i.H), a: Number(i.A), st: i.detail || "Finita", t: Date.now() };
    added++;
  }
  const lim = Date.now() - 4 * 86400e3;
  try { localStorage.setItem("p_finals", JSON.stringify(Object.fromEntries(Object.entries(map).filter(([, f]) => f.t > lim)))); } catch { /* niente */ }
  if (applyFinals() && added && typeof showListKeepScroll === "function" && /^#?\/?$/.test(location.hash) && state.status !== "live") showListKeepScroll();
}
function applyFinals() {
  if (!INDEX) return 0;
  const map = phoneFinals();
  let n = 0;
  for (const e of INDEX.events) if (!e.final && map[e.id] && !Number.isNaN(map[e.id].h)) { e.final = map[e.id]; n++; }
  return n;
}

/* aggiorna il numero sul filtro "In diretta" con quello vero di ESPN */
function updateLiveCount() {
  const b = document.querySelector('[data-status="live"]');
  const n = liveNow(state.sport);
  if (!b || n == null) return;
  b.querySelector("small").textContent = n;
  b.querySelector(".pulse-dot")?.classList.toggle("on", n > 0);
}

function postSeen() { try { return JSON.parse(localStorage.getItem("p_postseen") || "{}"); } catch { return {}; } }
function savePostSeen(o) {
  const lim = Date.now() - 86400e3;
  try { localStorage.setItem("p_postseen", JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, t]) => t > lim)))); } catch { /* niente */ }
}
/* partite in diretta: dentro l'elenco principale (filtro "In diretta"), nel riquadro #live-embed */
async function showLive(opt = { embed: true }) {
  clearTimeout(liveTimer);
  const host = () => document.getElementById("live-embed");
  const still = () => state.status === "live" && !!host();
  if (!host()) return;
  if (!host().querySelector(".live-page")) host().innerHTML = `<div class="live-page"><p class="muted" style="padding:20px 4px">Carico le partite in corso…</p></div>`;
  let data;
  try { data = await liveData(5000); } catch { data = { events: [], failed: 1, total: 1 }; }
  if (!still()) return;
  updateLiveCount();
  const sp = e => state.sport === "all" || (e.info?.sport || e.sport) === state.sport;
  data = { ...data, events: data.events.filter(sp) };
  const byKey = Object.fromEntries(INDEX.events.map(e => [e.id, e]));
  const live = data.events.filter(e => e.info.state === "in");
  // finite da poco: restano un'ora dalla fine. ESPN non dà l'ora del fischio finale: vale la prima volta che
  // il telefono la vede finita, oppure (se l'app era chiusa) una durata tipica dall'inizio
  const ends = postSeen();
  const DUR = { soccer: 1.9, nba: 2.4, tennis: 2 };
  const done = data.events.filter(e => {
    if (e.info.state !== "post") return false;
    const start = new Date(e.info.comp?.date || byKey[e.id]?.date || 0).getTime();
    const est = start + (DUR[e.info.sport] || 2) * 3600e3;
    if (!ends[e.id] && Date.now() < est + 3600e3) ends[e.id] = Date.now();
    const end = ends[e.id] || est;
    return Date.now() - end < 3600e3;
  });
  savePostSeen(ends);
  const soon = INDEX.events.filter(sp).filter(e => { const t = new Date(e.date) - Date.now(); return t > 0 && t < 3 * 3600e3; });

  const card = e => {
    const ix = byKey[e.id], info = e.info;
    const fl = info.state === "in" && scoreChanged(e.id, info) ? "flash" : "";
    const href = `#/e/${encodeURIComponent(ix?.id || e.id)}`;
    const mine = statusChips(favs().filter(f => f.event === e.id), info);
    const bell = info.state === "in" && ix && typeof bellBtn === "function" ? bellBtn({ ...ix, final: null, date: new Date().toISOString() }, true) : "";
    if (info.sport === "tennis") {
      const setTxt = info.state === "in" ? `${Math.min(info.period || 1, Math.max(info.sets[0].length, 1))}° set` : "Finale";
      return `<a class="live-row" href="${href}"><div class="live-main"><div class="live-min ${info.state === "in" ? "on" : ""}">${esc(setTxt)}${bell}</div>
        <div class="${fl}">${tennisBoard(info, true)}</div></div>${(() => { const p = info.state === "in" ? tennisLive(info, ix) : null;
          return p ? `<div class="live-sub tl-ch">Adesso: ${esc(lastName(info.home.name))} <b>${pct(p[0])}</b> · ${esc(lastName(info.away.name))} <b>${pct(p[1])}</b></div>` : ""; })()}${mine}</a>`;
    }
    const lr = liveRings(info, ix);
    const min = info.state === "in" ? (info.sport === "soccer" ? (info.clock || info.detail) : info.detail) : "Finale";
    return `<a class="live-row" href="${href}"><div class="live-main"><div class="live-min ${info.state === "in" ? "on" : ""}">${esc(min)}${bell}</div>
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
    return [...m].map(([g, l]) => `<section class="group"><div class="group-h static">${leagueMark(l[0].league, l[0].info.sport)}<b>${esc(g)}</b><small>${l.length}</small></div>${l.map(card).join("")}</section>`).join("");
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
  host().innerHTML = html;
  liveTimer = later(() => { if (still()) showLive(opt); }, live.length ? LIVE_FAST : LIVE_SLOW);
}

function leagueLabel(k) {
  for (const list of Object.values(LEAGUES)) for (const [key, l] of list) if (key === k) return l;
  return k === "nba" ? "NBA" : k;
}

window.addEventListener("hashchange", () => {
  if (!document.getElementById("live-embed")) clearTimeout(liveTimer);
  clearTimeout(boxTimer); clearTimeout(slipTimer); clearTimeout(lineupTimer);
});
/* tornando sull'app (o quando torna la rete) i risultati si aggiornano subito, senza aspettare il prossimo giro */
function resume() {
  if (document.hidden) return;
  const fns = [...pending]; pending.clear();
  fns.forEach(fn => fn());
}
document.addEventListener("visibilitychange", resume);
window.addEventListener("online", () => { if (document.getElementById("live-embed")) showLive(); else resume(); });
