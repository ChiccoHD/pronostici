/* Cerca (#/cerca): squadre, tennisti, partite e campionati in tutta l'app.
   Squadre dalle classifiche (data/leagues), tennisti dai profili (data/tennis), partite dall'elenco (INDEX).
   I file si caricano solo la prima volta che si apre la ricerca. */

const SEARCH = { q: "", pool: null };
const sfold = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function searchPool() {
  if (SEARCH.pool) return SEARCH.pool;
  const teams = new Map();
  const tabs = typeof TABLE_LEAGUES !== "undefined" ? TABLE_LEAGUES : [];
  await Promise.allSettled(tabs.map(async ([k, label]) => {
    const L = await leagueData(k);
    for (const r of L?.table || []) {
      const key = `${k}|${r.id}`;
      if (!teams.has(key)) teams.set(key, { name: r.name, lk: k, id: r.id, logo: r.logo, color: r.color, league: label, pos: r.pos });
    }
  }));
  const players = [];
  await Promise.allSettled(["atp", "wta"].map(async tour => {
    const T = await getJSON(`data/tennis/${tour}.json`);
    for (const p of Object.values(T?.players || {})) players.push({ name: p.name, tour, photo: p.photo, elo: p.elo });
  }));
  const drivers = [];
  try { const F = await leagueData("f1"); for (const x of F?.drivers || []) drivers.push(x); } catch { /* niente */ }
  SEARCH.pool = { teams: [...teams.values()], players, drivers };
  return SEARCH.pool;
}

function searchMatch(q, ...fields) {
  const words = sfold(q).split(/\s+/).filter(Boolean);
  const hay = sfold(fields.join(" "));
  return words.length && words.every(w => hay.includes(w));
}

async function showSearch() {
  $app.innerHTML = backBtn("Partite") + `<h1 class="page-h">Cerca</h1>
    <div class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="search-q" type="search" inputmode="search" autocomplete="off" placeholder="Squadra, tennista, campionato…" value="${esc(SEARCH.q)}" aria-label="Cerca">
      <button type="button" class="search-x" aria-label="Cancella" ${SEARCH.q ? "" : "hidden"}>×</button></div>
    <a class="cmp-entry" href="#/confronta"><span>⚖️</span><span><b>Confronta</b><small>due squadre o due tennisti, anche se non si affrontano</small></span><em>›</em></a>
    <div id="srch-res"></div>`;
  const inp = document.getElementById("search-q"), x = $app.querySelector(".search-x");
  let t = null;
  inp.oninput = () => { SEARCH.q = inp.value; x.hidden = !inp.value; clearTimeout(t); t = setTimeout(searchRender, 120); };
  x.onclick = () => { inp.value = ""; SEARCH.q = ""; x.hidden = true; searchRender(); inp.focus(); };
  setTimeout(() => inp.focus(), 50);
  searchRender();
  searchPool().then(() => { if (location.hash.startsWith("#/cerca")) searchRender(); });
}

function searchRender() {
  const box = document.getElementById("srch-res");
  if (!box) return;
  const q = SEARCH.q.trim();
  if (q.length < 2) {
    const mine = typeof myTeams === "function" ? myTeams() : [];
    box.innerHTML = `<p class="note" style="padding:6px 4px">Scrivi almeno due lettere: cerco tra squadre, tennisti, partite in elenco e campionati.${mine.length ? "" : " Dalla pagina di una squadra puoi seguirla e ritrovarla in Tu."}</p>`;
    return;
  }
  const P = SEARCH.pool, now = Date.now();
  const evs = (INDEX?.events || []).filter(e => searchMatch(q, e.home, e.away, e.league_name))
    .sort((a, b) => Math.abs(new Date(a.date) - now) - Math.abs(new Date(b.date) - now)).slice(0, 12)
    .sort((a, b) => a.date.localeCompare(b.date));
  const teams = P ? P.teams.filter(t => searchMatch(q, t.name)).slice(0, 12) : [];
  const players = P ? P.players.filter(p => searchMatch(q, p.name)).sort((a, b) => (b.elo || 0) - (a.elo || 0)).slice(0, 10) : [];
  const drivers = P?.drivers ? P.drivers.filter(x => searchMatch(q, x.name, x.code, x.team_name)).slice(0, 8) : [];
  const leagues = Object.entries(LEAGUES).flatMap(([sp, l]) => l.map(([k, n]) => ({ k, n, sp }))).filter(l => searchMatch(q, l.n, l.k.replace(/-/g, " ")));
  let html = "";
  if (teams.length) html += sec("Squadre", `<div class="rows">${teams.map(t => `<a class="r srch" href="${teamHref(t.lk, t.id)}">
      <span class="l">${t.logo ? img(t.logo, "tlogo") : `<span class="tdot" style="background:${t.color ? "#" + String(t.color).replace("#", "") : "var(--ink-3)"}"></span>`}<b>${esc(t.name)}</b></span>
      <span class="v faint">${esc(t.league)}${t.pos ? `, ${t.pos}°` : ""} ›</span></a>`).join("")}</div>`, `${teams.length}`, "Squadre trovate");
  if (players.length) html += sec("Tennisti", `<div class="rows">${players.map(p => `<a class="r srch" href="${playerHref(p.tour, p.name)}">
      <span class="l">${p.photo ? img(p.photo, "srch-ph") : `<span class="srch-ph none">🎾</span>`}<b>${esc(p.name)}</b></span><span class="v faint">${p.tour.toUpperCase()} ›</span></a>`).join("")}</div>`, `${players.length}`, "Tennisti trovati");
  if (drivers.length) html += sec("Piloti di F1", `<div class="rows">${drivers.map(x => `<a class="r srch" href="${f1Href(x.id)}">
      <span class="l">${f1Num(x, "xs")}<b>${esc(x.name)}</b></span><span class="v faint">${esc(x.team_name)}, ${x.pos}° ›</span></a>`).join("")}</div>`, `${drivers.length}`, "Piloti trovati");
  if (evs.length) html += sec("Partite", evs.map(e => e.final ? fixtureDone(e) : fixture(e)).join(""), `${evs.length}`, "Partite trovate");
  if (leagues.length) html += sec("Campionati", `<div class="rows">${leagues.map(l => {
    const hasTable = typeof TABLE_LEAGUES !== "undefined" && TABLE_LEAGUES.some(([k]) => k === l.k);
    return `<a class="r srch" href="${hasTable ? `#/classifiche/${l.k}` : "#/"}" data-srch-league="${esc(l.k)}" data-srch-sport="${esc(l.sp)}"><span class="l">${leagueMark(l.k)}<b>${esc(l.n)}</b></span><span class="v faint">${hasTable ? "classifica" : "partite"} ›</span></a>`;
  }).join("")}</div>`, "", "Campionati trovati");
  if (!html) html = `<div class="empty"><b>Nessun risultato per "${esc(q)}"</b>${P ? "Prova con una parte del nome, per esempio solo il cognome." : "Sto ancora caricando squadre e tennisti…"}</div>`;
  box.innerHTML = html;
  box.querySelectorAll('[data-srch-league]').forEach(a => {
    if (a.getAttribute("href") !== "#/") return;
    a.onclick = () => { state.sport = a.dataset.srchSport; state.league = a.dataset.srchLeague; state.day = "all"; save("sport", state.sport); save("league", state.league); };
  });
  if (typeof bindList === "function") bindList(box);
}
