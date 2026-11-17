// Notifiche delle partite: un Durable Object (gratuito, con archivio SQLite) tiene gli abbonamenti dei telefoni,
// ogni minuto legge da ESPN il tabellone delle sole competizioni con partite seguite in corso,
// confronta con il minuto prima e manda gol, espulsioni, fine tempo/quarto/set/game e fine partita.
import { newVapidKeys, sendPush } from "./webpush.js";
import { judge } from "./judge.js";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const MAX_BOARDS = 30;              // tabelloni letti al massimo per minuto
const MAX_SUBS = 200;

export const DEFAULT_PREFS = {
  soccer: { on: true, mode: "mine", start: false, goal: true, red: true, yellow: true, corner: false, ht: true, second: true, end: true },
  nba: { on: true, mode: "mine", start: false, quarter: true, qstart: false, end: true },
  tennis: { on: true, mode: "mine", start: false, game: false, set: true, setstart: false, end: true },
  general: { slips: true, lineup: true, gap: true, daily: false },
};
const gen = s => ({ ...DEFAULT_PREFS.general, ...(s.prefs?.general || {}) });

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const num = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
const norm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
async function hashId(s) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d.slice(0, 12)].map(x => x.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ istantanee da ESPN */
function teamSnap(ev) {
  const c = (ev.competitions || [])[0] || {};
  const st = c.status || ev.status || {}, ty = st.type || {};
  const side = {};
  for (const x of c.competitors || []) side[x.homeAway] = x;
  if (!side.home || !side.away) return null;
  const tn = x => x.team?.shortDisplayName || x.team?.displayName || "";
  const ids = { [side.home.team?.id]: "h", [side.away.team?.id]: "a" };
  const det = c.details || [];
  const goals = det.filter(d => d.scoringPlay).map(d => ({ m: d.clock?.displayValue || "", s: ids[d.team?.id] || "", who: d.athletesInvolved?.[0]?.displayName || d.athletesInvolved?.[0]?.shortName || "", og: !!d.ownGoal, pen: !!d.penaltyKick }));
  const reds = det.filter(d => d.redCard).map(d => ({ m: d.clock?.displayValue || "", s: ids[d.team?.id] || "", who: d.athletesInvolved?.[0]?.displayName || "" }));
  const yellows = det.filter(d => d.yellowCard && !d.redCard).map(d => ({ m: d.clock?.displayValue || "", s: ids[d.team?.id] || "", who: d.athletesInvolved?.[0]?.displayName || "" }));
  const stat = (x, name) => { const v = (x.statistics || []).find(s => s.name === name); return v ? num(v.displayValue ?? v.value) : null; };
  const ch = stat(side.home, "wonCorners"), ca = stat(side.away, "wonCorners");
  return {
    st: ty.state || "pre", nm: ty.name || "", p: st.period || 0, det: ty.shortDetail || "",
    min: parseInt(String(st.displayClock || "").replace(/[^0-9].*$/, ""), 10) || 0,
    h: num(side.home.score), a: num(side.away.score), hn: tn(side.home), an: tn(side.away),
    ls: [side.home, side.away].map(x => (x.linescores || []).map(l => num(l.value))), goals, reds, yellows,
    corners: ch == null || ca == null ? null : [ch, ca],
  };
}

function tennisSnap(c) {
  const ps = [...(c.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (ps.length !== 2) return null;
  const ty = c.status?.type || {};
  const sets = ps.map(p => (p.linescores || []).map(x => num(x.value)));
  return {
    st: ty.state || "pre", nm: ty.name || "", det: ty.shortDetail || "",
    hn: ps[0].athlete?.displayName || ps[0].athlete?.shortName || "", an: ps[1].athlete?.displayName || ps[1].athlete?.shortName || "",
    sets, w: ps[0].winner ? 0 : ps[1].winner ? 1 : null,
    gt: sets[0].reduce((x, y) => x + y, 0) + (sets[1] || []).reduce((x, y) => x + y, 0),
  };
}

function snapsFromBoard(sport, board, wanted) {
  const out = {};
  for (const ev of board.events || []) {
    if (sport === "tennis") {
      for (const g of ev.groupings || []) for (const c of g.competitions || [])
        if (wanted.has(String(c.id))) { const s = tennisSnap(c); if (s) out[String(c.id)] = { ...s, comp: ev.name || "" }; }
    } else if (wanted.has(String(ev.id))) {
      const s = teamSnap(ev);
      if (s) out[String(ev.id)] = s;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ cosa è cambiato rispetto al minuto prima */
const last = n => String(n || "").split(" ").slice(-1)[0];
const setsTxt = (s, upto = s.sets[0].length) => s.sets[0].slice(0, upto).map((g, i) => `${g}-${s.sets[1][i] ?? 0}`).join(" ");
const qName = (q, sport) => sport === "nba" ? (q <= 4 ? `${q}° quarto` : `${q - 4}° supplementare`) : `${q}° tempo`;

export function diff(sport, prev, cur, ev) {
  const out = [];         // [tipo, titolo, testo]
  if (!prev || !cur) return out;
  const score = `${cur.hn} ${cur.h}-${cur.a} ${cur.an}`;
  const where = ev.league_name ? ` · ${ev.league_name}` : "";
  if (prev.st === "pre" && cur.st === "in") out.push(["start", sport === "tennis" ? `Si comincia: ${last(cur.hn)} – ${last(cur.an)}` : `Si comincia: ${cur.hn} – ${cur.an}`, `In corso adesso${where}`]);
  if (sport === "soccer") {
    const g0 = prev.h + prev.a, g1 = cur.h + cur.a;
    if (g1 > g0) {
      const news = cur.goals.slice(prev.goals?.length || 0);
      const gs = news.length ? news : [{}];
      for (const g of gs.slice(0, 3)) {
        const team = g.s === "h" ? cur.hn : g.s === "a" ? cur.an : "";
        const who = g.who ? `${g.who}${g.og ? " (autogol)" : g.pen ? " (rigore)" : ""}` : "";
        out.push(["goal", `⚽ Gol${team ? ` ${team}` : ""}! ${score}`, [who, g.m].filter(Boolean).join(" · ") + where]);
      }
    } else if (g1 < g0 && cur.st === "in") out.push(["goal", `Gol annullato: ${score}`, `Il punteggio è stato corretto${where}`]);
    for (const r of (cur.reds || []).slice(prev.reds?.length || 0)) {
      const team = r.s === "h" ? cur.hn : r.s === "a" ? cur.an : "";
      out.push(["red", `🟥 Espulsione${team ? ` (${team})` : ""}`, [r.who, r.m, score].filter(Boolean).join(" · ")]);
    }
    // l'intervallo: il tabellone ESPN a volte lo segna con minuti di ritardo, il commento della partita no (cur.htFlag)
    for (const y of (cur.yellows || []).slice(prev.yellows?.length || 0)) {
      const team = y.s === "h" ? cur.hn : y.s === "a" ? cur.an : "";
      out.push(["yellow", `🟨 Ammonizione${team ? ` (${team})` : ""}`, [y.who, y.m, score].filter(Boolean).join(" · ")]);
    }
    if (cur.corners && prev.corners) {
      for (const [k, nm] of [[0, cur.hn], [1, cur.an]]) if (cur.corners[k] > prev.corners[k])
        out.push(["corner", `⛳ Calcio d'angolo ${nm}`, `Angoli ${cur.corners[0]}-${cur.corners[1]} · ${score}`]);
    }
    if (cur.p >= 2 && (prev.p || 0) <= 1 && prev.st === "in" && cur.st === "in" && !/HALFTIME/.test(cur.nm))
      out.push(["second", `Inizia il secondo tempo: ${score}`, `Si riparte${where}`]);
    if ((cur.nm === "STATUS_HALFTIME" || cur.htFlag) && !prev.htDone && prev.nm !== "STATUS_HALFTIME" && (prev.p || 1) <= 1)
      out.push(["ht", `Fine primo tempo: ${score}`, `Intervallo${where}`]);
  }
  if (sport === "nba") {
    const endish = /END_PERIOD|HALFTIME/.test(cur.nm);
    const done = cur.st === "post" ? cur.p - 1 : endish ? cur.p : cur.p - 1;
    for (let q = (prev.qn ?? Math.max(0, (/END_PERIOD|HALFTIME/.test(prev.nm) ? prev.p : prev.p - 1))) + 1; q <= done; q++) {
      const hq = cur.ls[0].slice(0, q).reduce((x, y) => x + y, 0), aq = cur.ls[1].slice(0, q).reduce((x, y) => x + y, 0);
      out.push(["quarter", `Fine ${qName(q, "nba")}: ${cur.hn} ${hq}-${aq} ${cur.an}`, `Parziale del quarto ${cur.ls[0][q - 1] ?? "–"}-${cur.ls[1][q - 1] ?? "–"}${where}`]);
    }
    // inizio di un quarto (dal 2° in poi): era fermo a fine periodo, ora si gioca
    if (cur.st === "in" && prev.st === "in" && cur.p >= 2 && !/END_PERIOD|HALFTIME/.test(cur.nm) && (cur.p > prev.p || /END_PERIOD|HALFTIME/.test(prev.nm)))
      out.push(["qstart", `Inizia il ${qName(cur.p, "nba")}: ${score}`, `Si riparte${where}`]);
  }
  if (sport === "tennis") {
    const n = cur.sets[0].length, doneNow = cur.st === "post" ? n : Math.max(0, n - 1);
    const pn = prev.sets?.[0]?.length || 0, donePrev = prev.st === "post" ? pn : Math.max(0, pn - 1);
    let setEnded = false;
    for (let k = donePrev + 1; k <= doneNow && !(cur.st === "post" && k === n); k++) {
      const a = cur.sets[0][k - 1], b = cur.sets[1][k - 1];
      out.push(["set", `Set a ${last(a > b ? cur.hn : cur.an)} ${Math.max(a, b)}-${Math.min(a, b)}`, `${last(cur.hn)} – ${last(cur.an)}: ${setsTxt(cur, k)}${cur.comp ? ` · ${cur.comp}` : ""}`]);
      setEnded = true;
    }
    if (cur.st === "in" && prev.st === "in" && n > pn && n >= 2)
      out.push(["setstart", `Inizia il ${n}° set: ${last(cur.hn)} – ${last(cur.an)}`, `${setsTxt(cur, n - 1)}${cur.comp ? ` · ${cur.comp}` : ""}`]);
    if (!setEnded && cur.st === "in" && cur.gt > (prev.gt || 0) && prev.st === "in") {
      out.push(["game", `${last(cur.hn)} – ${last(cur.an)}: ${setsTxt(cur)}`, `Game concluso${cur.comp ? ` · ${cur.comp}` : ""}`]);
    }
  }
  if ((cur.st === "post" || cur.ftFlag) && prev.st !== "post" && !prev.ftDone) {
    if (sport === "tennis") {
      const w = cur.w ?? 0;
      out.push(["end", `${last(w === 0 ? cur.hn : cur.an)} batte ${last(w === 0 ? cur.an : cur.hn)}`, `${setsTxt(cur)}${/RET/i.test(cur.nm + cur.det) ? " (ritiro)" : ""}${cur.comp ? ` · ${cur.comp}` : ""}`]);
    } else {
      out.push(["end", `Finita: ${score}`, `${/OT|AET|PEN/i.test(cur.det) ? `${cur.det} · ` : ""}Tocca per il confronto con il pronostico${where}`]);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ cronaca del tennis, game per game
   (ESPN dà solo i game di ogni set: confrontando ogni minuto si ricostruisce chi ha vinto ogni game) */
export function tennisLogStep(log, prev, cur, now) {
  const add = x => log.push({ ...x, t: now });
  const n = cur.sets[0].length;
  if (!prev) {       // prima volta: i game già giocati restano un blocco unico
    for (let k = 0; k < n; k++) {
      const g = [cur.sets[0][k] ?? 0, cur.sets[1]?.[k] ?? 0];
      if (g[0] + g[1] > 0) add({ k, g, pre: true });
    }
    return log;
  }
  for (let k = 0; k < n; k++) {
    const a0 = prev.sets?.[0]?.[k] ?? 0, b0 = prev.sets?.[1]?.[k] ?? 0, a1 = cur.sets[0][k] ?? 0, b1 = cur.sets[1]?.[k] ?? 0;
    const da = a1 - a0, db = b1 - b0;
    if (da < 0 || db < 0) { add({ k, g: [a1, b1], fix: true }); continue; }     // punteggio corretto da ESPN
    if (da + db === 0) continue;
    if (da && db) { add({ k, g: [a1, b1], w: null, n: da + db }); continue; }   // più game in un minuto, ordine ignoto
    for (let i = 1; i <= da + db; i++) add({ k, g: da ? [a0 + i, b1] : [a1, b0 + i], w: da ? 0 : 1 });
  }
  return log.slice(-150);
}

/* ------------------------------------------------------------------ Durable Object */
export class Push {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.store = ctx.storage;
  }

  async keys() {
    let k = await this.store.get("vapid");
    if (!k) { k = await newVapidKeys(); await this.store.put("vapid", k); }
    return k;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/push\/?/, "");
    try {
      if (url.pathname.startsWith("/api/live/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/live/".length));
        const [log, st] = await Promise.all([this.store.get("log:" + id), this.store.get("st:" + id)]);
        return json({ log: log || [], sets: st?.sets || null, st: st?.st || null, t: st?.t || null });
      }
      if (path === "key") return json({ key: (await this.keys()).publicKey });
      if (path === "status") return json(await this.store.get("status") || {});
      if (path === "tick" && request.method === "POST") return json(await this.tick(await request.json()));
      if (path === "daily" && request.method === "POST") return json(await this.daily(await request.json()));
      if (request.method !== "POST") return json({ error: "metodo" }, 405);
      const body = JSON.parse((await request.text()).slice(0, 100000) || "{}");
      if (!body.sub?.endpoint || !(/^https:\/\//.test(body.sub.endpoint) || this.env.ALLOW_HTTP)) return json({ error: "abbonamento non valido" }, 400);
      const id = "sub:" + await hashId(body.sub.endpoint);
      if (path === "sub") {
        const subs = await this.store.list({ prefix: "sub:" });
        if (!subs.has(id) && subs.size >= MAX_SUBS) return json({ error: "troppi abbonamenti" }, 429);
        const mine = body.mine || {};
        await this.store.put(id, {
          sub: { endpoint: body.sub.endpoint, keys: body.sub.keys },
          prefs: body.prefs || DEFAULT_PREFS,
          mine: { events: (mine.events || []).slice(0, 600).map(String), teams: (mine.teams || []).slice(0, 100).map(norm).filter(Boolean),
            slips: (mine.slips || []).slice(0, 30).map(sl => ({ id: String(sl.id), name: String(sl.name || "Schedina").slice(0, 40), odds: sl.odds ?? null,
              legs: (sl.legs || []).slice(0, 20).map(l => ({ event: String(l.event), label: String(l.label).slice(0, 80) })) })) },
          origin: url.origin, updated: Date.now(),
        });
        await this.store.put("origin", url.origin);
        return json({ ok: true });
      }
      if (path === "unsub") { await this.store.delete(id); return json({ ok: true }); }
      if (path === "test") {
        const s = await this.store.get(id);
        if (!s) return json({ error: "non iscritto" }, 404);
        const code = await sendPush(s.sub, { title: "Notifiche attive ✓", body: "Riceverai qui gli avvisi delle partite che hai scelto.", tag: "prova", url: "#/tu" }, await this.keys(), s.origin);
        return json({ ok: code < 300, code });
      }
      return json({ error: "sconosciuto" }, 404);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  }

  /* avvisi prima della partita: formazioni ufficiali e modello lontano dalle quote (solo partite seguite) */
  async extras(subs, events, live, followers, outbox, now, status) {
    const base = this.env.ESPN_BASE || ESPN;
    const subMap = new Map(subs);
    const soon = live.filter(e => followers.has(e.id) && Date.parse(e.date) > now - 10 * 60e3);
    for (const e of soon) {
      const fol = (followers.get(e.id) || []).map(k => [k, subMap.get(k)]);
      // il modello contro le quote: una volta per partita, se su un esito c'è una distanza di almeno 12 punti
      if (e.book && e.main && !(await this.store.get("gap:" + e.id))) {
        const gaps = e.main.map((p, i) => p - (e.book[i] ?? p));
        const i = gaps.reduce((b, g, k) => Math.abs(g) > Math.abs(gaps[b]) ? k : b, 0);
        if (Math.abs(gaps[i]) >= 0.12) {
          const lab = e.main.length === 3 ? [`vittoria ${e.home}`, "il pareggio", `vittoria ${e.away}`][i] : `vittoria ${[e.home, e.away][i]}`;
          for (const [key, s] of fol) if (gen(s).gap) outbox.push({ key, s, payload: { title: `📊 Modello e quote non sono d'accordo`, body: `${e.home} – ${e.away}: ${lab} al ${Math.round(e.main[i] * 100)}% per il modello, ${Math.round(e.book[i] * 100)}% per i bookmaker`, tag: `${e.id}-gap`, url: `#/e/${e.id}` } });
          await this.store.put("gap:" + e.id, now);
        }
      }
      // formazioni ufficiali (calcio): da 75 minuti prima, ogni 3 minuti finché escono
      if (e.sport === "soccer" && Date.parse(e.date) - now <= 75 * 60e3 && Date.parse(e.date) - now > -10 * 60e3 && new Date(now).getUTCMinutes() % 3 === 0 && !(await this.store.get("lu:" + e.id))) {
        try {
          const r = await fetch(`${base}/${e.espn}/summary?event=${e.id.split("-").pop()}`, { cf: { cacheTtl: 0 } });
          const s = r.ok ? await r.json() : {};
          const starters = (s.rosters || []).map(t => (t.roster || []).filter(p => p.starter).length);
          if (starters.length === 2 && starters.every(n => n >= 11)) {
            await this.store.put("lu:" + e.id, now);
            for (const [key, sub] of fol) if (gen(sub).lineup) outbox.push({ key, s: sub, payload: { title: `📋 Formazioni ufficiali: ${e.home} – ${e.away}`, body: "Tocca per vedere i titolari e le percentuali dei giocatori aggiornate", tag: `${e.id}-lineup`, url: `#/e/${e.id}` } });
          }
        } catch (err) { status.errors.push(`formazioni: ${err.message || err}`); }
      }
    }
  }

  /* esito delle schedine salvate: appena una giocata è persa, oppure quando sono finite tutte */
  async slipResults(subs, events, snaps, outbox, now) {
    const byId = new Map(events.map(e => [e.id, e]));
    for (const [key, s] of subs) {
      if (!gen(s).slips) continue;
      for (const sl of s.mine?.slips || []) {
        const sentKey = `sd:${key.slice(4)}:${sl.id}`;
        if (await this.store.get(sentKey)) continue;
        const res = await Promise.all(sl.legs.map(async l => {
          const e = byId.get(l.event);
          if (!e) return { l, r: "gone" };
          let f = e.final && typeof e.final === "object" ? e.final : null;
          const snap = snaps[l.event] || (!f ? await this.store.get("st:" + l.event) : null);
          if (!f && snap?.st === "post") f = e.sport === "tennis" ? { h: (snap.sets?.[0] || []).filter((g, i) => g > (snap.sets[1]?.[i] ?? 0)).length, a: (snap.sets?.[1] || []).filter((g, i) => g > (snap.sets[0]?.[i] ?? 0)).length, w: snap.w, games: snap.gt }
            : { h: snap.h, a: snap.a, periods: snap.ls?.[0]?.length ? [[snap.ls[0][0]], [snap.ls[1][0]]] : null };
          if (!f) return { l, r: "open" };
          return { l, e, r: judge(l.label, f, e) ?? "unknown" };
        }));
        const lost = res.find(x => x.r === "lose");
        const open = res.some(x => x.r === "open");
        let payload = null;
        if (lost) payload = { title: `✗ ${sl.name}: persa`, body: `Non è uscita "${lost.l.label}" (${lost.e.home} – ${lost.e.away})`, tag: `slip-${sl.id}`, url: "#/tu" };
        else if (!open && res.length) {
          const won = res.filter(x => x.r === "win").length, unk = res.filter(x => x.r === "unknown" || x.r === "gone").length;
          payload = unk ? { title: `${sl.name}: partite finite`, body: `${won} giocate prese, ${unk} da controllare nell'app`, tag: `slip-${sl.id}`, url: "#/tu" }
            : { title: `✓ ${sl.name}: vinta!`, body: `${won === 1 ? "La giocata è uscita" : `Tutte le ${won} giocate sono uscite`}${sl.odds ? ` · quota ${String(sl.odds).replace(".", ",")}` : ""}`, tag: `slip-${sl.id}`, url: "#/tu" };
        }
        if (payload) { outbox.push({ key, s, payload }); await this.store.put(sentKey, now); }
      }
    }
  }

  /* le migliori del giorno, alle 9 (chiamato dal timer con le giocate di migliori.json) */
  async daily({ items = [], day }) {
    if (!items.length || (await this.store.get("daily")) === day) return { sent: 0 };
    await this.store.put("daily", day);
    const subs = [...(await this.store.list({ prefix: "sub:" })).entries()].filter(([, s]) => gen(s).daily);
    const body = items.slice(0, 3).map(x => `${x.label} ${Math.round(x.p * 100)}% (${x.match})`).join(" · ");
    const outbox = subs.map(([key, s]) => ({ key, s, payload: { title: "⭐ Le migliori di oggi", body, tag: `daily-${day}`, url: "#/migliori" } }));
    return this.finish(outbox, await this.keys(), { sent: 0, errors: [] }, Date.now(), Date.now(), false);
  }

  /* commento della partita (summary ESPN): "First Half ends" / "Match ends" arrivano subito */
  async periodEnds(e, base) {
    const r = await fetch(`${base}/${e.espn}/summary?event=${e.id.split("-").pop()}`, { cf: { cacheTtl: 0 } });
    if (!r.ok) return {};
    const s = await r.json();
    const ke = (s.keyEvents || []).map(k => String(k.type?.type || ""));
    const txt = (s.commentary || []).slice(-6).map(c => String(c.text || "")).join(" | ");
    return { ht: ke.includes("halftime") || /First Half ends/i.test(txt), ft: ke.some(t => /full-time|end-regular-time|match-end/.test(t)) || /Match ends/i.test(txt) };
  }

  /* chiamato ogni minuto dal timer, con l'elenco delle partite (index.json del sito) */
  async tick({ events = [] }) {
    const t0 = Date.now();
    const status = { tick: new Date().toISOString(), subs: 0, watched: 0, boards: 0, sent: 0, errors: [] };
    const subs = [...(await this.store.list({ prefix: "sub:" })).entries()];
    status.subs = subs.length;
    const now = Date.now();
    // partite in finestra: da 5 minuti prima del via fino a 4 ore dopo (10 nel tennis, gli orari sono indicativi)
    const live = events.filter(e => e.espn && !e.final && (() => {
      const t = Date.parse(e.date);
      return t <= now + (e.sport === "soccer" ? 80 : 5) * 60e3 && t >= now - (e.sport === "tennis" ? 10 : 4) * 3600e3;
    })());
    // chi segue cosa
    const followers = new Map();       // id partita -> [chiave abbonamento]
    for (const [key, s] of subs) {
      const mine = new Set(s.mine?.events || []), teams = new Set(s.mine?.teams || []);
      for (const e of live) {
        const p = (s.prefs || DEFAULT_PREFS)[e.sport];
        if (!p?.on) continue;
        if (p.mode === "all" || mine.has(e.id) || (e.league !== "champions-femminile" && (teams.has(norm(e.home)) || teams.has(norm(e.away))))) {
          if (!followers.has(e.id)) followers.set(e.id, []);
          followers.get(e.id).push(key);
        }
      }
    }
    // partite delle schedine salvate: si leggono per sapere l'esito (gli avvisi di gol ecc. solo se seguite)
    const slipPoll = new Set();
    for (const [, s] of subs) if (gen(s).slips) for (const sl of s.mine?.slips || []) for (const l of sl.legs) slipPoll.add(l.event);
    // il tennis si segue sempre (per la cronaca game per game); il resto solo se qualcuno lo segue
    const watched = live.filter(e => (followers.has(e.id) || slipPoll.has(e.id) || e.sport === "tennis") && (e.sport === "soccer" ? Date.parse(e.date) <= now + 5 * 60e3 || followers.has(e.id) : true));
    status.watched = watched.length;
    const outbox = [];
    const subMap = new Map(subs);
    const keys = await this.keys();
    await this.extras(subs, events, live, followers, outbox, now, status);
    if (!watched.length) { await this.slipResults(subs, events, {}, outbox, now); return this.finish(outbox, keys, status, now, t0); }
    // un tabellone per competizione
    const groups = new Map();
    for (const e of watched) {
      if (!groups.has(e.espn)) groups.set(e.espn, []);
      groups.get(e.espn).push(e);
    }
    const paths = [...groups.keys()].slice(0, MAX_BOARDS);
    status.boards = paths.length;
    const base = this.env.ESPN_BASE || ESPN;
    const boards = await Promise.all(paths.map(p => fetch(`${base}/${p}/scoreboard`, { cf: { cacheTtl: 0 } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${p}: ${r.status}`)))
      .catch(err => { status.errors.push(String(err.message || err)); return null; })));
    const snaps = {};
    paths.forEach((p, i) => {
      if (!boards[i]) return;
      const evs = groups.get(p), sport = evs[0].sport;
      const espnId = e => e.id.split("-").pop();
      const got = snapsFromBoard(sport, boards[i], new Set(evs.map(espnId)));
      for (const e of evs) if (got[espnId(e)]) snaps[e.id] = got[espnId(e)];
    });
    const ids = Object.keys(snaps);
    const prevMap = ids.length ? await this.store.get(ids.map(id => "st:" + id)) : new Map();
    const byId = new Map(watched.map(e => [e.id, e]));
    const logs = {};
    for (const id of ids) {
      const e = byId.get(id), cur = snaps[id], prev = prevMap.get("st:" + id);
      if (e.sport === "nba") {
        const endish = /END_PERIOD|HALFTIME/.test(cur.nm);
        cur.qn = Math.max(prev?.qn ?? 0, cur.st === "post" ? cur.p - 1 : endish ? cur.p : cur.p - 1);
      }
      cur.t = now;
      if (e.sport === "soccer") {
        // vicino alla fine di un tempo, per le partite seguite si legge anche il commento (arriva prima del tabellone)
        const nearHT = cur.st === "in" && cur.p === 1 && cur.min >= 44 && !prev?.htDone && cur.nm !== "STATUS_HALFTIME";
        const nearFT = cur.st === "in" && cur.p >= 2 && cur.min >= 88 && !prev?.ftDone;
        if ((nearHT || nearFT) && (followers.get(id) || []).length) {
          const flags = await this.periodEnds(e, base).catch(() => ({}));
          if (nearHT && flags.ht) cur.htFlag = true;
          if (nearFT && flags.ft) cur.ftFlag = true;
        }
        cur.htDone = !!(prev?.htDone || cur.htFlag || cur.nm === "STATUS_HALFTIME" || cur.p >= 2);
        cur.ftDone = !!(prev?.ftDone || cur.ftFlag || cur.st === "post");
      }
      if (e.sport === "tennis") {
        const changed = !prev || JSON.stringify(prev.sets) !== JSON.stringify(cur.sets);
        if (changed) logs["log:" + id] = tennisLogStep((await this.store.get("log:" + id)) || [], prev, cur, now);
      }
      for (const [k, [type, title, body]] of diff(e.sport, prev, cur, e).entries()) {
        for (const key of followers.get(id) || []) {
          const s = subMap.get(key);
          const p = (s.prefs || DEFAULT_PREFS)[e.sport] || {};
          if (!p[type]) continue;
          outbox.push({ key, s, payload: { title, body, tag: type === "game" ? `${id}-game` : `${id}-${type}-${now}-${k}`, url: `#/e/${id}` } });
        }
      }
    }
    await this.store.put({ ...Object.fromEntries(ids.map(id => ["st:" + id, snaps[id]])), ...logs });
    await this.slipResults(subs, events, snaps, outbox, now);
    return this.finish(outbox, keys, status, now, t0);
  }

  async finish(outbox, keys, status, now, t0, save = true) {
    // invio (al massimo 40 per minuto: il resto lo coprirebbe il minuto dopo, ma qui conta la diretta)
    const origin = await this.store.get("origin") || "https://pronostici.pages.dev";
    // in ordine (gol prima del fischio finale), un telefono alla volta in parallelo
    const perSub = new Map();
    for (const o of outbox.slice(0, 40)) { if (!perSub.has(o.key)) perSub.set(o.key, []); perSub.get(o.key).push(o); }
    const results = (await Promise.all([...perSub.values()].map(async list => {
      const out = [];
      for (const o of list) out.push(await sendPush(o.s.sub, o.payload, keys, o.s.origin || origin).then(code => ({ o, code })).catch(err => ({ o, code: 0, err })));
      return out;
    }))).flat();
    for (const { o, code, err } of results) {
      if (code === 404 || code === 410) await this.store.delete(o.key);      // il telefono ha disattivato le notifiche
      else if (code >= 300 || err) status.errors.push(`invio: ${code || err?.message}`);
      else status.sent++;
    }
    // pulizia: istantanee delle partite vecchie (una volta l'ora)
    if (new Date().getUTCMinutes() === 7) {
      const old = [...(await this.store.list({ prefix: "st:" })).entries()].filter(([, v]) => now - (v.t || 0) > 2 * 86400e3).map(([k]) => k);
      if (old.length) await this.store.delete([...old, ...old.map(k => "log:" + k.slice(3))].slice(0, 128));
    }
    status.ms = Date.now() - t0;
    status.errors = status.errors.slice(0, 10);
    if (save) await this.store.put("status", status);
    return status;
  }
}
