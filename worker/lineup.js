/* Avviso formazioni: chi manca tra i giocatori importanti e quanto cambiano le percentuali.
   Stessa stima di lineupImpact in public/app.js (gol attesi più bassi per chi parte fuori o in panchina). */

const pois = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
function grid(a, b) {
  let w = 0, d = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = pois(a, i) * pois(b, j); if (i > j) w += p; else if (i === j) d += p; }
  return [w, d, 1 - w - d];
}

/* d: file della partita (data/events/<id>.json); s: summary ESPN con rosters. Restituisce il testo o null. */
export function lineupNote(d, s) {
  const xg = d?.markets?.xg, m1 = d?.markets?.["1x2"];
  if (!xg || !m1) return null;
  const lu = {};
  for (const team of s.rosters || []) {
    if (team.homeAway !== "home" && team.homeAway !== "away") continue;
    const ppl = (team.roster || []).map(p => ({ pid: String(p.athlete?.id ?? ""), name: p.athlete?.displayName || "", starter: !!p.starter }));
    lu[team.homeAway] = { st: ppl.filter(p => p.starter), bench: ppl.filter(p => !p.starter) };
  }
  if (!lu.home || !lu.away) return null;
  const lost = { home: 0, away: 0 }, out = [];
  for (const side of ["home", "away"]) {
    const has = (list, p) => list.some(x => (x.pid && x.pid === String(p.pid)) || x.name === p.name);
    for (const p of d.players?.[side] || []) {
      if ((p.involvement ?? 0) < .55 || !p.p_goal) continue;
      const g = -Math.log(1 - Math.min(p.p_goal, .95)) + .5 * -Math.log(1 - Math.min(p.p_assist || 0, .95));
      const st = has(lu[side].st, p) ? "start" : has(lu[side].bench, p) ? "bench" : "out";
      if (st === "start") continue;
      lost[side] += .5 * g * (st === "bench" ? .7 : 1);
      if (g >= .12) out.push({ name: p.name.split(" ").slice(-1)[0], st, g, side });
    }
  }
  if (!out.length) return null;
  const lh = Math.max(xg[0] - lost.home, xg[0] * .75), la = Math.max(xg[1] - lost.away, xg[1] * .75);
  const o = grid(xg[0], xg[1]), n = grid(lh, la);
  const x = [0, 1, 2].map(i => Math.min(.99, Math.max(.01, m1[i] + n[i] - o[i]))), sum = x[0] + x[1] + x[2];
  const nx = x.map(v => v / sum);
  const fav = m1.indexOf(Math.max(...m1)), lab = ["1", "X", "2"][fav];
  const names = out.sort((a, b) => b.g - a.g).slice(0, 3).map(p => `${p.name}${p.st === "bench" ? " (panchina)" : ""}`).join(", ");
  const short = side => d[side]?.short || d[side]?.name || "";
  const teams = [...new Set(out.map(p => short(p.side)))].join(" e ");
  const a = Math.round(m1[fav] * 100), b = Math.round(nx[fav] * 100);
  return `Fuori tra i titolari di ${teams}: ${names}. ${a === b ? `Il ${lab} resta al ${a}%` : `Il ${lab} passa dal ${a}% al ${b}%`} secondo il modello.`;
}
