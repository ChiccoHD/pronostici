// Worker di Cloudflare: pubblica il sito (cartella public/), fa da timer per l'aggiornamento dei dati
// e manda le notifiche delle partite (worker/push.js).
//
// Timer: un solo orario in wrangler.jsonc ("ogni minuto"). Ogni minuto controlla le notifiche;
// agli orari di UPDATE avvia su GitHub il workflow "Aggiorna dati" (gli orari di GitHub partono con ore
// di ritardo e restano solo come riserva). Il segreto GITHUB_TOKEN si imposta su Cloudflare
// (Worker "pronostici" → Settings → Variables and Secrets): token GitHub "fine-grained" limitato a questo
// repository, permesso Actions: Read and write.
export { Push } from "./push.js";

const REPO = "ChiccoHD/pronostici";
const WORKFLOW = "aggiorna-dati.yml";
// Orari UTC dell'aggiornamento, gli stessi del workflow: in Italia d'inverno 7:17, 10:47, 13:47, 16:47, 19:47, 23:17
const UPDATE = [[6, 17], [22, 17], [9, 47], [12, 47], [15, 47], [18, 47]];

async function avvia(env) {
  if (!env.GITHUB_TOKEN) { console.log("Timer: manca il segreto GITHUB_TOKEN, aggiornamento non avviato"); return; }
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pronostici-timer",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  console.log(r.ok ? "Timer: aggiornamento avviato" : `Timer: GitHub ha risposto ${r.status} ${await r.text()}`);
}

const pushObject = env => env.PUSH.get(env.PUSH.idFromName("notifiche"));

async function notifiche(env) {
  // l'elenco delle partite è un file del sito: lo legge senza uscire da Cloudflare
  const r = await env.ASSETS.fetch(new Request("https://assets.local/data/index.json"));
  if (!r.ok) return;
  const idx = await r.json();
  const events = (idx.events || []).filter(e => e.espn).map(e => ({ id: e.id, sport: e.sport, espn: e.espn, date: e.date, home: e.home, away: e.away, league_name: e.league_name, final: !!e.final }));
  await pushObject(env).fetch("https://push/api/push/tick", { method: "POST", body: JSON.stringify({ events }) });
}

export default {
  // Il sito resta fatto di soli file statici: qui arriva solo ciò che non esiste in public/.
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/push/") && !url.pathname.endsWith("/tick")) return pushObject(env).fetch(request);
    return env.ASSETS.fetch(request);
  },
  scheduled(event, env, ctx) {
    const d = new Date(event.scheduledTime);
    if (UPDATE.some(([h, m]) => d.getUTCHours() === h && d.getUTCMinutes() === m)) ctx.waitUntil(avvia(env));
    ctx.waitUntil(notifiche(env).catch(e => console.log("Notifiche:", e?.message || e)));
  },
};
