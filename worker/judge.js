// Giudica una giocata dal risultato finale (per la notifica dell'esito della schedina).
// Solo i mercati che si decidono con il punteggio: segni, combinate, Over/Under, Goal, Multigol, vincente,
// doppia chance, handicap, primo tempo, game nel tennis. Per gli altri (giocatori, angoli…) restituisce null:
// l'esito preciso lo calcola l'app sul telefono.
const norm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const num = s => Number(String(s).replace(",", "."));

function side(text, ev) {
  const t = norm(text), h = norm(ev.home), a = norm(ev.away);
  if (!t) return null;
  if (h && (h === t || h.includes(t) || t.includes(h) || h.split(" ").pop() === t.split(" ").pop())) return "home";
  if (a && (a === t || a.includes(t) || t.includes(a) || a.split(" ").pop() === t.split(" ").pop())) return "away";
  return null;
}

/* Formula 1: ordine d'arrivo (cognomi) e pole, scritti dalla pipeline */
export function judgeF1(label, f) {
  if (!f?.names) return null;
  const pos = n => { const i = f.names.indexOf(n); return i < 0 ? null : i + 1; };
  const r = v => v == null ? null : v ? "win" : "lose";
  let m;
  if ((m = label.match(/^(.+) vince il GP$/))) return r(pos(m[1]) === 1);
  if ((m = label.match(/^(.+) sul podio$/))) { const p = pos(m[1]); return p == null ? null : r(p <= 3); }
  if ((m = label.match(/^(.+) nei primi 10$/))) { const p = pos(m[1]); return p == null ? null : r(p <= 10); }
  if ((m = label.match(/^(.+) in pole$/))) return f.pole_s ? r(f.pole_s === m[1]) : null;
  if ((m = label.match(/^(.+) davanti a (.+)$/))) { const a = pos(m[1]), b = pos(m[2]); return a == null || b == null ? null : r(a < b); }
  return null;
}

/* "win" | "lose" | null (non giudicabile dal solo risultato) */
export function judge(label, f, ev) {
  if (ev?.sport === "f1") return judgeF1(String(label || "").trim(), f);
  if (!f || f.void || f.h == null) return null;
  const L = String(label || "").trim();
  const H = Number(f.h), A = Number(f.a), tennis = ev.sport === "tennis";
  const yes = c => (c ? "win" : "lose");
  let m;
  if (L.includes(" + ")) {
    const parts = L.split(" + ").map(x => judge(x.trim() === "Goal" ? "Goal, segnano entrambe" : x.trim(), f, ev));
    if (parts.includes("lose")) return "lose";
    return parts.every(x => x === "win") ? "win" : null;
  }
  const SIGN = { "1": H > A, "X": H === A, "2": A > H, "1X": H >= A, "X2": A >= H, "12": H !== A };
  if (L in SIGN) return yes(SIGN[L]);
  if (tennis) {
    const w = f.w ?? (H > A ? 0 : 1);
    if ((m = L.match(/^(.+) vince$/))) { const s = side(m[1], ev); return s ? yes((s === "home") === (w === 0)) : null; }
    if ((m = L.match(/^(Over|Under) (\d+),5 game$/)) && f.games != null) return yes(m[1] === "Over" ? f.games > num(m[2]) : f.games < num(m[2]));
    if ((m = L.match(/^(\d)-(\d)$/))) return yes(H === +m[1] && A === +m[2]);
    return null;
  }
  if ((m = L.match(/^(Over|Under) (\d+),5( punti)?$/))) return yes(m[1] === "Over" ? H + A > num(m[2]) : H + A < num(m[2]));
  if (L === "Goal, segnano entrambe" || L === "Goal") return yes(H > 0 && A > 0);
  if (L === "No Goal") return yes(!(H > 0 && A > 0));
  if ((m = L.match(/^Multigol (\d+)-(\d+)$/))) return yes(H + A >= +m[1] && H + A <= +m[2]);
  if (L === "Pareggio") return yes(H === A);
  if (L === "Una delle due vince") return yes(H !== A);
  if (f.periods?.[0]?.length) {
    const h1 = f.periods[0][0], a1 = f.periods[1][0];
    if (L === "Pareggio nel primo tempo") return yes(h1 === a1);
    if ((m = L.match(/^(.+) vince il primo tempo$/))) { const s = side(m[1], ev); return s ? yes(s === "home" ? h1 > a1 : a1 > h1) : null; }
    if ((m = L.match(/^(Over|Under) (\d+),5 nel primo tempo$/))) return yes(m[1] === "Over" ? h1 + a1 > num(m[2]) : h1 + a1 < num(m[2]));
  }
  if ((m = L.match(/^(.+) o pareggio$/))) { const s = side(m[1], ev); return s ? yes(s === "home" ? H >= A : A >= H) : null; }
  if ((m = L.match(/^(.+) vince$/))) { const s = side(m[1], ev); return s ? yes(s === "home" ? H > A : A > H) : null; }
  if ((m = L.match(/^(.+) segna$/))) { const s = side(m[1], ev); return s ? yes((s === "home" ? H : A) > 0) : null; }
  if ((m = L.match(/^(.+) over (\d+),5$/))) { const s = side(m[1], ev); return s ? yes((s === "home" ? H : A) > num(m[2])) : null; }
  if ((m = L.match(/^(.+) ([+-]\d+(?:,\d)?)$/))) {
    const s = side(m[1], ev);
    if (!s) return null;
    const d = (s === "home" ? H - A : A - H) + num(m[2]);
    return d === 0 ? null : yes(d > 0);
  }
  return null;
}
