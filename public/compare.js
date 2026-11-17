"use strict";
/* Confronta (#/confronta/<a>/<b>): due squadre dello stesso sport o due tennisti, anche se non si affrontano.
   Ogni scelta è un "gettone" nel link: t:<campionato>:<id ESPN> per le squadre, p:<atp|wta>:<nome> per i tennisti.
   Dati dai file già pubblicati (classifiche e profili): nessuna richiesta nuova. */

const cmpTok = x => x.kind === "p" ? `p:${x.tour}:${x.name}` : `t:${x.lk}:${x.id}`;
function cmpParse(tok) {
  if (!tok) return null;
  const [k, a, ...rest] = decodeURIComponent(tok).split(":");
  return k === "p" ? { kind: "p", tour: a, name: rest.join(":") } : k === "t" ? { kind: "t", lk: a, id: rest.join(":") } : null;
}
async function cmpLoad(x) {
  if (!x) return null;
  if (x.kind === "p") {
    const T = await getJSON(`data/tennis/${x.tour}.json`).catch(() => null);
    const P = T?.players?.[x.name] || Object.values(T?.players || {}).find(p => p.name === x.name);
    return P ? { ...x, sport: "tennis", data: P, label: P.name, sub: x.tour.toUpperCase(), photo: P.photo } : null;
  }
  const L = await leagueData(x.lk);
  const T = L?.teams?.[x.id];
  return T ? { ...x, sport: x.lk === "nba" ? "nba" : "soccer", data: T, L, label: T.name, sub: L.name, logo: T.logo,
    color: T.color ? "#" + String(T.color).replace("#", "") : null } : null;
}
const cmpSportOf = x => !x ? null : x.kind === "p" ? "tennis" : x.lk === "nba" ? "nba" : "soccer";

async function showCompare(ta, tb) {
  const A0 = cmpParse(ta), B0 = cmpParse(tb);
  $app.innerHTML = backBtn("Indietro") + `<h1 class="page-h">Confronta</h1><p class="muted" style="padding:8px 4px">Caricamento…</p>`;
  const [A, B] = await Promise.all([cmpLoad(A0), cmpLoad(B0)]);
  if (!location.hash.startsWith("#/confronta")) return;
  const slot = (X, which) => X
    ? `<button type="button" class="cmp-slot set" data-pick="${which}" style="--tc:${X.color || (X.kind === "p" ? "#3b82f6" : "#0a9b5a")}">
        <span class="cmp-av">${X.logo ? img(X.logo, "tlogo") : X.photo ? img(X.photo, "cmp-ph") : `<span class="mono">${esc(initials(X.label))}</span>`}</span>
        <b>${esc(X.kind === "p" ? lastName(X.label) : X.data.short || X.label)}</b><small>${esc(X.sub)}</small><em>cambia</em></button>`
    : `<button type="button" class="cmp-slot" data-pick="${which}"><span class="cmp-plus">+</span><b>Scegli</b><small>${which === "a" ? "squadra o tennista" : B0 || A0 ? `stesso sport` : "squadra o tennista"}</small></button>`;
  let body = "";
  if (A && B) body = A.sport === "tennis" ? cmpTennis(A, B) : A.sport === "nba" ? cmpNba(A, B) : cmpSoccer(A, B);
  else body = `<div class="empty"><b>Scegli due squadre o due tennisti</b>Anche di campionati diversi: confronto di forza, forma e statistiche di stagione.</div>`;
  $app.innerHTML = backBtn("Indietro") + `<h1 class="page-h">Confronta</h1>
    <div class="cmp-head">${slot(A, "a")}<span class="cmp-vs">VS</span>${slot(B, "b")}</div>${body}`;
  $app.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => cmpPicker(b.dataset.pick, A0, B0));
  if (typeof wire === "function" && A && B) wire(A.sport === "tennis" ? "tennis" : A.sport);
}

