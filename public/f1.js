"use strict";
/* Pronostici — Formula 1: riquadro nell'elenco, scheda del GP, pagina del pilota, classifiche e diretta.
   Dati in data/events/f1-<anno>-<round>.json e data/leagues/f1.json (scritti da pipeline/build_f1.py).
   Usa funzioni di app.js (esc, pct, odd, sec, tabsView, star, favKey, ring...). Foto dei piloti da Wikipedia, con il numero sul colore della squadra (senza foto, solo il numero). */

const F1_RED = "#e10600";
const COMPOUND = { Morbide: ["S", "#e8322b"], Medie: ["M", "#f2c318"], Dure: ["H", "#e9e9e9"], Intermedie: ["I", "#3fae49"], "Da bagnato": ["W", "#2b74c9"] };
const f1c = c => usable(c) ? c : (c && lum(c) != null ? c : "#6b7280");
const f1Href = id => `#/pilota/${encodeURIComponent(id)}`;
/* foto del pilota (Wikipedia) sul colore della squadra, con il numero; senza foto resta il numero */
const f1Num = (x, cls = "") => {
  const ph = x.photo && (typeof PHOTOS_ON === "undefined" || PHOTOS_ON);
  return `<span class="f1-num ${cls} ${ph ? "ph" : ""}" style="--tc:${f1c(x.color)};color:${onColor(f1c(x.color))}">${esc(x.num || x.code || "?")}${ph
    ? `<img src="${esc(x.photo)}" alt="" loading="lazy" decoding="async" onerror="const p=this.parentNode;p.classList.remove('ph');p.querySelector('i')?.remove();this.remove()"><i>${esc(x.num || "")}</i>` : ""}</span>`;
};
function f1When(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: TZ })}, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}`;
}
const f1Pos = p => p == null ? `<i class="f1p dnf" title="ritirato">R</i>` : `<i class="f1p ${p === 1 ? "p1" : p <= 3 ? "p3" : p <= 10 ? "p10" : ""}">${p}</i>`;
const f1Next = s => (s || []).find(x => Date.parse(x.date) > Date.now() - 90 * 60e3);

/* ------------------------------------------------------------------ elenco */
/* riga di una sessione del weekend (prove libere, qualifiche, Sprint) che porta alla scheda del GP */
const SES_ICON = { FP1: "🛠️", FP2: "🛠️", FP3: "🛠️", SQ: "⏱️", Q: "⏱️", Sprint: "🏁" };
function f1SessionFixture(e) {
  const s = e._ses, F = e.f1 || {}, t = Date.parse(s.date), now = Date.now();
  const st = now > t + 100 * 60e3 ? "done" : now > t ? "live" : "";
  let info = "";
  if ((s.k === "Q" || s.k === "SQ") && F.pole_top?.length) info = `<div class="f1fx-top"><span class="f1fx-lab">Pole</span>${F.pole_top.map(([n, code, c, p]) => `<span class="f1chip" style="--tc:${f1c(c)}"><i></i>${esc(code || n)}<b>${pct(p)}</b></span>`).join("")}</div>`;
  else if (s.k === "Sprint" && F.sprint_top?.length) info = `<div class="f1fx-top"><span class="f1fx-lab">Vince</span>${F.sprint_top.map(([n, code, c, p]) => `<span class="f1chip" style="--tc:${f1c(c)}"><i></i>${esc(code || n)}<b>${pct(p)}</b></span>`).join("")}</div>`;
  else info = `<div class="fx-sub"><span>${st === "done" ? "Tocca per tempi, settori, velocità e passo gara" : "Tempi, settori e velocità a fine sessione"}</span></div>`;
  return `<a class="fx f1fx ses ${st === "done" ? "done" : ""}" data-ses="${esc(s.k)}" href="#/e/${encodeURIComponent(e.id)}">
    <div class="fx-time">${st === "live" ? `<span class="f1-on">ORA</span>` : fmtTime(e.date)}${st === "done" ? "<small>finita</small>" : ""}</div>
    <div class="fx-mid"><div class="f1fx-gp"><span class="f1flag">${SES_ICON[s.k] || "🏎️"}</span><b>${esc(s.name)}</b></div>
      <div class="f1fx-sub">${e.home_flag || ""} ${esc(e.home)} · Round ${F.round ?? "–"}</div>${info}</div>
  </a>`;
}

function f1Fixture(e) {
  if (e._ses) return f1SessionFixture(e);
  const F = e.f1 || {}, fin = e.final;
  const top = (F.top || []).map(([s, code, c, w]) => `<span class="f1chip" style="--tc:${f1c(c)}"><i></i>${esc(code || s)}<b>${pct(w)}</b></span>`).join("");
  const nx = f1Next(F.sessions);
  const sub = [`Round ${F.round ?? "–"}`, esc(e.away)];
  if (F.rain != null && F.rain >= 0.2) sub.push(`🌧️ ${pct(F.rain)}`);
  let body;
  if (fin) {
    const hit = fin.names?.[0] && F.top?.[0]?.[0] === fin.names[0];
    body = `<div class="f1fx-pod">${(fin.podium || []).map((n, i) => `<span><i>${i + 1}</i>${esc(n)}</span>`).join("")}</div>
      <div class="fx-sub"><span class="res ${hit ? "ok" : "ko"}">${hit ? `✓ Favorito vincente (${pct(F.top[0][3])})` : `Favorito: ${esc(F.top?.[0]?.[0] || "–")} ${pct(F.top?.[0]?.[3])}`}</span></div>`;
  } else {
    body = `<div class="f1fx-top">${top}</div>${nx && nx.k !== "Race" ? `<div class="fx-sub"><span>Prossima: <b>${esc(nx.name)}</b> ${esc(f1When(nx.date))}</span></div>` : ""}`;
  }
  return `<a class="fx f1fx ${fin ? "done" : ""}" href="#/e/${encodeURIComponent(e.id)}">
    <div class="fx-time">${fin ? "Finale" : fmtTime(e.date)}${fin ? `<small>${fmtTime(e.date)}</small>` : typeof bellBtn === "function" ? bellBtn(e, true) : ""}</div>
    <div class="fx-mid"><div class="f1fx-gp"><span class="f1flag">${e.home_flag || "🏁"}</span><b>${esc(e.home)}</b></div>
      <div class="f1fx-sub">${sub.join(" · ")}</div>${body}</div>
  </a>`;
}

/* ------------------------------------------------------------------ scheda del GP */
function f1View(d) {
  const G = d.gp || {}, D = d.drivers || [], fin = d.final;
  const byId = Object.fromEntries(D.map(x => [x.id, x]));
  const label = { win: x => `${x.short} vince il GP`, podium: x => `${x.short} sul podio`, top10: x => `${x.short} nei primi 10`, pole: x => `${x.short} in pole` };
  const nx = f1Next(G.sessions);
  // intestazione: GP, circuito, programma del weekend e i tre favoriti
  const podium = D.slice(0, 3).map((x, i) => `<a class="f1-fav ${i === 0 ? "lead" : ""}" href="${f1Href(x.id)}" style="--tc:${f1c(x.color)}">
    ${f1Num(x)}<b>${esc(x.short)}</b><small>${esc(x.team_name)}</small>${ring(x.win, i === 0)}<span>vittoria</span></a>`).join("");
  const SL = d.sessions_laps || {};
  const sched = (G.sessions || []).map(s => {
    const past = Date.parse(s.date) < Date.now() - 2 * 3600e3, now = !past && Date.parse(s.date) < Date.now(), has = !!SL[s.k] || !!(d.market || {})[F1_MK_SES[s.k]];
    return `<button type="button" class="f1-ses ${past ? "past" : ""} ${now ? "now" : ""} ${s.k === "Race" ? "race" : ""} ${has ? "has" : ""}" data-ses="${esc(s.k)}">
      <b>${esc(s.name)}</b>${esc(f1When(s.date))}${SL[s.k] ? `<i>📊 tempi</i>` : has ? `<i>📈 quote</i>` : ""}</button>`;
  }).join("");
  const head = `<div class="board f1-board ${f1Theme(G.country) ? "themed" : ""}" style="${f1Theme(G.country) ? `--flag:${f1Theme(G.country)}` : ""}">
    <div class="board-meta"><span class="bm-txt"><b>Formula 1 · Round ${G.round ?? ""}</b><span>${esc(G.locality || "")}, ${esc(G.country || "")}</span></span>
      ${typeof bellBtn === "function" && !fin ? bellBtn({ id: d.id, sport: "f1", date: d.date, home: d.home.name, away: d.away.short || "", league_name: "Formula 1" }) : ""}</div>
    <div class="f1-title"><span class="f1flag big">${G.flag || "🏁"}</span><div><h1>${esc(G.name || d.home.name)}</h1><small>${esc(G.circuit || "")}</small></div></div>
    <div class="f1-sched">${sched}</div>
    ${fin ? f1Result(d, byId) : `<div class="f1-favs">${podium}</div>`}
    <div class="board-foot">${d.rain != null ? `<span>🌧️ pioggia in gara ${pct(d.rain)}</span>` : ""}${d.markets?.sc != null ? `<span>🚨 safety car ${pct(d.markets.sc)}</span>` : ""}
      ${G.quali_done ? `<span>griglia già decisa</span>` : nx ? `<span>prossima: ${esc(nx.name)}</span>` : ""}</div>
  </div>`;

  // Gara: un pilota per riga, con la giocata scelta nel selettore
  const MK = d.market || {};
  const mkOf = (k, x) => (MK[k] || {})[x.id];
  const raceRow = k => (x, i) => {
    const p = x[k], mp = mkOf(k, x);
    return `<div class="f1-row" style="--tc:${f1c(x.color)}"><span class="f1-rk">${i + 1}</span>${f1Num(x, "sm")}
      <a class="f1-who" href="${f1Href(x.id)}"><b>${esc(x.short)}</b><small>${esc(x.team_name)}${x.grid ? ` · griglia ${x.grid}°` : ""}</small>${mp != null ? `<span class="f1-mk" title="Probabilità e quota sul mercato Polymarket">mercato ${pct(mp)} · q. ${odd(mp)}</span>` : ""}</a>
      <span class="f1-bar"><i style="width:${Math.round((p || 0) * 100)}%"></i></span>
      <b class="f1-p">${pct(p)}<small>q. ${odd(p)}</small></b>

      ${label[k] ? star(favKey(label[k](x), p)) : `<span class="star-sp"></span>`}</div>`;
  };
  // i primi 10 subito, gli altri sotto "Tutti i piloti"
  const raceRows = k => `<div class="f1-tab">${D.slice(0, 10).map(raceRow(k)).join("")}</div>${D.length > 10
    ? `<details class="f1-more"><summary>Tutti i piloti (${D.length})</summary><div class="f1-tab">${D.slice(10).map((x, i) => raceRow(k)(x, i + 10)).join("")}</div></details>` : ""}`;
  const ord = k => [...D].sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0));
  // ordino le righe per la giocata scelta
  const paneFor = k => { const keep = D.slice(); D.splice(0, D.length, ...ord(k)); const h = `<div data-segpane="f1g:${k}" ${k !== "win" ? "hidden" : ""}>${raceRows(k)}</div>`; D.splice(0, D.length, ...keep); return h; };
  const teamBars = `<div class="bars">${(d.teams || []).map(t => { const m = (MK.team_win || {})[t.team];
    return `<div class="bar f1-tb" style="--tc:${f1c(t.color)}"><i style="width:${Math.round(t.win * 100)}%"></i>
    <span>${esc(t.name)}${m != null ? `<small> · mercato ${pct(m)}</small>` : ""}</span><b>${pct(t.win)}</b></div>`; }).join("")}</div>`;
  // modello contro mercato (Polymarket): le differenze più grandi, con quota equa e quota del mercato
  const vs = [];
  for (const x of D) for (const [k, l] of [["win", label.win], ["podium", label.podium], ["pole", label.pole]]) {
    const mp = mkOf(k, x), p = x[k];
    if (mp != null && p != null && mp > 0.012) vs.push({ l: l(x), p, mp, x });
  }
  for (const [ia, ib, pa] of MK.h2h || []) {
    const A = byId[ia], B = byId[ib], ix0 = D.indexOf(A), ix1 = D.indexOf(B);
    const p = d.h2h?.[ix0]?.[ix1];
    if (A && B && p != null) vs.push(p >= pa ? { l: `${A.short} davanti a ${B.short}`, p, mp: pa, x: A } : { l: `${B.short} davanti a ${A.short}`, p: 1 - p, mp: 1 - pa, x: B });
  }
  vs.sort((a, b) => (b.p - b.mp) - (a.p - a.mp));
  const vsHtml = vs.length ? sec("Modello contro mercato", `<div class="f1-vs">${vs.filter(v => v.p - v.mp >= 0.03).slice(0, 8).map(v => `<div class="f1-vsr" style="--tc:${f1c(v.x.color)}">
      ${f1Num(v.x, "xs")}<span class="f1-vsl"><b>${esc(v.l)}</b><small>modello ${pct(v.p)} · mercato ${pct(v.mp)}</small></span>
      <span class="f1-q"><b>${odd(v.mp)}</b><small>quota merc.</small></span><span class="f1-q eq"><b>${odd(v.p)}</b><small>quota equa</small></span>${star(favKey(v.l, v.p, v.mp))}</div>`).join("")
      || `<p class="note">Nessuna differenza grande: modello e mercato sono d'accordo.</p>`}</div>
      <p class="note">Giocate a cui il modello dà più probabilità del mercato di previsione Polymarket (prezzi pubblici, aggiornati a ogni giro di dati). La <b>quota equa</b> è quella giusta secondo il modello: se il tuo sito paga di più, il modello ci vede valore. Restano stime, non certezze.</p>`, "", "F1 mercato") : "";
  const gara = sec("Gara", `<div class="f1-segrow">${seg("f1g", [["win", "Vittoria"], ["podium", "Podio"], ["top10", "Punti"], ["dnf", "Ritiro"]], "win")}</div>
      ${["win", "podium", "top10", "dnf"].map(paneFor).join("")}
      <p class="note">Punti = arrivo nei primi 10. Ritiro = non classificato (incidente, guasto). q. = quota equa secondo il modello.${MK.win ? " Sotto il pilota, «mercato» = probabilità e quota sul mercato di previsione Polymarket, per confronto." : ""} Tocca la stella per metterla in schedina.</p>`, "", "F1 gara")
    + vsHtml
    + sec("Scuderia vincente", teamBars, "", "F1 scuderia")
    + sec("Posizione attesa", `<div class="rows">${ord("exp_pos").reverse().slice(0, 22).map(x => `<div class="r"><span class="l">${f1Num(x, "xs")} ${esc(x.short)}</span><span class="v">${num(x.exp_pos)}°</span></div>`).join("")}</div>
      <p class="note">Media delle simulazioni (ritiri contati in fondo).</p>`, "", "F1 posizione attesa");

  // Qualifica e Sprint
  let quali;
  if (G.quali_done) {
    const grid = D.filter(x => x.grid).sort((a, b) => a.grid - b.grid);
    quali = sec("Griglia di partenza", `<div class="f1-grid">${grid.map(x => `<a class="f1-slot ${x.grid % 2 ? "l" : "r"}" href="${f1Href(x.id)}" style="--tc:${f1c(x.color)}"><i>${x.grid}</i>${esc(x.code || x.short)}</a>`).join("")}</div>
      <p class="note">Qualifica conclusa: le percentuali della gara partono da questa griglia.</p>`, "", "F1 griglia");
  } else {
    const pl = [...D].filter(x => x.pole != null).sort((a, b) => b.pole - a.pole);
    quali = sec("Pole position", `<div class="f1-tab">${pl.slice(0, 12).map((x, i) => `<div class="f1-row" style="--tc:${f1c(x.color)}"><span class="f1-rk">${i + 1}</span>${f1Num(x, "sm")}
      <a class="f1-who" href="${f1Href(x.id)}"><b>${esc(x.short)}</b><small>${esc(x.team_name)}</small>${mkOf("pole", x) != null ? `<span class="f1-mk">mercato ${pct(mkOf("pole", x))} · q. ${odd(mkOf("pole", x))}</span>` : ""}</a>
      <span class="f1-bar"><i style="width:${Math.round(x.pole * 100)}%"></i></span><b class="f1-p">${pct(x.pole)}<small>q. ${odd(x.pole)}</small></b>${star(favKey(label.pole(x), x.pole, mkOf("pole", x)))}</div>`).join("")}</div>
      <p class="note">Stima dal passo in qualifica delle ultime gare, con più peso a quelle recenti.${MK.pole ? " «mercato» = Polymarket, per confronto." : ""}</p>`, "", "F1 pole");
  }
  const flap = [...D].filter(x => x.fl != null).sort((a, b) => b.fl - a.fl).slice(0, 6);
  quali += sec("Giro più veloce", `<div class="bars">${flap.map(x => `<div class="bar f1-tb" style="--tc:${f1c(x.color)}"><i style="width:${Math.round(x.fl * 100)}%"></i><span>${esc(x.short)}<small>${esc(x.team_name)}</small></span><b>${pct(x.fl)}</b></div>`).join("")}</div>`, "", "F1 giro veloce");
  if (d.sprint?.length) {
    const sp = d.sprint.map(s => ({ ...byId[s.id], ...s })).filter(x => x.short).sort((a, b) => b.win - a.win);
    quali += sec("Sprint", `<div class="f1-tab">${sp.slice(0, 12).map(x => `<div class="f1-row three" style="--tc:${f1c(x.color)}">${f1Num(x, "sm")}<a class="f1-who" href="${f1Href(x.id)}"><b>${esc(x.short)}</b></a>
      <span class="f1-c"><b>${pct(x.win)}</b><small>vince</small></span><span class="f1-c"><b>${pct(x.top3)}</b><small>podio</small></span><span class="f1-c"><b>${pct(x.top8)}</b><small>punti</small></span></div>`).join("")}</div>
      <p class="note">Nella Sprint prendono punti i primi 8.</p>`, "", "F1 sprint");
  }

  // Testa a testa
  const H = d.h2h || [];
  const ix = Object.fromEntries(D.map((x, i) => [x.id, i]));
  const mates = [];
  for (const x of D) { const m = D.find(y => y.team === x.team && y.id !== x.id); if (m && !mates.some(([a, b]) => b.id === x.id)) mates.push([x, m]); }
  const mkPair = (a, b) => { for (const [ia, ib, pa, v] of MK.h2h || []) { if (ia === a.id && ib === b.id) return [pa, v]; if (ia === b.id && ib === a.id) return [1 - pa, v]; } return null; };
  const duel = (a, b) => {
    const p = H[ix[a.id]]?.[ix[b.id]];
    if (p == null) return "";
    const [w, l, q] = p >= .5 ? [a, b, p] : [b, a, 1 - p];
    const m = mkPair(w, l);
    return `<div class="f1-duelw"><div class="f1-duel"><span class="f1-dn" style="--tc:${f1c(a.color)}">${f1Num(a, "sm")}<b>${esc(a.short)}</b></span>
      <span class="f1-dbar"><i style="flex:${p};background:${f1c(a.color)}"></i><i style="flex:${1 - p};background:${f1c(b.color)}"></i><em>${pct(p)}</em><em>${pct(1 - p)}</em></span>
      <span class="f1-dn r" style="--tc:${f1c(b.color)}"><b>${esc(b.short)}</b>${f1Num(b, "sm")}</span>${star(favKey(`${w.short} davanti a ${l.short}`, q, m?.[0]))}</div>
      <div class="f1-dq">${esc(w.short)} davanti: quota equa <b>${odd(q)}</b>${m ? ` · mercato ${pct(m[0])} (quota <b>${odd(m[0])}</b>)` : ""} · ${esc(l.short)} davanti: <b>${odd(1 - q)}</b></div></div>`;
  };
  const opts = D.map(x => `<option value="${esc(x.id)}">${esc(x.short)} (${esc(x.team_name)})</option>`).join("");
  // sfide quotate dal mercato (non tra compagni)
  const mkDuels = (MK.h2h || []).map(([ia, ib]) => [byId[ia], byId[ib]]).filter(([a, b]) => a && b && a.team !== b.team);
  // compagni su questa pista (dal 2018): posizioni guadagnate (negativo) o perse sul compagno
  const MC = d.mates_circuit || [];
  const mcPane = k => {
    const rows = MC.filter(m => m[k] != null && byId[m.id]).sort((a, b) => a[k] - b[k]);
    if (!rows.length) return `<p class="note">Nessun dato.</p>`;
    const mx = Math.max(1, ...rows.map(m => Math.abs(m[k])));
    return `<div class="f1-div">${rows.map(m => { const x = byId[m.id], v = m[k], w = Math.abs(v) / mx * 50;
      return `<a class="f1-dr" href="${f1Href(x.id)}" style="--tc:${f1c(x.color)}"><span class="f1-dc">${esc(x.code || x.short)}</span>
        <span class="f1-dtrack"><i style="${v < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></i></span>
        <b class="${v < 0 ? "good" : v > 0 ? "bad" : ""}">${v > 0 ? "+" : ""}${num(v)}</b><small>${m[k + "n"]}×</small></a>`; }).join("")}</div>`;
  };
  const C0 = d.circuit || {};
  const mcHtml = MC.length ? sec("Contro il compagno su questa pista", `<div class="f1-segrow">${seg("f1mc", [["q", "Qualifica"], ["r", "Gara"]], "q")}</div>
      <div data-segpane="f1mc:q">${mcPane("q")}</div><div data-segpane="f1mc:r" hidden>${mcPane("r")}</div>
      <p class="note">Media delle posizioni di distacco dal compagno di squadra di quel momento, edizione per edizione${C0.since ? ` (dal ${C0.since})` : ""}. Più a sinistra = lo batte; il numero a destra = edizioni contate.</p>`, "", "F1 compagni pista") : "";
  const h2h = sec("Scegli due piloti", `<div class="f1-pick"><select id="f1-a">${opts}</select><span>contro</span><select id="f1-b">${opts}</select></div><div id="f1-duel">${D[1] ? duel(D[0], D[1]) : ""}</div>
      <p class="note">Chi arriva davanti all'altro (se uno si ritira, vince chi resta in gara). Stima dalle simulazioni della gara.</p>`, "", "F1 h2h scelta")
    + (mkDuels.length ? sec("Sfide quotate", mkDuels.map(([a, b]) => duel(a, b)).join("") + `<p class="note">Le sfide che il mercato Polymarket quota per questo GP, con la stima del modello.</p>`, "", "F1 sfide mercato") : "")
    + sec("Compagni di squadra", mates.map(([a, b]) => duel(a, b)).join(""), "", "F1 compagni")
    + mcHtml;

  // Gomme e strategia (edizioni passate da OpenF1)
  const S = d.strategy;
  const comp = c => { const [l, col] = COMPOUND[c] || ["?", "#999"]; return `<i class="tyre" style="--ty:${col}">${l}</i>`; };
  const seqHtml = s => s.split(" → ").map(c => comp(c)).join(`<span class="tyre-ar">›</span>`);
  let gomme = "";
  if (S) {
    gomme += sec("Soste ai box", `<div class="f1-stops">${["1", "2", "3+"].map(k => `<div><b>${pct(S.stops?.[k])}</b><span>${k === "1" ? "una sosta" : k === "2" ? "due soste" : "tre o più"}</span></div>`).join("")}</div>
      ${S.stops_avg != null ? `<p class="note">Media ${num(S.stops_avg)} soste per chi arriva al traguardo${S.first_stop ? `; prima sosta tra il giro ${S.first_stop[0]} e il ${S.first_stop[2]} (di solito verso il ${S.first_stop[1]}°)` : ""}.</p>` : ""}`, `${S.editions?.length || 0} edizioni`, "F1 soste")
      + sec("Strategie più usate", `<div class="rows">${(S.sequences || []).map(([s, n]) => `<div class="r"><span class="l tyres">${seqHtml(s)}</span><span class="v">${n} piloti</span></div>`).join("")}</div>`, "", "F1 sequenze")
      + sec("Durata delle gomme", `<div class="rows">${Object.entries(S.stint || {}).map(([c, v]) => `<div class="r"><span class="l">${comp(c)} ${esc(c)}</span><span class="v">${num(v.avg, 0)} giri <small class="faint">(fino a ${v.max})</small></span></div>`).join("")}</div>
      <p class="note">Giri medi di uno stint su questo circuito.</p>`, "", "F1 stint");
  }
  if (d.pit?.length) gomme += sec("Pit stop delle scuderie", `<div class="rows">${d.pit.slice(0, 11).map((t, i) => `<div class="r"><span class="l">${i + 1}. ${esc(t.team)}</span><span class="v">${num(t.avg, 2)} s <small class="faint">record ${num(t.best, 2)}</small></span></div>`).join("")}</div>
      <p class="note">Tempo da fermo, media della stagione.</p>`, "", "F1 pit");
  if (S?.editions?.length) gomme += sec("Edizioni passate", `<table class="vs-table f1-ed"><tr><th>Anno</th><th>SC</th><th>VSC</th><th>Rossa</th><th>Pioggia</th><th>Soste</th><th>Asfalto</th></tr>
      ${S.editions.map(e => `<tr><td>${e.season}</td><td>${e.sc}</td><td>${e.vsc}</td><td>${e.red ? "sì" : "–"}</td><td>${e.wet ? "🌧️" : "–"}</td><td>${num(e.stops)}</td><td>${e.track_temp != null ? `${num(e.track_temp, 0)}°` : "–"}</td></tr>`).join("")}</table>
      ${S.sc_rate != null ? `<p class="note">Safety car in almeno una edizione su ${S.editions.length}: stima per questa gara <b>${pct(S.sc_rate)}</b>.</p>` : ""}`, "", "F1 edizioni");
  if (!gomme) gomme = `<div class="empty"><b>Strategie non ancora disponibili</b>Arrivano dai dati delle edizioni passate (OpenF1), un po' alla volta.</div>`;

  // Giro e settori (OpenF1): ultima sessione del weekend, altrimenti le qualifiche dell'edizione scorsa
  const LP = d.laps;
  let giri = "";
  if (LP?.rows?.length) {
    const fmtT = t => { if (t == null) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return m ? `${m}:${s.toFixed(3).padStart(6, "0")}` : `${s.toFixed(3)}s`; };
    const team = rows => { const by = {}; for (const r of rows) { const k = r.team || r.code; if (!by[k]) by[k] = { ...r, code: r.team }; else for (const f of ["s1", "s2", "s3", "lap", "ideal"]) if (r[f] != null && (by[k][f] == null || r[f] < by[k][f])) by[k][f] = r[f];
      if (r.st != null && (by[k].st == null || r.st > by[k].st)) by[k].st = r.st; } return Object.values(by); };
    const pane = (k, who) => {
      const src = who === "t" ? team(LP.rows) : LP.rows, hi = k === "st";
      const rows = src.filter(r => r[k] != null).sort((a, b) => hi ? b[k] - a[k] : a[k] - b[k]);
      if (!rows.length) return `<p class="note">Dato non disponibile per questa sessione.</p>`;
      const best = rows[0][k], worst = rows[rows.length - 1][k], span = Math.abs(worst - best) || 1;
      return `<div class="f1-lb">${rows.map((r, i) => { const w = 100 - Math.abs(r[k] - best) / span * 70;
        return `<div class="f1-lr" style="--tc:${f1c(r.color)}"><span class="f1-lc">${esc(who === "t" ? r.team : r.code || "")}</span><span class="f1-lt"><i style="width:${w}%"></i>
          <em>${hi ? `${r[k]} km/h` : fmtT(r[k])}${i && !hi ? ` <small>+${(r[k] - best).toFixed(3)}</small>` : ""}</em></span></div>`; }).join("")}</div>`;
    };
    const ks = [["s1", "S1"], ["s2", "S2"], ["s3", "S3"], ["ideal", "Ideale"], ["lap", "Giro"], ["st", "Velocità"]];
    giri = sec("Giro e settori", `<div class="f1-segrow">${seg("f1lw", [["p", "Piloti"], ["t", "Scuderie"]], "p")}</div>
        <div class="f1-segrow">${seg("f1lk", ks, "s2")}</div>
        ${["p", "t"].map(w => `<div data-segpane="f1lw:${w}" ${w !== "p" ? "hidden" : ""}>${ks.map(([k]) => `<div data-segpane="f1lk:${k}" ${k !== "s2" ? "hidden" : ""}>${pane(k, w)}</div>`).join("")}</div>`).join("")}
        <p class="note">${LP.kind === "weekend" ? `Da <b>${esc(LP.session)}</b> di questo weekend` : `Dalle <b>qualifiche ${LP.year}</b> su questa pista (il weekend non è ancora iniziato)`}: miglior tempo per settore, giro ideale (somma dei migliori settori) e velocità massima alla speed trap, che dice chi è più veloce in rettilineo. Dati OpenF1.</p>`, "", "F1 settori");
  } else giri = `<div class="empty"><b>Tempi non ancora disponibili</b>Arrivano dopo la prima sessione del weekend (OpenF1).</div>`;

  // Meteo
  const W = d.weather || {};
  const wIcon = w => w.rain_p >= .5 ? "🌧️" : w.rain_p >= .25 ? "🌦️" : w.cloud >= 70 ? "☁️" : w.cloud >= 30 ? "⛅" : "☀️";
  const meteo = Object.keys(W).length ? sec("Previsioni per sessione", `<div class="f1-wx">${(G.sessions || []).filter(s => W[s.k]).map(s => { const w = W[s.k];
      return `<div class="f1-w ${s.k === "Race" ? "race" : ""}"><span class="wi">${wIcon(w)}</span><b>${esc(s.name)}</b><small>${esc(f1When(s.date))}</small>
        <span class="wt">${num(w.temp, 0)}°</span><span>pioggia <b>${pct(w.rain_p)}</b>${w.rain_mm ? ` · ${num(w.rain_mm)} mm` : ""}</span><span>vento ${num(w.wind, 0)} km/h</span></div>`; }).join("")}</div>
      <p class="note">Da Open-Meteo, aggiornate a ogni giro di dati. Con pioggia probabile il modello rende la gara più aperta.</p>`, "", "F1 meteo")
    : `<div class="empty"><b>Previsioni non ancora disponibili</b>Arrivano quando mancano meno di due settimane.</div>`;

  // Circuito
  const C = d.circuit || {};
  const cRows = [...D].filter(x => x.circuit?.starts).sort((a, b) => (a.circuit.avg ?? 99) - (b.circuit.avg ?? 99)).slice(0, 10);
  const circ = sec(esc(G.circuit || "Circuito"), `<div class="tp-tiles f1-ct">
      <div class="tp-tile"><b>${C.all_editions ?? C.editions ?? "–"}</b><span>edizioni${C.since ? ` dal ${C.since}` : ""}</span></div>
      <div class="tp-tile"><b>${C.pole_win_all != null ? pct(C.pole_win_all) : C.pole_win_rate != null ? pct(C.pole_win_rate) : "–"}</b><span>vinte dalla pole</span></div>
      ${C.laps ? `<div class="tp-tile"><b>${C.laps}</b><span>giri</span></div>` : ""}
      ${C.pit_loss ? `<div class="tp-tile"><b>${num(C.pit_loss, 1)}s</b><span>tempo nella corsia box</span></div>` : ""}
      <div class="tp-tile"><b>${C.dnf_rate != null ? pct(C.dnf_rate) : "–"}</b><span>ritiri per pilota</span></div>
      <div class="tp-tile"><b>${C.grid_weight != null ? (C.grid_weight >= .6 ? "alta" : C.grid_weight >= .45 ? "media" : "bassa") : "–"}</b><span>importanza della griglia</span></div></div>
      <p class="note">Importanza della griglia: quanto l'ordine d'arrivo assomiglia a quello di partenza qui (sorpassi difficili = alta).</p>`, "", "F1 circuito")
    + ((C.albo || C.winners)?.length ? sec("Albo d'oro", `<div class="rows">${(C.albo || C.winners).map(w => `<div class="r"><span class="l"><b>${w.season}</b> ${esc(w.winner)} <small class="faint">${esc(w.team || "")}</small></span>
      <span class="v faint">${w.from_grid ? `dal ${w.from_grid}° posto` : ""}${w.pole ? ` · pole ${esc(lastName(w.pole))}` : ""}</span></div>`).join("")}</div>`, "", "F1 albo") : "")
    + (cRows.length ? sec("Piloti su questa pista", `<div class="rows">${cRows.map(x => `<a class="r" href="${f1Href(x.id)}"><span class="l">${f1Num(x, "xs")} ${esc(x.short)}</span>
      <span class="v">${x.circuit.wins ? `🏆 ${x.circuit.wins} · ` : ""}${x.circuit.podiums ? `${x.circuit.podiums} ${x.circuit.podiums === 1 ? "podio" : "podi"} · ` : ""}media ${num(x.circuit.avg)}° <small class="faint">(${x.circuit.starts})</small></span></a>`).join("")}</div>`, "", "F1 piloti pista") : "");

  // Piloti: classifica e forma
  const forma = sec("Forma", `<div class="f1-tab">${[...D].sort((a, b) => (a.champ_pos ?? 99) - (b.champ_pos ?? 99)).map(x => `<a class="f1-row form" href="${f1Href(x.id)}" style="--tc:${f1c(x.color)}">
      <span class="f1-rk">${x.champ_pos ?? "–"}</span>${f1Num(x, "sm")}<span class="f1-who"><b>${esc(x.short)}</b><small>${num(x.points, 0)} punti</small></span>
      <span class="f1-form">${(x.form || []).slice(0, 6).reverse().map(f1Pos).join("")}</span></a>`).join("")}</div>
      <p class="note">Posizione nel mondiale e ultime gare (la più recente a destra). R = ritirato. <a href="#/classifiche/f1" style="color:var(--rosa);font-weight:600">Classifiche complete</a></p>`, "", "F1 forma");

  const M = d.model || {};
  const rel = M.n ? `<p class="note">Verifica del modello su ${M.n} gare passate: sul vincitore sbaglia meno di un tiro a caso (log-loss ${num(M.logloss_winner, 2)} contro ${num(M.logloss_uniform, 2)}). Le percentuali restano stime: in F1 contano incidenti, strategie e meteo.</p>` : "";

  return head + `<div id="f1-live"></div>` + tabsView("f1", [["gara", "Gara", gara + rel], ["quali", G.sprint ? "Qualifica e Sprint" : "Qualifica", quali], ["h2h", "Testa a testa", h2h],
    ["giri", "Settori", giri], ["gomme", "Gomme", gomme], ["meteo", "Meteo", meteo], ["circ", "Circuito", circ], ["piloti", "Piloti", forma]]);
}

