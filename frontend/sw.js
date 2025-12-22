const CACHE_NAME = 'weather-pwa-v12';
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
    // 🔥 DELETE OLD CACHES
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );

    // Close existing notifications
    const notifs = await self.registration.getNotifications();
    notifs.forEach(n => n.close());

    // Take control immediately
    await self.clients.claim();
  })());
});

// Fetch: network-first for APIs, cache-first for static assets
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 🔥 JS & HTML must be NETWORK FIRST
  if (
    req.destination === 'script' ||
    req.destination === 'document'
  ) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // APIs: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const resp = await fetch(req);
    if (resp?.ok) cache.put(req, resp.clone());
    return resp;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Push notification handling (unique tag every time)
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    console.error('⚠️ Invalid push payload', err);
    return;
  }

  // Build unique notification tag
    const id = `weather-${Date.now()}`;
    const title = `Weather: ${data.name}`;
    const body = `Temp: ${data.lastData?.temp ?? '-'}°C, ${data.lastData?.desc ?? ''}`;


  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: payload.icon || '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      tag: id, // unique → multiple notifications allowed
      renotify: false,
      data: payload.data || {}
    })
  );
});

// Notification click opens or focuses the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      if (windows.length) return windows[0].focus();
      return clients.openWindow('/');
    })
  );
});

// Message listener: clear notifications on unsubscribe
self.addEventListener('message', event => {
  if (event.data?.type === 'UNSUBSCRIBE') {
    self.registration.getNotifications().then(notifs => notifs.forEach(n => n.close()));
  }
});