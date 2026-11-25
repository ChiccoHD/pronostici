/* «Perché»: in cima alla scheda Esito spiega a parole l'esito più probabile, con i numeri che lo sostengono
   (forza, classifica, forma, casa/trasferta, precedenti, serie aperte, bookmaker) e quelli che vanno contro.
   Tutto viene dai dati già nella partita: niente fonti in più. Resta una stima, non una certezza. */

function whyBox(d) {
  try {
    const r = d.sport === "soccer" ? whySoccer(d) : d.sport === "nba" ? whyNba(d) : d.sport === "tennis" ? whyTennis(d) : null;
    if (!r || !r.pro.length) return "";
    const li = (arr, cls) => arr.map(t => `<li class="${cls}">${t}</li>`).join("");
    return sec(`Perché ${esc(r.pick)}`, `<div class="why">
      <p class="why-lead">${r.lead}</p>
      <ul class="why-l">${li(r.pro, "pro")}</ul>
      ${r.con.length ? `<div class="why-h">Cosa può andare storto</div><ul class="why-l">${li(r.con, "con")}</ul>` : ""}
      <p class="note">Spiegazione automatica dei numeri del modello: è una stima, non una certezza.</p></div>`, pct(r.p), "Perché");
  } catch (e) { console.warn("why", e); return ""; }
}

const whyN = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const whyPctMore = x => `${Math.round(Math.abs(x - 1) * 100)}% ${x >= 1 ? "in più" : "in meno"}`;

function whyRecord(list, f = x => true) {
  const l = (list || []).filter(f);
  const w = l.filter(x => x.res === "V").length, dr = l.filter(x => x.res === "N").length, lo = l.filter(x => x.res === "P").length;
  const gf = l.reduce((a, x) => a + (x.gf || 0), 0), ga = l.reduce((a, x) => a + (x.ga || 0), 0);
  return { n: l.length, w, d: dr, l: lo, gf, ga };
}
const whyRecTxt = r => [r.w && whyN(r.w, "vittoria", "vittorie"), r.d && whyN(r.d, "pareggio", "pareggi"), r.l && whyN(r.l, "sconfitta", "sconfitte")].filter(Boolean).join(", ") || "nessun risultato";