function f1Result(d, byId) {
  const f = d.final;
  const pod = (f.order || []).slice(0, 3).map((id, i) => { const x = byId[id] || { short: f.names?.[i], color: "#888" };
    return `<div class="f1-step s${i + 1}" style="--tc:${f1c(x.color)}">${x.num ? f1Num(x) : ""}<b>${esc(x.short || f.names?.[i] || "")}</b><span>${i + 1}°</span><small>era ${pct(x.win)}</small></div>`; });
  const order = pod.length === 3 ? [pod[1], pod[0], pod[2]] : pod;
  return `<div class="f1-podium">${order.join("")}</div>${f.pole ? `<p class="note" style="text-align:center">Pole: ${esc(f.pole)}${f.fl ? ` · giro veloce: ${esc(f.fl)}` : ""}</p>` : ""}`;
}

let F1_OPEN_SES = null;   // sessione da aprire subito (tocco su una riga di sessione nell'elenco)
document.addEventListener("click", ev => { const a = ev.target.closest?.("a.f1fx.ses[data-ses]"); if (a) F1_OPEN_SES = a.dataset.ses; }, true);
function wireF1(d) {
  document.querySelectorAll(".f1-sched [data-ses]").forEach(b => b.onclick = () => f1SessionSheet(d, b.dataset.ses));
  if (F1_OPEN_SES) { const k = F1_OPEN_SES; F1_OPEN_SES = null; if ((d.sessions_laps || {})[k]) setTimeout(() => f1SessionSheet(d, k), 250); }
  const a = document.getElementById("f1-a"), b = document.getElementById("f1-b"), box = document.getElementById("f1-duel");
  if (a && b && d.drivers?.[1]) {
    b.value = d.drivers[1].id;
    const H = d.h2h || [], D = d.drivers, ix = Object.fromEntries(D.map((x, i) => [x.id, i]));
    const draw = () => {
      const A = D[ix[a.value]], B = D[ix[b.value]];
      if (!A || !B || A.id === B.id) { box.innerHTML = `<p class="note">Scegli due piloti diversi.</p>`; return; }
      const p = H[ix[A.id]][ix[B.id]], [w, l, q] = p >= .5 ? [A, B, p] : [B, A, 1 - p];
      box.innerHTML = `<div class="f1-duel"><span class="f1-dn">${f1Num(A, "sm")}<b>${esc(A.short)}</b></span>
        <span class="f1-dbar"><i style="flex:${p};background:${f1c(A.color)}"></i><i style="flex:${1 - p};background:${f1c(B.color)}"></i><em>${pct(p)}</em><em>${pct(1 - p)}</em></span>
        <span class="f1-dn r"><b>${esc(B.short)}</b>${f1Num(B, "sm")}</span>${star(favKey(`${w.short} davanti a ${l.short}`, q))}</div>
        <div class="f1-dq">${esc(w.short)} davanti: quota equa <b>${odd(q)}</b> · ${esc(l.short)} davanti: <b>${odd(1 - q)}</b></div>`;
    };
    a.onchange = b.onchange = draw;
  }
  f1Live(d);
}

