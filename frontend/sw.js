const CACHE_NAME = 'weather-pwa-v7'; 
const STATIC_ASSETS = [
  '/', '/index.html', '/css/style.css', '/js/app.js', '/manifest.json'
];

// Install event — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  console.log('🛠 SW install event');
  self.skipWaiting();
});

// Activate event — claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const clientsList = await clients.matchAll({ includeUncontrolled: true });
      console.log(`🌐 Clients controlled: ${clientsList.length}`);
      // Clear any stale notifications on activate
      const existing = await self.registration.getNotifications();
      for (const n of existing) n.close();
      await self.clients.claim();
    })()
  )
  console.log('⚡ SW activate event', CACHE_NAME);
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

let lastPushTime = 0;

// Push notifications listener
self.addEventListener('push', event => {
  const now = Date.now();
  if (now - lastPushTime < 2000) {
    console.log('⏱️ Duplicate push suppressed (timing)');
    return;
  }
  lastPushTime = now;

  console.log('🔥 Push received at', new Date().toISOString());
  if (!event.data) return; 

  let payload = {};
  try {
    payload = event.data.json()?.data || {}; 
  } catch {
    console.warn('⚠️ Malformed push event data');
    return;
  }

  // Defaults
  const id = payload.id || `${(payload.title||'weather')}-${(payload.body||'').slice(0,40)}`;
  const title = payload.title || 'Weather Update';
  const body = payload.body || 'Click to open app';
  const icon = payload.icon || `${self.registration.scope}assets/icons/icon-192.png`;
  const badge = payload.badge || icon;

  console.log('🔥 Push received:', id);
  
  // Use the id as tag
  const tag = id;

  event.waitUntil((async () => {
    // Check for existing notifications with same tag
    const existing = await self.registration.getNotifications({ tag });
    if (existing && existing.length > 0) {
      console.log('🚫 Duplicate push ignored:', tag);
      return;
    }

    // Show notification (tag prevents duplicates)
    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify: false,
      data: { id, timestamp: Date.now() }
    });
    console.log('✅ Notification shown:', tag);
  })());
});

// Notification click
self.addEventListener('notificationclick', event => {
  console.log('🖱 Notification clicked');
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