function whySoccer(d) {
  const m = d.markets, p = m["1x2"], H = d.home, A = d.away, b = d.book || {};
  if (!p) return null;
  const nm = t => esc(t.short || t.name);
  const i = p.indexOf(Math.max(...p));
  let pick, pp, side;
  if (i === 1) { pick = "il pareggio"; pp = p[1]; side = null; }
  else {
    side = i === 0 ? "home" : "away";
    const T = d[side];
    if (p[i] >= 0.45) { pick = `${i === 0 ? "1" : "2"} (${nm(T)} vince)`; pp = p[i]; }
    else { pick = `${i === 0 ? "1X" : "X2"} (${nm(T)} o pareggio)`; pp = p[i] + p[1]; }
  }
  const pro = [], con = [];
  if (!side) {
    pro.push(`Le due squadre sono vicine: ${nm(H)} ${pct(p[0])}, ${nm(A)} ${pct(p[2])}, e il pareggio è il risultato singolo più probabile.`);
    pro.push(`Gol attesi bassi ed equilibrati: ${num(m.xg[0], 2)} contro ${num(m.xg[1], 2)}.`);
    con.push(`Il pareggio resta difficile da indovinare: c'è un ${pct(1 - p[1])} che una delle due vinca.`);
    return { pick, p: pp, lead: `Il modello non vede una favorita chiara.`, pro, con };
  }
  const T = d[side], O = d[side === "home" ? "away" : "home"], ti = side === "home" ? 0 : 2, oi = 2 - ti;
  const xgT = m.xg[side === "home" ? 0 : 1], xgO = m.xg[side === "home" ? 1 : 0];
  // forza in attacco e difesa rispetto alla media del campionato
  const rt = T.rating, ro = O.rating;
  if (rt && rt.att && rt.def) {
    const bits = [];
    if (rt.att >= 1.08) bits.push(`segna il ${whyPctMore(rt.att)} della media del campionato`);
    if (rt.def <= 0.92) bits.push(`subisce il ${whyPctMore(rt.def)}`);
    if (bits.length) pro.push(`${nm(T)} ${bits.join(" e ")}.`);
    if (ro && ro.att && ro.def) {
      const ob = [];
      if (ro.def >= 1.08) ob.push(`subisce il ${whyPctMore(ro.def)} della media`);
      if (ro.att <= 0.92) ob.push(`segna il ${whyPctMore(ro.att)}`);
      if (ob.length) pro.push(`${nm(O)} invece ${ob.join(" e ")}.`);
      if (ro.att >= 1.15) con.push(`${nm(O)} ha un buon attacco: segna il ${whyPctMore(ro.att)} della media.`);
    }
  }
  pro.push(`Il modello si aspetta ${num(xgT, 2)} gol di ${nm(T)} contro ${num(xgO, 2)}.`);
  // classifica
  if (T.pos && O.pos && T.pos < O.pos) pro.push(`In classifica è ${T.pos}ª con ${T.pts} punti, ${nm(O)} ${O.pos}ª con ${O.pts}.`);
  else if (T.pos && O.pos && T.pos > O.pos + 2) con.push(`In classifica ${nm(O)} è più su (${O.pos}ª contro ${T.pos}ª).`);
  // forma
  const fT = d.form?.[side]?.last, fO = d.form?.[side === "home" ? "away" : "home"]?.last;
  if (fT?.length) {
    const r = whyRecord(fT.slice(0, 5));
    if (r.w >= 3 || r.l === 0) pro.push(`Ultime 5: ${whyRecTxt(r)} (${r.gf} gol fatti, ${r.ga} subiti).`);
    else if (r.w <= 1) con.push(`${nm(T)} viene da un periodo così così: ultime 5 con ${whyRecTxt(r)}.`);
  }
  if (fO?.length) {
    const r = whyRecord(fO.slice(0, 5));
    if (r.w <= 1) pro.push(`${nm(O)} ${r.w === 0 ? "non ha vinto nessuna" : "ha vinto una sola"} delle ultime 5 (${whyRecTxt(r)}).`);
    else if (r.w >= 3) con.push(`${nm(O)} è in forma: ${whyRecTxt(r)} nelle ultime 5.`);
  }
  // casa e trasferta
  if (fT?.length) {
    const r = whyRecord(fT.slice(0, 15), x => x.home === (side === "home")).n ? whyRecord(fT.slice(0, 15), x => x.home === (side === "home")) : null;
    if (r && r.n >= 3 && r.w / r.n >= 0.5) pro.push(`${side === "home" ? "In casa" : "In trasferta"} ${r.w} vittorie nelle ultime ${r.n}.`);
    else if (r && r.n >= 3 && r.w / r.n < 0.25) con.push(`${side === "home" ? "In casa" : "Fuori casa"} ha vinto solo ${r.w} delle ultime ${r.n}.`);
  }
  if (fO?.length) {
    const r = whyRecord(fO.slice(0, 15), x => x.home === (side !== "home"));
    if (r.n >= 3 && r.w / r.n < 0.25) pro.push(`${nm(O)} ${side === "home" ? "fuori casa" : "in casa"} ha vinto ${r.w} delle ultime ${r.n}.`);
  }
  // precedenti
  const h = d.h2h;
  if (h && h.n >= 3) {
    const wT = side === "home" ? h.a : h.b, wO = side === "home" ? h.b : h.a;
    if (wT > wO) pro.push(`Precedenti: ${nm(T)} ne ha vinti ${wT} su ${h.n} (${h.d || 0} pareggi).`);
    else if (wO > wT) con.push(`Nei precedenti è avanti ${nm(O)}: ${wO} vittorie su ${h.n}.`);
  }
  // serie aperte
  const tr = d.trends || {};
  (tr[side] || []).filter(x => x.k === "pos").slice(0, 2).forEach(x => pro.push(`${nm(T)}: ${esc(x.t.charAt(0).toLowerCase() + x.t.slice(1))}.`));
  (tr[side === "home" ? "away" : "home"] || []).filter(x => x.k === "pos").slice(0, 1).forEach(x => con.push(`${nm(O)}: ${esc(x.t.charAt(0).toLowerCase() + x.t.slice(1))}.`));
  // bookmaker
  const bk = b["1x2"];
  if (bk && bk[ti] != null) {
    const g = p[ti] - bk[ti];
    if (Math.abs(g) < 0.07) pro.push(`Anche i bookmaker la vedono così: ${pct(bk[ti])}.`);
    else if (g > 0) con.push(`I bookmaker sono meno convinti: ${pct(bk[ti])} contro il ${pct(p[ti])} del modello${g >= TRUST_GAP ? ", e con una distanza così grande conviene dare più peso a loro" : ""}.`);
    else pro.push(`I bookmaker sono ancora più convinti: ${pct(bk[ti])}.`);
  }
  // turnover, affidabilità, quanto resta
  const rot = d.rotation?.[side];
  if (rot) con.push(`${nm(T)} ha ${esc(rot.txt)}: potrebbe far riposare qualcuno.`);
  const rotO = d.rotation?.[side === "home" ? "away" : "home"];
  if (rotO && rotO.lvl >= 2) pro.push(`${nm(O)} ha ${esc(rotO.txt)}: potrebbe far riposare qualcuno.`);
  if (pick.startsWith("1X") || pick.startsWith("X2")) con.push(`Senza il pareggio la vittoria secca di ${nm(T)} è solo al ${pct(p[ti])}.`);
  else con.push(`Resta un ${pct(1 - p[ti])} che non vinca: pareggio ${pct(p[1])}, ${nm(O)} ${pct(p[oi])}.`);
  if (d.reliability && d.reliability.level != null && d.reliability.level <= 1) con.push(`In questo campionato il modello è meno preciso del solito (affidabilità ${esc(d.reliability.label)}).`);
  const pw = p[ti];
  const lead = pw >= 0.65 ? `${nm(T)} è nettamente favorita.` : pw >= 0.5 ? `${nm(T)} parte avanti, ma non di molto.`
    : `Partita incerta: ${nm(T)} è leggermente avanti, per questo il consiglio è coprirsi anche col pareggio.`;
  return { pick, p: pp, lead, pro: pro.slice(0, 8), con: con.slice(0, 4) };
}