/* ------------------------------------------------------------------ diretta (tabellone ESPN letto dal telefono) */
let f1Timer = null;
async function f1Board() {
  const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard", { cache: "no-store" });
  if (!r.ok) throw new Error("espn");
  return r.json();
}
/* la sessione in corso o appena finita del weekend: ESPN mette una "competition" per sessione */
function f1Session(js, d) {
  const t0 = Date.parse(d.gp?.sessions?.[0]?.date || d.date) - 864e5, t1 = Date.parse(d.date) + 864e5;
  const ev = (js?.events || []).find(e => (e.competitions || []).some(c => { const t = Date.parse(c.date || c.startDate); return t >= t0 && t <= t1; }));
  if (!ev) return null;
  const comps = (ev.competitions || []).filter(c => Date.parse(c.date || c.startDate) <= Date.now() + 15 * 60e3)
    .sort((a, b) => Date.parse(b.date || b.startDate) - Date.parse(a.date || a.startDate));
  const c = comps.find(c => c.status?.type?.state === "in") || comps[0];
  if (!c) return null;
  const rows = (c.competitors || []).map((x, i) => ({ pos: x.order ?? x.position ?? i + 1, name: x.athlete?.shortName || x.athlete?.displayName || x.team?.displayName || "",
    full: x.athlete?.displayName || "", winner: !!x.winner })).sort((a, b) => a.pos - b.pos);
  return { name: c.type?.abbreviation || c.type?.text || "", state: c.status?.type?.state, detail: c.status?.type?.shortDetail || c.status?.type?.detail || "", rows };
}
const F1_SES = { FP1: "Prove libere 1", FP2: "Prove libere 2", FP3: "Prove libere 3", Qual: "Qualifica", Race: "Gara", Sprint: "Sprint", SS: "Sprint shootout", SQ: "Qualifica Sprint" };
async function f1Live(d) {
  clearTimeout(f1Timer);
  const box = document.getElementById("f1-live"), hash = location.hash;
  if (!box || d.final) return;
  const ses = d.gp?.sessions || [];
  const active = ses.some(s => { const t = Date.parse(s.date); return Date.now() > t - 15 * 60e3 && Date.now() < t + 3 * 3600e3; });
  if (!active) return;
  let S = null;
  try { S = f1Session(await f1Board(), d); } catch { S = null; }
  if (location.hash !== hash || !document.getElementById("f1-live")) return;
  if (!S || !S.rows.length) { box.innerHTML = ""; f1Timer = setTimeout(() => f1Live(d), 60000); return; }
  const live = S.state === "in", D = d.drivers || [];
  const find = n => D.find(x => normName(x.name) === normName(n.full) || normName(x.short) === normName(n.name.split(" ").pop()));
  box.innerHTML = `<section class="sec f1-lv ${live ? "on" : ""}"><h2><span class="sec-t">${live ? `<i class="pulse-dot on"></i>In diretta` : "Ultima sessione"} · ${esc(F1_SES[S.name] || S.name)}</span><small>${esc(S.detail)}</small></h2>
    <div class="f1-tab">${S.rows.slice(0, 10).map(r => { const x = find(r) || { color: "#888", num: "" };
      return `<div class="f1-row lv" style="--tc:${f1c(x.color)}"><span class="f1-rk">${r.pos}</span>${x.num ? f1Num(x, "sm") : ""}<span class="f1-who"><b>${esc(x.short || r.name)}</b>${x.team_name ? `<small>${esc(x.team_name)}</small>` : ""}</span>
        ${x.win != null ? `<small class="faint">prima ${pct(x.win)}</small>` : ""}</div>`; }).join("")}</div>
    <p class="note">Ordine da ESPN, letto dal telefono${live ? " ogni 20 secondi" : ""}.</p></section>`;
  f1Timer = setTimeout(() => f1Live(d), live ? 20000 : 90000);
}

