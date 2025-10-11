const CACHE_NAME = 'weather-pwa-v2'; 
const STATIC_ASSETS = [
  '/', '/index.html', '/css/style.css', '/js/app.js', '/manifest.json'
];

// Install event — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  console.log('🛠 SW install event');
  self.skipWaiting(); // activate immediately
});

// Activate event — claim clients
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
  console.log('⚡ SW activate event');
});

// Fetch event — cache strategy
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

// Network-first function for APIs
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const resp = await fetch(req);
    if (req.method === 'GET' && resp && resp.ok) {
      cache.put(req, resp.clone());
    }
    return resp;
  } catch (err) {
    const cached = await cache.match(req);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Push notifications listener
self.addEventListener('push', event => {
  if (!event.data) return; // ignore empty pushes

  let payload = {};
  try {
    payload = event.data.json()?.data || {}; // read `data` from backend
  } catch {
    console.warn('⚠️ Malformed push event data');
    return;
  }

  // Defaults
  const title = payload.title || 'Weather Update';
  const body = payload.body || 'Click to open app';
  const icon = payload.icon || `${self.registration.scope}assets/icons/icon-192.png`;
  const badge = payload.badge || icon;

  event.waitUntil(
    self.registration.showNotification(title, { body, icon, badge })
  );
});

// Notification click
self.addEventListener('notificationclick', event => {
  console.log('🖱 Notification clicked');
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
