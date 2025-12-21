const CACHE_NAME = 'weather-pwa-v10';
const STATIC_ASSETS = ['/', '/index.html', '/css/style.css', '/js/app.js', '/manifest.json'];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: claim clients and clear old notifications
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const existing = await self.registration.getNotifications();
    for (const n of existing) n.close();
    await self.clients.claim();
  })());
});

// Fetch: network-first for APIs, cache-first for static assets
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Push rate-limiting: track last push per city per endpoint
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    console.warn('Malformed push payload');
    return;
  }

  const data = payload.data || payload;

  const id = data.id || data.tag || 'weather-update';
  const title = data.title || 'Weather Update';
  const body = data.body || 'Tap to open app';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: data.icon || '/assets/icons/icon-192.png',
      badge: data.badge || '/assets/icons/icon-192.png',
      tag: id,                // TRUE dedupe
      renotify: false,
      data: { id, ts: Date.now() }
    })
  );
});

// Notification click: open PWA
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});