/* ------------------------------------------------------------------ giudizio delle giocate F1 (dal risultato ufficiale) */
function f1Judge(label, e) {
  const f = e?.final;
  if (!f?.names) return null;
  const pos = n => { const i = f.names.indexOf(n); return i < 0 ? null : i + 1; };
  let m;
  if ((m = label.match(/^(.+) vince il GP$/))) return pos(m[1]) === 1;
  if ((m = label.match(/^(.+) sul podio$/))) { const p = pos(m[1]); return p != null && p <= 3; }
  if ((m = label.match(/^(.+) nei primi 10$/))) { const p = pos(m[1]); return p != null && p <= 10; }
  if ((m = label.match(/^(.+) in pole$/))) return f.pole_s ? f.pole_s === m[1] : f.pole ? f.pole.endsWith(" " + m[1]) : null;
  if ((m = label.match(/^(.+) davanti a (.+)$/))) { const a = pos(m[1]), b = pos(m[2]); return a == null || b == null ? null : a < b; }
  return null;
}

/* ------------------------------------------------------------------ pagina del pilota */
async function showDriver(id) {
  $app.innerHTML = backBtn("Indietro") + `<p class="muted" style="padding:16px 4px">Caricamento…</p>`;
  const L = await leagueData("f1");
  if (!location.hash.startsWith("#/pilota")) return;
  const x = (L?.drivers || []).find(p => p.id === id);
  if (!x) { $app.innerHTML = backBtn("Indietro") + `<div class="empty"><b>Pilota non trovato</b>I dati della Formula 1 arrivano con l'aggiornamento dei dati.</div>`; return; }
  const c = f1c(x.color), mate = (L.drivers || []).find(p => p.id === x.mate?.mate);
  const tile = (v, l) => `<div class="tp-tile"><b>${v}</b><span>${l}</span></div>`;
  const head = `<div class="board team-hero f1-hero" style="--tc:${c}">
    <div class="tp-top"><div class="tp-logo">${f1Num(x, "big")}</div>
      <div class="tp-id"><span class="th-lg">${x.flag || ""} ${esc(x.team_name)}</span><h1>${esc(x.name)}</h1>
        <div class="tp-form"><span class="f1-form">${(x.last || []).slice(0, 6).reverse().map(r => f1Pos(r.st === "Finished" || /Lap/.test(r.st || "") ? r.pos : null)).join("")}</span><small>ultime gare</small></div></div></div>
    <div class="tp-tiles">${tile(`${x.pos}<small>º</small>`, "nel mondiale") + tile(num(x.points, 0), "punti") + tile(x.wins, "vittorie") + tile(x.podiums, "podi")}</div>
    <div class="tp-tiles">${tile(x.poles, "pole") + tile(num(x.avg_fin), "arrivo medio") + tile(num(x.avg_q), "qualifica media") + tile(x.dnf, "ritiri")}</div>
  </div>`;
  const ev = INDEX.events.filter(e => e.sport === "f1" && !e.final);
  let next = "";
  if (ev.length) {
    const e = ev[0];
    try {
      const d = await getJSON(`data/events/${encodeURIComponent(e.id)}.json`);
      const y = (d.drivers || []).find(p => p.id === id);
      if (y) next = sec(`${esc(d.home.name)}`, `<div class="f1-stops">${[["win", "vittoria"], ["podium", "podio"], ["top10", "punti"], ["pole", "pole"]].filter(([k]) => y[k] != null)
        .map(([k, l]) => `<div><b>${pct(y[k])}</b><span>${l}</span></div>`).join("")}</div>
        ${y.circuit?.starts ? `<p class="note">Su questa pista: ${y.circuit.starts} gare, miglior risultato ${y.circuit.best ?? "–"}°, media ${num(y.circuit.avg)}°.</p>` : ""}
        <p><a class="tp-act" href="#/e/${encodeURIComponent(e.id)}" style="display:inline-flex">Apri il GP ›</a></p>`, f1When(d.date), "F1 prossimo GP");
    } catch { /* niente */ }
  }
  const K = x.career;
  const career = K ? sec(`Carriera dal ${K.since}`, `<div class="f1-stops">${[[K.starts, "GP"], [K.wins, "vittorie"], [K.podiums, "podi"], [K.poles, "pole"], [num(K.points, 0), "punti"]]
      .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>${K.best ? `<p class="note">Miglior risultato: ${K.best}°.</p>` : ""}`, "", "F1 carriera") : "";
  const duel = mate && x.mate ? sec("Contro il compagno", `<div class="f1-mate"><div><b>${x.mate.race[0]}-${x.mate.race[1]}</b><span>in gara</span></div><div><b>${x.mate.quali[0]}-${x.mate.quali[1]}</b><span>in qualifica</span></div></div>
      <p class="note">Quante volte ${esc(lastName(x.name))} è arrivato davanti a <a href="${f1Href(mate.id)}" style="color:var(--rosa);font-weight:600">${esc(lastName(mate.name))}</a> in questa stagione.</p>`, "", "F1 compagno") : "";
  const last = sec("Ultime gare", `<div class="f1-chart">${(x.last || []).slice().reverse().map(r => { const p = r.st === "Finished" || /Lap/.test(r.st || "") ? r.pos : null;
      return `<span title="${esc(r.gp)}"><i style="height:${p ? Math.max(6, 100 - (p - 1) * 4.5) : 4}%;background:${p ? c : "var(--ink-3)"}"></i><b>${p ?? "R"}</b></span>`; }).join("")}</div>
    <div class="rows games">${(x.last || []).map(r => `<div class="r"><span class="l">R${r.r} ${esc(r.gp)}</span><span class="v">${r.grid ? `<small class="faint">dal ${r.grid}°</small> ` : ""}${f1Pos(r.st === "Finished" || /Lap/.test(r.st || "") ? r.pos : null)}</span></div>`).join("")}</div>`, "", "F1 ultime");
  $app.innerHTML = backBtn("Indietro") + head + next + duel + career + last + `<p class="note">Dati da Jolpica (archivio Ergast), foto da Wikipedia.</p>`;
}