/* scelta in una finestra dal basso, con la ricerca; l'altra scelta decide lo sport */
async function cmpPicker(which, A0, B0) {
  const other = which === "a" ? B0 : A0, sp = cmpSportOf(other);
  const { el, close } = openSheet(`<h3 class="sheet-t">Scegli ${sp === "tennis" ? "un tennista" : sp ? "una squadra" : "squadra o tennista"}</h3>
    <div class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
    <input type="search" id="cmp-q" placeholder="Scrivi un nome…" autocomplete="off" aria-label="Cerca"></div><div class="cmp-res" id="cmp-res"><p class="note">Caricamento…</p></div>`, { label: "Scegli cosa confrontare" });
  const pool = await searchPool();
  const inp = el.querySelector("#cmp-q"), res = el.querySelector("#cmp-res");
  const all = [
    ...(sp === "tennis" ? [] : pool.teams.filter(t => !sp || (sp === "nba") === (t.lk === "nba")).map(t => ({ kind: "t", lk: t.lk, id: t.id, name: t.name, sub: t.league, logo: t.logo, rank: -(t.pos || 99) }))),
    ...(sp && sp !== "tennis" ? [] : pool.players.map(p => ({ kind: "p", tour: p.tour, name: p.name, sub: p.tour.toUpperCase(), logo: p.photo, rank: p.elo || 0 }))),
  ];
  const draw = () => {
    const q = inp.value.trim();
    const list = (q ? all.filter(x => searchMatch(q, x.name)) : all.slice().sort((a, b) => b.rank - a.rank)).slice(0, 30);
    res.innerHTML = list.length ? list.map((x, i) => `<button type="button" class="cmp-opt" data-i="${i}">${x.logo ? img(x.logo, x.kind === "p" ? "srch-ph" : "tlogo") : `<span class="srch-ph none">${x.kind === "p" ? "🎾" : "⚽"}</span>`}<span><b>${esc(x.name)}</b><small>${esc(x.sub)}</small></span></button>`).join("")
      : `<p class="note">Nessun risultato.</p>`;
    res.querySelectorAll("[data-i]").forEach(b => b.onclick = () => {
      const x = list[+b.dataset.i], tok = encodeURIComponent(cmpTok(x));
      const keep = other ? encodeURIComponent(cmpTok(other)) : "";
      close();
      location.hash = which === "a" ? `#/confronta/${tok}${keep ? "/" + keep : ""}` : `#/confronta/${keep || "-"}/${tok}`;
    });
  };
  inp.oninput = draw; draw(); setTimeout(() => inp.focus(), 60);
}

function cmpColors(A, B) {
  const a = A.color && usable(A.color) ? A.color : "#0a9b5a";
  let b = B.color && usable(B.color) ? B.color : "#3b82f6";
  if (a === b) b = "#8b5cf6";
  return [a, b];
}
const cmpName = X => X.kind === "p" ? lastName(X.label) : X.data.short || X.label;

/* barra "chi è più forte": due metà colorate */
function cmpVerdict(A, B, pA, txt, cA, cB) {
  return `<section class="sec cmp-verdict"><h2>${txt}</h2>
    <div class="cmp-bar"><span style="width:${(pA * 100).toFixed(1)}%;background:${cA}"></span><span style="width:${((1 - pA) * 100).toFixed(1)}%;background:${cB}"></span></div>
    <div class="cmp-bar-l"><b style="color:${cA}">${esc(cmpName(A))} ${pct(pA)}</b><b style="color:${cB}">${pct(1 - pA)} ${esc(cmpName(B))}</b></div>
    <p class="note">Stima indicativa di una sfida a campo neutro, dai numeri di stagione: non è un pronostico su una partita in calendario.</p></section>`;
}

