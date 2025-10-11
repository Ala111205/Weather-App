const CACHE_NAME = 'weather-pwa-v2';
const STATIC_ASSETS = [
  '/', '/index.html', '/css/style.css', '/js/app.js', '/manifest.json'
];

// Install event — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate event — claim clients
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Fetch event — cache strategy
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Network-first for API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

// Network-first function for APIs
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const resp = await fetch(req);
    // Only cache GET responses
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
  let data = { title: 'Weather Update', body: 'Click to open app', icon:'assets/icons/icon-192.png' };
  try {
    data = event.data.json().data;
  } catch (err) {}
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.icon
    })
  );
});