function whyNba(d) {
  const m = d.markets, H = d.home, A = d.away, b = d.book || {};
  if (!m.win) return null;
  const hi = m.win[0] >= m.win[1] ? 0 : 1, side = hi ? "away" : "home", oside = hi ? "home" : "away";
  const T = d[side], O = d[oside], nm = t => esc(t.short || t.name);
  const pro = [], con = [];
  const recT = T.record || {}, recO = O.record || {};
  if (recT.w + recT.l > 0) {
    const pT = recT.w / (recT.w + recT.l), pO = recO.w + recO.l ? recO.w / (recO.w + recO.l) : null;
    if (pO == null || pT > pO) pro.push(`Record stagionale ${recT.w}-${recT.l}${pO != null ? `, contro il ${recO.w}-${recO.l} di ${nm(O)}` : ""}.`);
    else con.push(`Ha un record peggiore (${recT.w}-${recT.l} contro ${recO.w}-${recO.l}): il modello pesa di più la forma recente e il campo.`);
  }
  if (T.rating != null && O.rating != null) pro.push(`Nel rating del modello vale ${num(T.rating - O.rating, 1)} punti in più a partita.`);
  pro.push(`Punteggio atteso ${Math.round(m.exp[hi])}–${Math.round(m.exp[1 - hi])}, margine di circa ${num(Math.abs(m.margin), 1)} punti.`);
  if (side === "home") pro.push(`Gioca in casa.`);
  const fT = d.form?.[side]?.form5, fO = d.form?.[oside]?.form5;
  if (fT && fT.w != null) { if (fT.w >= 3) pro.push(`Ultime 5: ${fT.w} vinte, ${fT.l} perse.`); else if (fT.w <= 1) con.push(`Ultime 5 difficili: ${fT.w} vinte, ${fT.l} perse.`); }
  if (fO && fO.w != null) { if (fO.w <= 1) pro.push(`${nm(O)} ne ha vinte ${fO.w} delle ultime 5.`); else if (fO.w >= 4) con.push(`${nm(O)} è in forma: ${fO.w} vinte nelle ultime 5.`); }
  if (O.b2b && !T.b2b) pro.push(`${nm(O)} gioca la seconda sera di fila.`);
  if (T.b2b && !O.b2b) con.push(`${nm(T)} gioca la seconda sera di fila.`);
  const inj = m.injury_pts || [];
  if ((inj[1 - hi] || 0) >= 2) pro.push(`A ${nm(O)} mancano giocatori importanti (circa ${num(inj[1 - hi], 1)} punti in meno).`);
  if ((inj[hi] || 0) >= 2) con.push(`Anche a ${nm(T)} mancano giocatori (circa ${num(inj[hi], 1)} punti in meno).`);
  const bk = b.p_home != null ? [b.p_home, b.p_away][hi] : null;
  if (bk != null) {
    const g = m.win[hi] - bk;
    if (Math.abs(g) < 0.07) pro.push(`Anche i bookmaker la vedono così: ${pct(bk)}.`);
    else if (g > 0) con.push(`I bookmaker sono meno convinti: ${pct(bk)}${g >= TRUST_GAP ? ", e con una distanza così grande conviene dare più peso a loro" : ""}.`);
    else pro.push(`I bookmaker sono ancora più convinti: ${pct(bk)}.`);
  }
  con.push(`Resta un ${pct(1 - m.win[hi])} che vinca ${nm(O)}.`);
  const pp = m.win[hi];
  return { pick: `${nm(T)} vince`, p: pp, lead: pp >= 0.7 ? `${nm(T)} è nettamente favorita.` : pp >= 0.58 ? `${nm(T)} parte avanti.` : `Partita equilibrata, ${nm(T)} di poco avanti.`, pro, con };
}

