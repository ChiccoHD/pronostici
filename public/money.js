/* Il tuo conto (Tu), schedina a sistema (Schedina), cerca per quota (Migliori).
   Tutto sul telefono: niente server. L'app non scommette: i conti usano quota e puntata che scrivi tu. */

/* ------------------------------------------------------------------ il tuo conto */
const SPN2 = { soccer: "Calcio", nba: "Basket", tennis: "Tennis", f1: "F1" };
function moneySection() {
  const rows = mySlips().filter(s => s.played && s.odds && s.stake).map(s => {
    const st = slipState(s), q = Number(s.odds), k = Number(s.stake);
    const end = s.legs.map(l => l.date || "").sort().pop() || s.played;
    const sp = new Set(s.legs.map(l => l.sport || "soccer"));
    let net = null;
    if (st.cls === "win") net = st.txt === "Rimborsata" ? 0 : k * (q - 1);
    else if (st.cls === "lose") net = -k;
    return { s, q, k, net, end, sport: sp.size === 1 ? [...sp][0] : "mix", legs: s.legs.length };
  });
  if (!rows.length) return "";
  const done = rows.filter(r => r.net != null).sort((a, b) => a.end.localeCompare(b.end));
  const open = rows.filter(r => r.net == null);
  const staked = done.reduce((a, r) => a + r.k, 0), net = done.reduce((a, r) => a + r.net, 0);
  const eur = x => `${x < 0 ? "−" : x > 0 ? "+" : ""}${num(Math.abs(x), 2)} €`;
  const roi = staked ? net / staked : 0;
  // grafico del saldo nel tempo
  let chart = "";
  if (done.length >= 2) {
    const pts = [0]; let c = 0;
    for (const r of done) { c += r.net; pts.push(c); }
    const W = 320, H = 110, lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), sp = hi - lo || 1;
    const X = i => 6 + i * (W - 12) / (pts.length - 1), Y = v => 8 + (hi - v) * (H - 16) / sp;
    const line = pts.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    const col = c >= 0 ? "var(--go)" : "var(--loss)";
    chart = `<svg class="mo-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo nel tempo: ${eur(c)}">
      <line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" class="mo-zero"/>
      <path d="${line} L${X(pts.length - 1)},${Y(0)} L${X(0)},${Y(0)} Z" fill="${col}" opacity=".16"/>
      <path d="${line}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((v, i) => i ? `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" fill="${col}"/>` : "").join("")}</svg>`;
  }
  const group = (key, name) => {
    const m = new Map();
    for (const r of done) { const k = key(r); const o = m.get(k) || { n: 0, k: 0, net: 0, w: 0 }; o.n++; o.k += r.k; o.net += r.net; o.w += r.net > 0; m.set(k, o); }
    return [...m].sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<div class="r"><span class="l">${esc(name(k))} <span class="faint">${o.w} vinte su ${o.n}</span></span>
      <span class="v num ${o.net >= 0 ? "mo-pos" : "mo-neg"}">${eur(o.net)} <span class="faint">${o.k ? `${o.net >= 0 ? "+" : "−"}${Math.round(Math.abs(o.net / o.k) * 100)}%` : ""}</span></span></div>`).join("");
  };
  const bySport = group(r => r.sport, k => k === "mix" ? "Più sport" : `${SPORT_ICON[k] || ""} ${SPN2[k] || k}`);
  const byLegs = group(r => r.legs === 1 ? "1" : r.legs <= 3 ? "2-3" : r.legs <= 5 ? "4-5" : "6+", k => k === "1" ? "Singole" : `${k} giocate`);
  const byOdds = group(r => r.q < 2 ? "a" : r.q < 4 ? "b" : r.q < 10 ? "c" : "d", k => ({ a: "Quota sotto 2", b: "Quota 2-4", c: "Quota 4-10", d: "Quota 10 e più" }[k]));
  const tile = (v, l, cls = "") => `<div class="mo-t ${cls}"><b>${v}</b><span>${l}</span></div>`;
  return sec("Il tuo conto", `<div class="mo-tiles">${tile(eur(net), "saldo", net >= 0 ? "mo-pos" : "mo-neg")}${tile(`${roi >= 0 ? "+" : "−"}${Math.round(Math.abs(roi) * 100)}%`, "resa sulle puntate", roi >= 0 ? "mo-pos" : "mo-neg")}
      ${tile(`${num(staked, 0)} €`, "puntati")}${tile(`${done.filter(r => r.net > 0).length}/${done.length}`, "schedine vinte")}</div>
    ${chart}${open.length ? `<p class="note">In gioco: ${open.length} ${open.length === 1 ? "schedina" : "schedine"} per ${num(open.reduce((a, r) => a + r.k, 0), 2)} €.</p>` : ""}
    ${done.length ? `<h3 class="lb-h3">Per sport</h3><div class="rows">${bySport}</div><h3 class="lb-h3">Per numero di giocate</h3><div class="rows">${byLegs}</div><h3 class="lb-h3">Per quota</h3><div class="rows">${byOdds}</div>` : ""}
    <p class="note">Solo le schedine segnate come giocate con quota e puntata. La resa è il guadagno diviso quanto hai puntato. Le giocate rimborsate contano come scritto nella quota.</p>`,
    done.length ? `${done.length} chiuse` : "", "Il tuo conto");
}

/* ------------------------------------------------------------------ schedina a sistema */
function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
function combos(arr, k) {
  const out = [], cur = [];
  const go = i => { if (cur.length === k) { out.push(cur.slice()); return; } for (let j = i; j < arr.length; j++) { cur.push(arr[j]); go(j + 1); cur.pop(); } };
  go(0); return out;
}
function systemBox(legs) {
  legs = (legs || []).filter(f => f.p > 0 && f.p < 1);
  if (legs.length < 3 || legs.length > 10) return "";
  const n = legs.length;
  // probabilità di indovinarne esattamente k (giocate indipendenti)
  let dist = [1];
  for (const f of legs) { const nd = Array(dist.length + 1).fill(0); dist.forEach((v, i) => { nd[i] += v * (1 - f.p); nd[i + 1] += v * f.p; }); dist = nd; }
  const atLeast = k => dist.slice(k).reduce((a, b) => a + b, 0);
  const rows = [];
  for (let k = 2; k <= n; k++) {
    const cs = combos(legs, k), nc = cs.length;
    const minWin = Math.min(...cs.map(c => c.reduce((x, f) => x / f.p, 1)));
    rows.push(`<div class="sy-r"><span><b>Sistema ${k}/${n}</b><small>${nc} ${nc === 1 ? "combinazione" : "combinazioni"}</small></span>
      <span class="sy-p">${pct(atLeast(k))}<small>almeno ${k} giuste</small></span><span class="sy-q">da ${num(minWin, 2)}<small>quota min. combinazione</small></span></div>`);
  }
  const bars = dist.map((v, k) => `<span class="sy-b" title="${k} giuste: ${pct(v)}"><i style="height:${Math.max(2, Math.round(v * 100))}%"></i><small>${k}</small></span>`).join("");
  return sec("Schedina a sistema", `<p class="note" style="margin-top:0">Con un sistema vinci qualcosa anche se sbagli qualche giocata. Probabilità dal modello, giocate considerate indipendenti.</p>
    <div class="sy-dist">${bars}</div><p class="note" style="margin:2px 0 8px;text-align:center">quante giuste su ${n}</p>
    <div class="sy-l">${rows.join("")}</div>
    <p class="note">«Quota min. combinazione» è la quota equa della combinazione più bassa che puoi prendere: se ne indovini esattamente k, vincono solo le combinazioni fatte tutte di giocate giuste. Più il sistema è basso, più è facile ma meno paga.</p>`, `${n} giocate`, "Sistema");
}

/* ------------------------------------------------------------------ cerca per quota (Migliori) */
const ODD_BANDS = [["all", "Ogni quota"], ["a", "1,10–1,40"], ["b", "1,40–1,80"], ["c", "1,80–2,50"], ["d", "2,50+"]];
const oddBand = q => q < 1.1 ? "x" : q < 1.4 ? "a" : q < 1.8 ? "b" : q < 2.5 ? "c" : "d";
function oddBandRow(items) {
  const cur = load("best_odds", "all");
  const n = { all: items.length };
  for (const it of items) { const b = oddBand(1 / it.p); n[b] = (n[b] || 0) + 1; }
  return `<div class="ob-row" role="group" aria-label="Quota equa">${ODD_BANDS.map(([k, l]) => `<button type="button" class="nt-chip" data-ob="${k}" aria-pressed="${cur === k}" ${k !== "all" && !n[k] ? "disabled" : ""}>${l}${k !== "all" ? ` <b>${n[k] || 0}</b>` : ""}</button>`).join("")}</div>`;
}
const oddBandOk = it => { const cur = load("best_odds", "all"); return cur === "all" || oddBand(1 / it.p) === cur; };
