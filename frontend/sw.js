const CACHE_NAME = 'weather-pwa-v1';
const STATIC_ASSETS = [
  '/', '/index.html', '/css/style.css', '/js/app.js', '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Only handle GET requests — ignore POST, PUT, DELETE, etc.
if (request.method !== 'GET') return;

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // network-first for API requests to backend

  // Only handle GET requests — ignore POST, PUT, DELETE, etc.
  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  // cache-first for static assets
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch (err) {
    const cached = await cache.match(req);
    return cached || new Response(JSON.stringify({error:'offline'}), {status:503, headers:{'Content-Type':'application/json'}});
  }
}

// listen for push
self.addEventListener('push', e => {
  let payload = { title:'Weather Update', body:'Click to open app' };
  try { payload = e.data.json(); } catch (err){}
  self.registration.showNotification(payload.title, { body: payload.body, icon: '/assets/icons/icon-192.png' });
});
