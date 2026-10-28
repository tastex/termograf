// Термограф: the page itself works offline; weather requests always go to the network.
const CACHE = 'termograf-v39';
const SHELL = ['./', './index.html', './three.html', './years.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // weather and fonts: straight to the network
  if (req.mode === 'navigate') { // fresh page when online, cached page when offline (any ?city=…); each page under its own name
    const page = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    // no-cache: the browser checks with the server instead of handing back its own outdated copy of the page
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(page, copy)); return r; })
      .catch(() => caches.match(page).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