function cmpSoccer(A, B) {
  const [cA, cB] = cmpColors(A, B), a = A.data, b = B.data, sa = a.season || {}, sb = b.season || {};
  // forza: gol fatti e subiti a partita rispetto alla media del proprio campionato (Poisson a campo neutro)
  const avg = L => { const t = L.table || []; const g = t.reduce((s, r) => s + (r.gf || 0), 0), n = t.reduce((s, r) => s + (r.p || 0), 0); return n ? g / n : 1.35; };
  const mA = avg(A.L), mB = avg(B.L), base = (mA + mB) / 2;
  const lA = base * ((sa.gf || mA) / mA) * ((sb.ga || mB) / mB), lB = base * ((sb.gf || mB) / mB) * ((sa.ga || mA) / mA);
  let w = 0, d = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = poisson(lA, i) * poisson(lB, j); if (i > j) w += p; else if (i === j) d += p; }
  const same = A.lk === B.lk;
  const verdict = `<section class="sec cmp-verdict"><h2>Se si affrontassero</h2>
    <div class="cmp-bar three"><span style="width:${(w * 100).toFixed(1)}%;background:${cA}"></span><span style="width:${(d * 100).toFixed(1)}%;background:var(--ink-3)"></span><span style="width:${((1 - w - d) * 100).toFixed(1)}%;background:${cB}"></span></div>
    <div class="cmp-bar-l"><b style="color:${cA}">${esc(cmpName(A))} ${pct(w)}</b><span>pareggio ${pct(d)}</span><b style="color:${cB}">${pct(1 - w - d)} ${esc(cmpName(B))}</b></div>
    <p class="note">Stima indicativa a campo neutro dai gol fatti e subiti in stagione${same ? "" : ", rapportati alla media di ciascun campionato: tra campionati diversi è solo un'idea di massima"}. Gol attesi ${num(lA, 1)} – ${num(lB, 1)}.</p></section>`;
  const p2 = x => x != null ? pct(x) : "–";
  const rows = [
    same ? ["Posizione", a.pos, b.pos, "lo", x => x ? `${x}ª` : "–"] : ["Campionato", A.L.name, B.L.name],
    ["Punti a partita", sa.n ? sa.pts / sa.n : null, sb.n ? sb.pts / sb.n : null, "hi", x => x != null ? num(x, 2) : "–"],
    ["Vinte, pari, perse", `${sa.w ?? 0}-${sa.d ?? 0}-${sa.l ?? 0}`, `${sb.w ?? 0}-${sb.d ?? 0}-${sb.l ?? 0}`],
    ["Gol fatti a partita", sa.gf, sb.gf, "hi", x => x != null ? num(x, 2) : "–"],
    ["Gol subiti a partita", sa.ga, sb.ga, "lo", x => x != null ? num(x, 2) : "–"],
    ["Over 2,5", sa.over25, sb.over25, "none", p2], ["Goal", sa.btts, sb.btts, "none", p2],
    ["Porta inviolata", sa.clean, sb.clean, "hi", p2],
    ["Tiri a partita", sa.shots_f, sb.shots_f, "hi", x => x != null ? num(x, 1) : "–"],
    ["Tiri in porta a partita", sa.sot_f, sb.sot_f, "hi", x => x != null ? num(x, 1) : "–"],
    ["Angoli a partita", sa.corners_f, sb.corners_f, "hi", x => x != null ? num(x, 1) : "–"],
  ];
  return verdict + sec("Stagione", vsTable(cmpName(A), cmpName(B), cA, cB, rows), `${sa.n ?? 0} e ${sb.n ?? 0} partite`, "Confronto stagione")
    + sec("Forma", formStrip(cmpName(A), cmpName(B), cA, cB, (a.form10 || sa).seq?.slice(0, 10), (b.form10 || sb).seq?.slice(0, 10)), "ultime 10", "Confronto forma")
    + cmpPlayers(A, B, cA, cB);
}

function cmpNba(A, B) {
  const [cA, cB] = cmpColors(A, B), a = A.data, b = B.data, sa = a.season || {}, sb = b.season || {};
  const mA = (sa.pf ?? 110) - (sa.pa ?? 110), mB = (sb.pf ?? 110) - (sb.pa ?? 110);
  const pA = normCdf(((mA - mB) / 2) / 13);
  return cmpVerdict(A, B, pA, "Se si affrontassero", cA, cB)
    + sec("Stagione", vsTable(cmpName(A), cmpName(B), cA, cB, [
      ["Conference", a.group ? `${a.pos ?? ""}ª ${a.group}` : "–", b.group ? `${b.pos ?? ""}ª ${b.group}` : "–"],
      ["Vinte, perse", `${a.record?.w ?? 0}-${a.record?.l ?? 0}`, `${b.record?.w ?? 0}-${b.record?.l ?? 0}`],
      ["Punti fatti", sa.pf, sb.pf, "hi", x => x != null ? num(x, 1) : "–"],
      ["Punti subiti", sa.pa, sb.pa, "lo", x => x != null ? num(x, 1) : "–"],
      ["Differenza a partita", mA, mB, "hi", x => `${x > 0 ? "+" : ""}${num(x, 1)}`],
      ["Punti totali a partita", sa.total, sb.total, "none", x => x != null ? num(x, 1) : "–"],
      ["In casa", a.home_season ? `${a.home_season.w}-${a.home_season.l}` : "–", b.home_season ? `${b.home_season.w}-${b.home_season.l}` : "–"],
      ["In trasferta", a.away_season ? `${a.away_season.w}-${a.away_season.l}` : "–", b.away_season ? `${b.away_season.w}-${b.away_season.l}` : "–"],
    ]), `${sa.n ?? 0} e ${sb.n ?? 0} partite`, "Confronto stagione NBA")
    + sec("Forma", formStrip(cmpName(A), cmpName(B), cA, cB, a.form10?.seq, b.form10?.seq), "ultime 10", "Confronto forma NBA")
    + cmpPlayers(A, B, cA, cB);
}