/* classifiche del mondiale (dentro Classifiche, voce Formula 1) */
function f1Standings(L) {
  const D = L.drivers || [], T = L.teams || [];
  return sec("Piloti", `<div class="std f1s"><div class="std-r head"><span>#</span><span>Pilota</span><span>V</span><span>Pt</span></div>
      ${D.map(x => `<a class="std-r" href="${f1Href(x.id)}"><span>${x.pos}</span><span class="std-t">${f1Num(x, "xs")}<b>${esc(x.name)}</b><small class="faint">${esc(x.team_name)}</small></span><span>${x.wins}</span><span><b>${num(x.points, 0)}</b></span></a>`).join("")}</div>`, `stagione ${L.season}`, "F1 piloti")
    + sec("Costruttori", `<div class="std f1s"><div class="std-r head"><span>#</span><span>Scuderia</span><span>V</span><span>Pt</span></div>
      ${T.map(t => `<div class="std-r"><span>${t.pos}</span><span class="std-t"><span class="tdot" style="background:${f1c(t.color)}"></span><b>${esc(t.name)}</b></span><span>${t.wins}</span><span><b>${num(t.points, 0)}</b></span></div>`).join("")}</div>`, "", "F1 costruttori")
    + `<p class="note">Classifica ufficiale del mondiale da Jolpica. Tocca un pilota per la sua pagina.</p>`;
}

