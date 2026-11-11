/* Pronostici — service worker: serve solo a ricevere le notifiche delle partite (nessuna copia del sito). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

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