function whyTennis(d) {
  const m = d.markets, P = d.players || {};
  if (!m.win) return null;
  const hi = m.win[0] >= m.win[1] ? 0 : 1, side = hi ? "away" : "home", oside = hi ? "home" : "away";
  const T = P[side] || {}, O = P[oside] || {};
  const nT = esc(d[side].name), nO = esc(d[oside].name);
  const pro = [], con = [];
  if (T.rank && O.rank) { if (T.rank < O.rank) pro.push(`È n. ${T.rank} del ranking, l'avversario n. ${O.rank}.`); else con.push(`In classifica è dietro: n. ${T.rank} contro n. ${O.rank}.`); }
  if (T.elo && O.elo) pro.push(`Nel rating Elo del modello ha ${Math.round(T.elo - O.elo)} punti in più.`);
  const s = (x, k) => x?.[k] && (x[k].w + x[k].l) ? x[k] : null;
  const sT = s(T, "surface12m"), sO = s(O, "surface12m");
  if (sT && sT.w / (sT.w + sT.l) >= 0.6) pro.push(`Su questa superficie (${esc(d.surface || "")}) negli ultimi 12 mesi: ${sT.w} vinte e ${sT.l} perse.`);
  if (sO && sO.w / (sO.w + sO.l) >= 0.65) con.push(`Anche ${nO} va forte su questa superficie: ${sO.w}-${sO.l} negli ultimi 12 mesi.`);
  const fT = T.form5, fO = O.form5;
  if (fT && fT.n) { if (fT.w >= 4) pro.push(`Ultimi 5 incontri: ${fT.w} vinti.`); else if (fT.w <= 1) con.push(`Viene da ${fT.l} sconfitte negli ultimi ${fT.n}.`); }
  if (fO && fO.n && fO.w <= 1) pro.push(`${nO} ha vinto ${fO.w} degli ultimi ${fO.n}.`);
  const h = d.h2h;
  if (h && h.n >= 2) { const wT = hi ? h.b : h.a, wO = hi ? h.a : h.b; if (wT > wO) pro.push(`Precedenti a suo favore: ${wT}-${wO}.`); else if (wO > wT) con.push(`Nei precedenti è avanti ${nO}: ${wO}-${wT}.`); }
  if (T.cond?.m7 >= 5) con.push(`Ha giocato ${T.cond.m7} incontri negli ultimi 7 giorni: potrebbe essere stanco.`);
  if (d.low_data) con.push(`Su questi giocatori ci sono pochi dati: la stima è più incerta.`);
  con.push(`Resta un ${pct(1 - m.win[hi])} che vinca ${nO}.`);
  const pp = m.win[hi];
  return { pick: `${nT} vince`, p: pp, lead: pp >= 0.7 ? `${nT} è nettamente favorito.` : pp >= 0.58 ? `${nT} parte avanti.` : `Incontro equilibrato, ${nT} di poco avanti.`, pro, con };
}
