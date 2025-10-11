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
  console.log('💌 Push event received');

  let data = { 
    title: 'Weather Update', 
    body: 'Click to open app', 
    icon: '',
    badge: ''
  };

  try {
    const eventData = event.data?.json();
    data = eventData?.data || eventData || data;
  } catch (err) {
    console.warn('⚠️ Push event data missing or invalid');
  }

  if (data._notified) return; // prevent duplicates
  data._notified = true;

  // Determine base URL dynamically
  const baseURL = (self.registration.scope.startsWith('http://127.0.0.1') || self.registration.scope.startsWith('http://localhost'))
    ? 'http://127.0.0.1:5500'
    : 'https://weather-pwa-blush.vercel.app';

  const iconUrl = data.icon?.startsWith('http') ? data.icon : `${baseURL}/assets/icons/icon-192.png`;
  const badgeUrl = data.badge?.startsWith('http') ? data.badge : iconUrl;

  console.log('SW push notification:', { title: data.title, body: data.body, iconUrl, badgeUrl });

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: iconUrl,
      badge: badgeUrl
    })
  );
});

// Notification click
self.addEventListener('notificationclick', event => {
  console.log('🖱 Notification clicked');
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