/* esito delle giocate F1 in schedina e nelle schedine salvate, dal risultato scritto nei dati */
function f1Settle() {
  const evs = Object.fromEntries((INDEX?.events || []).filter(e => e.sport === "f1" && e.final).map(e => [e.id, e]));
  if (!Object.keys(evs).length) return false;
  const set = f => {
    if (f.result || f.sport !== "f1" || !evs[f.event]) return false;
    const r = f1Judge(f.label, evs[f.event]);
    if (r == null) return false;
    Object.assign(f, { result: r ? "win" : "lose", result_txt: r ? "Presa" : "Persa", final_score: `vince ${lastName(evs[f.event].final.winner)}`, result_why: "", closed: new Date().toISOString() });
    return true;
  };
  const list = favs();
  const a = list.map(set).some(Boolean);
  if (a) saveFavs(list);
  let b = false;
  if (typeof mySlips === "function") { const sl = mySlips(); b = sl.flatMap(s => s.legs).map(set).some(Boolean); if (b) saveMySlips(sl); }
  return a || b;
}

/* ------------------------------------------------------------------ tema della scheda in base al paese del GP (colori della bandiera) */
const F1_FLAGS = {
  "Stati Uniti": "repeating-linear-gradient(180deg,#b22234 0 12px,#fff 12px 24px) right/62% 100% no-repeat, radial-gradient(circle,#fff 1.4px,transparent 1.8px) 0 0/13px 13px, #3c3b6e",
  "Regno Unito": "linear-gradient(90deg,transparent 44%,#c8102e 44% 56%,transparent 56%), linear-gradient(0deg,transparent 40%,#c8102e 40% 60%,transparent 60%), linear-gradient(90deg,transparent 40%,#fff 40% 60%,transparent 60%), linear-gradient(0deg,transparent 34%,#fff 34% 66%,transparent 66%), linear-gradient(33deg,transparent 46%,#fff 46% 54%,transparent 54%), linear-gradient(-33deg,transparent 46%,#fff 46% 54%,transparent 54%), #012169",
  "Giappone": "radial-gradient(circle at 78% 40%,#bc002d 0 60px,transparent 61px), #fff",
  "Canada": "linear-gradient(90deg,#d52b1e 0 25%,#fff 25% 75%,#d52b1e 75%)",
  "Brasile": "radial-gradient(circle at 76% 45%,#002776 0 34px,transparent 35px), conic-gradient(from 45deg at 76% 45%,#fedf00 0 25%,transparent 0 50%,#fedf00 0 75%,transparent 0) , #009b3a",
  "Qatar": "linear-gradient(90deg,#fff 0 30%,#8a1538 30%)",
  "Emirati Arabi": "linear-gradient(90deg,#ef3340 0 25%,transparent 25%), linear-gradient(180deg,#00843d 0 33%,#fff 33% 66%,#000 66%)",
  "Bahrein": "linear-gradient(90deg,#fff 0 28%,#ce1126 28%)",
  "Arabia Saudita": "#006c35",
  "Monaco": "linear-gradient(180deg,#ce1126 0 50%,#fff 50%)",
  "Italia": "linear-gradient(90deg,#009246 0 33.3%,#fff 33.3% 66.6%,#ce2b37 66.6%)",
  "Spagna": "linear-gradient(180deg,#aa151b 0 25%,#f1bf00 25% 75%,#aa151b 75%)",
  "Messico": "linear-gradient(90deg,#006847 0 33.3%,#fff 33.3% 66.6%,#ce1126 66.6%)",
  "Australia": "radial-gradient(circle,#fff 1.6px,transparent 2px) 0 0/22px 22px, #012169",
  "Cina": "radial-gradient(circle at 18% 30%,#ffde00 0 14px,transparent 15px), #de2910",
  "Austria": "linear-gradient(180deg,#ed2939 0 33.3%,#fff 33.3% 66.6%,#ed2939 66.6%)",
  "Belgio": "linear-gradient(90deg,#000 0 33.3%,#fae042 33.3% 66.6%,#ed2939 66.6%)",
  "Ungheria": "linear-gradient(180deg,#ce2939 0 33.3%,#fff 33.3% 66.6%,#477050 66.6%)",
  "Olanda": "linear-gradient(180deg,#ae1c28 0 33.3%,#fff 33.3% 66.6%,#21468b 66.6%)",
  "Azerbaigian": "linear-gradient(180deg,#0092bc 0 33.3%,#e4002b 33.3% 66.6%,#00af66 66.6%)",
  "Singapore": "linear-gradient(180deg,#ef3340 0 50%,#fff 50%)",
  "Argentina": "linear-gradient(180deg,#74acdf 0 33.3%,#fff 33.3% 66.6%,#74acdf 66.6%)",
  "Portogallo": "linear-gradient(90deg,#006600 0 40%,#ff0000 40%)",
  "Germania": "linear-gradient(180deg,#000 0 33.3%,#dd0000 33.3% 66.6%,#ffce00 66.6%)",
  "Francia": "linear-gradient(90deg,#002395 0 33.3%,#fff 33.3% 66.6%,#ed2939 66.6%)",
};
const f1Theme = country => F1_FLAGS[country] || "";
const F1_MK_SES = { FP1: "fp1", FP2: "fp2", FP3: "fp3", Q: "pole", Race: "win" };

