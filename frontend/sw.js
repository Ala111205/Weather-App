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
const lastPushMap = new Map();
const MIN_PUSH_INTERVAL = 10 * 60 * 1000; // 10 min

self.addEventListener('push', event => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json()?.data || {};
  } catch {
    console.warn('⚠️ Malformed push data');
    return;
  }

  const id = payload.id || `${payload.title || 'weather'}-${(payload.body || '').slice(0, 40)}`;
  const city = payload.title?.replace(/^🌤 Weather in /, '') || '';
  const now = Date.now();

  const title = payload.title || 'Weather Update';
  const body = payload.body || 'Click to open app';
  const icon = payload.icon || `${self.registration.scope}assets/icons/icon-192.png`;
  const badge = payload.badge || icon;

  event.waitUntil((async () => {
    const existing = await self.registration.getNotifications({ tag: id });
    if (existing && existing.length) return; // skip duplicates

    // Generate unique tag for every push
    const uniqueTag = `${id}-${Date.now()}`;
    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: uniqueTag,
      renotify: false,
      data: { id, timestamp: now }
    });
  })());
});

// Notification click: open PWA
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});