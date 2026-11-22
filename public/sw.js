/* Pronostici — service worker
   1. notifiche delle partite (push);
   2. app veloce e usabile anche con poca rete:
      - file dell'app (html, js, css, icone): subito dalla copia sul telefono, aggiornati in sottofondo
        (se cambiano, l'app mostra "Aggiornamento disponibile");
      - dati (data/*.json): prima la rete, con 4 secondi di pazienza; senza rete l'ultima copia salvata;
      - loghi e foto ESPN: dalla copia sul telefono, scaricati una volta sola. */
const APP = "pronostici-app-v37", DATA = "pronostici-data-v1", IMG = "pronostici-img-v1";
const SHELL = ["./", "app.css", "app.js", "teams.js", "slip.js", "me.js", "live.js", "sheet.js", "notify.js", "novita.js", "layout.js", "search.js", "share.js", "compare.js", "f1.js", "extra.js",
  "manifest.webmanifest", "icon-192.png", "badge-96.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(async c => {
    for (const u of SHELL) { try { const r = await fetch(u, { cache: "no-cache" }); if (r.ok) await c.put(u, await clean(r)); } catch { /* niente */ } }
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (![APP, DATA, IMG].includes(k)) await caches.delete(k);
  await self.clients.claim();
})()));

/* Cloudflare rimanda /index.html a / : una risposta "rediretta" non si può usare per aprire la pagina
   (il telefono mostra "Impossibile raggiungere il sito"), quindi se ne fa una copia pulita */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

/* controllo completo dei file dell'app: lo chiede la pagina all'apertura e ogni volta che torna in primo piano
   (un'app sulla schermata Home spesso non ricarica nulla da sola, quindi non si accorgerebbe delle novità) */
async function checkShell() {
  const cache = await caches.open(APP);
  let changed = false;
  for (const u of SHELL) {
    try {
      const res = await clean(await fetch(u, { cache: "no-cache" }));
      if (!res.ok) continue;
      const hit = await cache.match(u, { ignoreSearch: true });
      if (hit && (await hit.clone().text()) !== (await res.clone().text())) changed = true;
      await cache.put(u, res);
    } catch { /* senza rete: si riprova la prossima volta */ }
  }
  if (changed) await tell({ type: "update" });
}
self.addEventListener("message", e => { if (e.data?.type === "check") e.waitUntil(checkShell()); });

const tell = msg => self.clients.matchAll({ type: "window" }).then(ws => ws.forEach(w => w.postMessage(msg)));

async function staleWhileRevalidate(req) {
  const cache = await caches.open(APP);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req, { cache: "no-cache" }).then(clean).then(async res => {
    if (res.ok) {
      if (hit) {
        const [a, b] = await Promise.all([hit.clone().text(), res.clone().text()]);
        if (a !== b) tell({ type: "update" });
      }
      await cache.put(req, res.clone());
    }
    return res;
  }).catch(() => null);
  return hit || (await net) || new Response("", { status: 504 });
}

async function networkFirst(req) {
  const cache = await caches.open(DATA);
  const timeout = new Promise(r => setTimeout(() => r(null), 4000));
  const net = fetch(req, { cache: "no-cache" }).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  const res = await Promise.race([net, timeout]);
  if (res) return res;
  const hit = await cache.match(req);
  if (hit) {
    const h = new Headers(hit.headers);
    h.set("X-Copia", "1");                // l'app avvisa che sta mostrando dati salvati
    return new Response(await hit.blob(), { status: 200, headers: h });
  }
  return (await net) || new Response("{}", { status: 504, headers: { "Content-Type": "application/json" } });
}

async function imageCacheFirst(req) {
  const cache = await caches.open(IMG);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") {
      await cache.put(req, res.clone());
      const keys = await cache.keys();
      if (keys.length > 600) await Promise.all(keys.slice(0, keys.length - 600).map(k => cache.delete(k)));
    }
    return res;
  } catch { return new Response("", { status: 504 }); }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return;                         // notifiche e cronaca: sempre dal server
    if (url.pathname.includes("/data/")) return e.respondWith(networkFirst(req));
    if (req.mode === "navigate") {
      // apertura della pagina: copia salvata della home ("./"); se qualcosa va storto, direttamente dalla rete
      return e.respondWith(staleWhileRevalidate(new Request(new URL("./", self.registration.scope).href))
        .then(r => r.ok ? r : fetch(req)).catch(() => fetch(req)));
    }
    return e.respondWith(staleWhileRevalidate(req));
  }
  if (/espncdn\.com|wikimedia\.org|thesportsdb\.com/.test(url.hostname) && req.destination === "image") return e.respondWith(imageCacheFirst(req));
});

/* ------------------------------------------------------------------ notifiche */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Pronostici", body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Pronostici", {
    body: d.body || "", tag: d.tag, renotify: !!d.tag, icon: "icon-192.png", badge: "badge-96.png",
    data: { url: d.url || "#/" }, lang: "it",
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "#/", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); return w.navigate(target).catch(() => null); }
    }
    return self.clients.openWindow(target);
  })());
});
