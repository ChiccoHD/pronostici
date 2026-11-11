// Notifiche delle partite: un Durable Object (gratuito, con archivio SQLite) tiene gli abbonamenti dei telefoni,
// ogni minuto legge da ESPN il tabellone delle sole competizioni con partite seguite in corso,
// confronta con il minuto prima e manda gol, espulsioni, fine tempo/quarto/set/game e fine partita.
import { newVapidKeys, sendPush } from "./webpush.js";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const MAX_BOARDS = 30;              // tabelloni letti al massimo per minuto
const MAX_SUBS = 200;

export const DEFAULT_PREFS = {
  soccer: { on: true, mode: "mine", start: false, goal: true, red: true, ht: true, end: true },
  nba: { on: true, mode: "mine", start: false, quarter: true, end: true },
  tennis: { on: true, mode: "mine", start: false, game: false, set: true, end: true },
};

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
  return {
    st: ty.state || "pre", nm: ty.name || "", p: st.period || 0, det: ty.shortDetail || "",
    h: num(side.home.score), a: num(side.away.score), hn: tn(side.home), an: tn(side.away),
    ls: [side.home, side.away].map(x => (x.linescores || []).map(l => num(l.value))), goals, reds,
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
    if (cur.nm === "STATUS_HALFTIME" && prev.nm !== "STATUS_HALFTIME") out.push(["ht", `Fine primo tempo: ${score}`, `Intervallo${where}`]);
  }
  if (sport === "nba") {
    const endish = /END_PERIOD|HALFTIME/.test(cur.nm);
    const done = cur.st === "post" ? cur.p - 1 : endish ? cur.p : cur.p - 1;
    for (let q = (prev.qn ?? Math.max(0, (/END_PERIOD|HALFTIME/.test(prev.nm) ? prev.p : prev.p - 1))) + 1; q <= done; q++) {
      const hq = cur.ls[0].slice(0, q).reduce((x, y) => x + y, 0), aq = cur.ls[1].slice(0, q).reduce((x, y) => x + y, 0);
      out.push(["quarter", `Fine ${qName(q, "nba")}: ${cur.hn} ${hq}-${aq} ${cur.an}`, `Parziale del quarto ${cur.ls[0][q - 1] ?? "–"}-${cur.ls[1][q - 1] ?? "–"}${where}`]);
    }
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
    if (!setEnded && cur.st === "in" && cur.gt > (prev.gt || 0) && prev.st === "in") {
      out.push(["game", `${last(cur.hn)} – ${last(cur.an)}: ${setsTxt(cur)}`, `Game concluso${cur.comp ? ` · ${cur.comp}` : ""}`]);
    }
  }
  if (cur.st === "post" && prev.st !== "post") {
    if (sport === "tennis") {
      const w = cur.w ?? 0;
      out.push(["end", `${last(w === 0 ? cur.hn : cur.an)} batte ${last(w === 0 ? cur.an : cur.hn)}`, `${setsTxt(cur)}${/RET/i.test(cur.nm + cur.det) ? " (ritiro)" : ""}${cur.comp ? ` · ${cur.comp}` : ""}`]);
    } else {
      out.push(["end", `Finita: ${score}`, `${/OT|AET|PEN/i.test(cur.det) ? `${cur.det} · ` : ""}Tocca per il confronto con il pronostico${where}`]);
    }
  }
  return out;
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
      if (path === "key") return json({ key: (await this.keys()).publicKey });
      if (path === "status") return json(await this.store.get("status") || {});
      if (path === "tick" && request.method === "POST") return json(await this.tick(await request.json()));
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
          mine: { events: (mine.events || []).slice(0, 600).map(String), teams: (mine.teams || []).slice(0, 100).map(norm).filter(Boolean) },
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

  /* chiamato ogni minuto dal timer, con l'elenco delle partite (index.json del sito) */
  async tick({ events = [] }) {
    const t0 = Date.now();
    const status = { tick: new Date().toISOString(), subs: 0, watched: 0, boards: 0, sent: 0, errors: [] };
    const subs = [...(await this.store.list({ prefix: "sub:" })).entries()];
    status.subs = subs.length;
    if (!subs.length) { await this.store.put("status", status); return status; }
    const now = Date.now();
    // partite in finestra: da 5 minuti prima del via fino a 4 ore dopo (10 nel tennis, gli orari sono indicativi)
    const live = events.filter(e => e.espn && !e.final && (() => {
      const t = Date.parse(e.date);
      return t <= now + 5 * 60e3 && t >= now - (e.sport === "tennis" ? 10 : 4) * 3600e3;
    })());
    // chi segue cosa
    const followers = new Map();       // id partita -> [chiave abbonamento]
    for (const [key, s] of subs) {
      const mine = new Set(s.mine?.events || []), teams = new Set(s.mine?.teams || []);
      for (const e of live) {
        const p = (s.prefs || DEFAULT_PREFS)[e.sport];
        if (!p?.on) continue;
        if (p.mode === "all" || mine.has(e.id) || teams.has(norm(e.home)) || teams.has(norm(e.away))) {
          if (!followers.has(e.id)) followers.set(e.id, []);
          followers.get(e.id).push(key);
        }
      }
    }
    const watched = live.filter(e => followers.has(e.id));
    status.watched = watched.length;
    if (!watched.length) { await this.store.put("status", status); return status; }
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
    const keys = await this.keys();
    const subMap = new Map(subs);
    const outbox = [];
    const byId = new Map(watched.map(e => [e.id, e]));
    for (const id of ids) {
      const e = byId.get(id), cur = snaps[id], prev = prevMap.get("st:" + id);
      if (e.sport === "nba") {
        const endish = /END_PERIOD|HALFTIME/.test(cur.nm);
        cur.qn = Math.max(prev?.qn ?? 0, cur.st === "post" ? cur.p - 1 : endish ? cur.p : cur.p - 1);
      }
      cur.t = now;
      for (const [k, [type, title, body]] of diff(e.sport, prev, cur, e).entries()) {
        for (const key of followers.get(id) || []) {
          const s = subMap.get(key);
          const p = (s.prefs || DEFAULT_PREFS)[e.sport] || {};
          if (!p[type]) continue;
          outbox.push({ key, s, payload: { title, body, tag: type === "game" ? `${id}-game` : `${id}-${type}-${now}-${k}`, url: `#/e/${id}` } });
        }
      }
    }
    await this.store.put(Object.fromEntries(ids.map(id => ["st:" + id, snaps[id]])));
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
      if (old.length) await this.store.delete(old.slice(0, 128));
    }
    status.ms = Date.now() - t0;
    status.errors = status.errors.slice(0, 10);
    await this.store.put("status", status);
    return status;
  }
}
