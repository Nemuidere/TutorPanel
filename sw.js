// Offline support: the newest code when online, the saved copy when offline or when the network takes longer than 3 s.
// FILES is saved on install, so even the first launch after installing works offline next time (tests/sw.test.mjs checks the list).
const CACHE = 'tutorpanel';
const FILES = ['./', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'vendor/preact-htm.mjs',
  'js/app.js', 'js/store.js', 'js/data.js', 'js/dates.js', 'js/schedule.js',
  'js/ui/shared.js', 'js/ui/forms.js', 'js/ui/students.js', 'js/ui/student.js', 'js/ui/week.js', 'js/ui/lessons.js', 'js/ui/settings.js'];

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); });
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