/* finestra di una sessione: classifica dei tempi, settori, velocità, passo lungo */
function f1SessionSheet(d, k) {
  const S0 = (d.sessions_laps || {})[k], ses = (d.gp?.sessions || []).find(s => s.k === k);
  const MKS = (d.market || {})[F1_MK_SES[k]];
  const S = S0 || (MKS ? { rows: [] } : null);
  if (!S) {
    const t = ses ? Date.parse(ses.date) : 0;
    toast(t > Date.now() ? `${ses?.name || "Sessione"}: si corre ${f1When(ses.date)}` : "Tempi in arrivo: OpenF1 li pubblica circa un'ora dopo la fine");
    return;
  }
  const byId = Object.fromEntries((d.drivers || []).map(x => [x.id, x]));
  const rows = S.rows.map(r => ({ ...r, x: byId[r.id] || { code: r.code, color: r.color, num: "" } }));
  const fmtT = t => { if (t == null) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return m ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3); };
  const best = f => Math.min(...rows.map(r => r[f]).filter(v => v != null));
  const who = r => `${r.x.num ? f1Num(r.x, "sm") : ""}<span class="f1-who"><b>${esc(r.x.short || r.code || "")}</b><small>${esc(r.team || r.x.team_name || "")}</small></span>`;
  const sorted = (f, hi) => rows.filter(r => r[f] != null).sort((a, b) => hi ? b[f] - a[f] : a[f] - b[f]);
  const tempi = sorted("lap").map((r, i, a) => `<div class="f1-ss" style="--tc:${f1c(r.color)}"><span class="f1-rk">${i + 1}</span>${who(r)}
      <span class="f1-st"><b>${fmtT(r.lap)}</b><small>${i ? `+${(r.lap - a[0].lap).toFixed(3)}` : `${r.laps} giri`}</small></span></div>`).join("");
  const b1 = best("s1"), b2 = best("s2"), b3 = best("s3");
  const sett = `<div class="f1-ss head"><span></span><span></span><span class="f1-s3"><i>S1</i><i>S2</i><i>S3</i></span></div>` + sorted("ideal").map((r, i) => `<div class="f1-ss" style="--tc:${f1c(r.color)}">
      <span class="f1-rk">${i + 1}</span>${who(r)}<span class="f1-s3">${[["s1", b1], ["s2", b2], ["s3", b3]].map(([f, b]) => `<i class="${r[f] === b ? "pb" : ""}">${r[f] != null ? r[f].toFixed(3) : "–"}</i>`).join("")}</span></div>`).join("");
  const vel = sorted("st", true).map((r, i) => `<div class="f1-ss" style="--tc:${f1c(r.color)}"><span class="f1-rk">${i + 1}</span>${who(r)}<span class="f1-st"><b>${r.st} km/h</b></span></div>`).join("");
  const lr = sorted("long");
  const passo = lr.length ? lr.map((r, i, a) => `<div class="f1-ss" style="--tc:${f1c(r.color)}"><span class="f1-rk">${i + 1}</span>${who(r)}
      <span class="f1-st"><b>${fmtT(r.long)}</b><small>${i ? `+${(r.long - a[0].long).toFixed(3)} · ` : ""}${r.long_n} giri</small></span></div>`).join("")
    : `<p class="note">Nessun pilota ha fatto abbastanza giri lenti e regolari (simulazione di gara) in questa sessione.</p>`;
  // quote del mercato per questa sessione (giro più veloce nelle prove, pole in qualifica, vincitore in gara)
  let quote = "";
  if (MKS) {
    const est = { pole: "pole", win: "win" }[F1_MK_SES[k]] || "pole";   // nelle prove: stima dal passo sul giro secco (come la pole)
    const list = (d.drivers || []).filter(x => MKS[x.id] != null).sort((a, b) => MKS[b.id] - MKS[a.id]);
    quote = list.map(x => `<div class="f1-ss" style="--tc:${f1c(x.color)}"><span class="f1-rk"></span>${f1Num(x, "sm")}<span class="f1-who"><b>${esc(x.short)}</b><small>${esc(x.team_name)}</small></span>
      <span class="f1-st"><b>q. ${odd(MKS[x.id])}</b><small>mercato ${pct(MKS[x.id])} · stima ${pct(x[est])}</small></span></div>`).join("")
      + `<p class="note">Quote del mercato di previsione Polymarket (${F1_MK_SES[k].startsWith("fp") ? "chi fa il giro più veloce della sessione" : F1_MK_SES[k] === "pole" ? "chi prende la pole" : "chi vince"}). «stima» = ${F1_MK_SES[k].startsWith("fp") ? "probabilità di pole del modello, il passo sul giro secco più vicino: nelle prove contano molto i programmi delle squadre" : "probabilità del modello"}. Restano stime.</p>`;
  }
  const tabs = (S0 ? [["t", "Tempi", tempi], ["s", "Settori", sett], ["v", "Velocità", vel], ["p", "Passo gara", passo]] : []).concat(quote ? [["q", "Quote", quote]] : []);
  const { el } = openSheet(`<h3 class="sheet-t">${esc(ses?.name || k)}</h3><p class="sheet-p" style="margin-top:-6px">${esc(d.home.name)}${ses ? ` · ${esc(f1When(ses.date))}` : ""}</p>
    <div class="f1-segrow">${seg("f1ss", tabs.map(([a, b]) => [a, b]), tabs[0][0])}</div>
    <div class="f1-ssbox">${tabs.map(([a, , h], i) => `<div data-segpane="f1ss:${a}" ${i ? "hidden" : ""}>${h}</div>`).join("")}</div>
    ${S0 ? `<p class="note">Tempi dai giri registrati da OpenF1. In viola il miglior settore della sessione. Passo gara = giro tipico nelle serie lunghe con tanta benzina (in prova). In qualifica l'ordine ufficiale può cambiare per penalità.</p>` : ""}`, { label: ses?.name || "Sessione" });
  el.querySelectorAll("[data-seg=f1ss] [data-v]").forEach(b => b.onclick = () => {
    el.querySelectorAll("[data-seg=f1ss] [data-v]").forEach(x => x.setAttribute("aria-pressed", x === b));
    el.querySelectorAll("[data-segpane^='f1ss:']").forEach(p => p.hidden = p.dataset.segpane !== `f1ss:${b.dataset.v}`);
  });
}
