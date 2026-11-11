// Timer di Cloudflare: agli orari scritti in wrangler.jsonc avvia su GitHub il workflow "Aggiorna dati".
// Serve perché gli orari programmati di GitHub partono con ore di ritardo (restano come riserva).
// Il segreto GITHUB_TOKEN si imposta su Cloudflare (Worker "pronostici" → Settings → Variables and Secrets):
// token GitHub "fine-grained" limitato a questo repository, permesso Actions: Read and write.
const REPO = "ChiccoHD/pronostici";
const WORKFLOW = "aggiorna-dati.yml";

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

export default {
  // Il sito resta fatto di soli file statici: qui arriva solo ciò che non esiste in public/.
  fetch(request, env) { return env.ASSETS.fetch(request); },
  scheduled(event, env, ctx) { ctx.waitUntil(avvia(env)); },
};