/* i tre giocatori migliori di ciascuna */
function cmpPlayers(A, B, cA, cB) {
  const ga = p => (p.tot?.g ?? 0) * 2 + (p.tot?.a ?? 0);
  const top = X => (X.data.players || []).slice().sort((p, q) => X.sport === "nba" ? (q.pts || 0) - (p.pts || 0) : ga(q) - ga(p)).slice(0, 3);
  const pa = top(A), pb = top(B);
  if (!pa.length && !pb.length) return "";
  const line = (p, X) => X.sport === "nba" ? `${num(p.pts, 1)} punti, ${num(p.reb, 1)} rimbalzi, ${num(p.ast, 1)} assist`
    : p.tot ? `${p.tot.g ?? 0} gol, ${p.tot.a ?? 0} assist in ${p.apps ?? "?"} presenze` : "";
  const col = (ps, X, c) => `<div class="cmp-pl"><b style="color:${c}">${esc(cmpName(X))}</b>${ps.map(p => `<div><span>${esc(p.name)}</span><small>${esc(line(p, X))}</small></div>`).join("") || `<small class="faint">nessun dato</small>`}</div>`;
  return sec("Giocatori di punta", `<div class="cmp-pls">${col(pa, A, cA)}${col(pb, B, cB)}</div>`, "", "Confronto giocatori");
}

function cmpTennis(A, B) {
  const a = A.data, b = B.data;
  const [cA, cB] = typeof flagColors === "function" ? flagColors(a.cc, b.cc) : ["#0a9b5a", "#3b82f6"];
  const pElo = (x, y) => 1 / (1 + 10 ** ((y - x) / 400));
  const SURF = { Hard: "Cemento", Clay: "Terra", Grass: "Erba" };
  const surfRows = ["Hard", "Clay", "Grass"].map(s => [`Elo su ${SURF[s].toLowerCase()}`, a.surfaces?.[s]?.elo, b.surfaces?.[s]?.elo, "hi"]);
  const wl = r => r ? `${r.w}-${r.l}` : "–";
  const surfP = ["Hard", "Clay", "Grass"].map(s => {
    const x = a.surfaces?.[s]?.elo, y = b.surfaces?.[s]?.elo;
    return x && y ? `<span><small>${SURF[s]}</small><b>${pct(pElo(x, y))}</b></span>` : "";
  }).join("");
  return cmpVerdict(A, B, pElo(a.elo, b.elo), "Se si affrontassero", cA, cB).replace("</h2>", "</h2>").replace("<p class=\"note\">", `<div class="cmp-surf">${surfP}</div><p class="note">`)
    + sec("Forza e risultati", vsTable(cmpName(A), cmpName(B), cA, cB, [
      ["Elo", a.elo, b.elo, "hi"], ...surfRows,
      ["Quest'anno", wl(a.year), wl(b.year)], ["Ultimi 12 mesi", wl(a.y365), wl(b.y365)],
    ]), "", "Confronto tennis")
    + sec("Forma", formStrip(cmpName(A), cmpName(B), cA, cB, (a.last || []).slice(0, 10).map(m => m.res), (b.last || []).slice(0, 10).map(m => m.res)), "ultimi 10", "Confronto forma tennis");
}
