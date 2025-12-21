const CACHE_NAME = 'weather-pwa-v11';
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
    existing.forEach(n => n.close());
    await self.clients.claim();
  })());
});

// Fetch: network-first for APIs, cache-first for static assets
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
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
  try { payload = event.data.json(); } 
  catch { 
    console.warn('⚠️ Malformed push payload'); 
    return; 
  }

  const data = payload.data || payload;
  const id = `${data.id || 'weather'}-${Date.now()}`; // unique tag each time
  const title = data.title || 'Weather Update';
  const body = data.body || 'Tap to open app';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: data.icon || '/assets/icons/icon-192.png',
      badge: data.badge || '/assets/icons/icon-192.png',
      tag: id,        // unique tag ensures all notifications show
      renotify: false,
      data: { id, ts: Date.now() }
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