// Offline support: the newest code when online, the saved copy when offline or when the network takes longer than 3 s.
const CACHE = 'tutorpanel';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' })
      .then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
    try {
      const res = await Promise.race([net, new Promise(r => setTimeout(r, 3000))]);
      if (res) return res;
    } catch { /* offline: fall back to the saved copy */ }
    return (await cache.match(req, { ignoreSearch: true })) ?? net;
  })());
});
