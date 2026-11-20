/* Pronostici — probabilità in diretta di una giocata, per l'avviso "giocata a rischio".
   Calcio: gol che mancano come Poisson, con i gol attesi ricavati dalle probabilità di prima della partita (1X2 e Over 2,5).
   NBA: margine finale normale attorno al margine attuale più il vantaggio previsto per il tempo che resta (solo "X vince").
   Ogni risultato finale possibile viene giudicato con judge(), lo stesso dell'esito delle schedine. */
import { judge } from "./judge.js";

const pois = (k, l) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };
const cdf = x => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
function inv(p) { let lo = -6, hi = 6; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (cdf(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }

/* gol attesi delle due squadre da 1X2 e Over 2,5 di prima della partita */
function lambdas(main, o25) {
  let T = 2.6;
  if (o25 != null && o25 > 0.02 && o25 < 0.98) {
    let lo = 0.3, hi = 7;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; const under = Math.exp(-m) * (1 + m + m * m / 2); if (1 - under < o25) lo = m; else hi = m; }
    T = (lo + hi) / 2;
  }
  const pHome = s => { let w = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j < i; j++) w += pois(i, T * s) * pois(j, T * (1 - s)); return w; };
  let lo = 0.05, hi = 0.95;
  const target = main?.[0] ?? 0.45;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (pHome(m) < target) lo = m; else hi = m; }
  const s = (lo + hi) / 2;
  return [T * s, T * (1 - s)];
}

export function liveChance(label, e, snap) {
  if (!snap || snap.st !== "in" || !e?.main) return null;
  if (e.sport === "soccer") {
    const [lh, la] = lambdas(e.main, e.extra?.["Over 2,5"]);
    const played = Math.min(90, snap.p >= 2 ? Math.max(45, snap.min) : Math.min(45, snap.min));
    const r = Math.max(0.02, (95 - played) / 95);
    let win = 0, known = 0;
    for (let x = 0; x <= 7; x++) for (let y = 0; y <= 7; y++) {
      const pr = pois(x, lh * r) * pois(y, la * r);
      const v = judge(label, { h: snap.h + x, a: snap.a + y }, e);
      if (v == null) return null;            // mercato non deciso dal punteggio (marcatori, angoli...): niente stima
      known += pr; if (v === "win") win += pr;
    }
    return known ? win / known : null;
  }
  if (e.sport === "nba" && /vince$/.test(label)) {
    const left = snap.p <= 4 ? (4 - snap.p) * 12 + (snap.min || 0) : Math.max(0.5, snap.min || 0);
    const r = Math.max(0.01, left / 48), sd = 13;
    const spread = sd * inv(Math.min(0.99, Math.max(0.01, e.main[0])));
    const mu = (snap.h - snap.a) + spread * r, s = sd * Math.sqrt(r);
    const pHome = 1 - cdf((0.5 - mu) / s);
    const v = judge(label, { h: 1, a: 0 }, e);   // la giocata è sulla squadra di casa?
    if (v == null) return null;
    return v === "win" ? pHome : 1 - pHome;
  }
  return null;
}
