// ======================== CONFIG ========================
const BASE_URL = 'https://weather-app-lsaz.onrender.com';
export const VAPID_KEY =
  'BCkItBSMU1gfKoiNDaKLZj9xvKGPFyYn9dqZ29_wNunc4_z-ITd9xhvxXU8fXTN0JQbb8b2YujBCCPi2M05m9co';

// ======================== HELPERS ========================
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function fetchJSON(url, retries = 2) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 429) throw new Error('Rate limit exceeded');
      throw new Error(`API error ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 500 * (3 - retries)));
      return fetchJSON(url, retries - 1);
    }
    throw err;
  }
}

// ======================== WEATHER API ========================
export async function getCurrentByCity(city, units = 'metric') {
  return fetchJSON(`${BASE_URL}/api/weather/current?q=${encodeURIComponent(city)}&units=${units}`);
}

export async function getCurrentByCoords(lat, lon, units = 'metric') {
  return fetchJSON(`${BASE_URL}/api/weather/current?lat=${lat}&lon=${lon}&units=${units}`);
}

export async function getForecast(qOrLat, lon = null, units = 'metric') {
  const url = lon === null
    ? `${BASE_URL}/api/weather/forecast?q=${encodeURIComponent(qOrLat)}&units=${units}`
    : `${BASE_URL}/api/weather/forecast?lat=${qOrLat}&lon=${lon}&units=${units}`;
  return fetchJSON(url);
}

export async function getAir(lat, lon) {
  return fetchJSON(`${BASE_URL}/api/weather/air?lat=${lat}&lon=${lon}`);
}

export async function reverseGeocode(lat, lon) {
  return fetchJSON(`${BASE_URL}/api/weather/reverse?lat=${lat}&lon=${lon}`);
}

// ======================== SERVICE WORKER ========================
export async function getActiveSW() {
  if (!('serviceWorker' in navigator)) return null;

  let reg = await navigator.serviceWorker.getRegistration();

  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js');
  }

  // 🔥 CRITICAL: wait until this page is controlled
  if (!navigator.serviceWorker.controller) {
    await new Promise(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
  }

  reg = await navigator.serviceWorker.getRegistration();

  if (!reg?.active) {
    throw new Error('Service Worker not active');
  }

  return reg;
}

// ======================== PUSH MANAGEMENT ========================
export async function pushCityWeather(cityData) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    await fetch(`${BASE_URL}/api/push/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: cityData.name, endpoint: sub.endpoint })
    });
  } catch (err) {
    console.error('Push failed:', err);
  }
}

export async function checkSubscription(endpoint) {
  try {
    const res = await fetch(`${BASE_URL}/api/push/check-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint })
    });
    return await res.json(); // { exists: true/false }
  } catch {
    return { exists: false };
  }
}

// Update last searched city for an existing subscription
export async function updateSubscriptionCity({ endpoint, city }) {
  if (!endpoint || !city) return;

  const res = await fetch('/api/subscription/update-city', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      city
    })
  });

  if (!res.ok) {
    throw new Error('Failed to update subscription city');
  }

  return res.json();
}

export async function subscribePush(subscription) {
  const res = await fetch(`${BASE_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription)
  });
  return res.json();
}

export async function unsubscribePush(subscription) {
  if (!subscription?.endpoint) return;
  try {
    const res = await fetch(`${BASE_URL}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
    return await res.json();
  } catch (err) {
    console.error('Failed to unsubscribe:', err);
  }
}

// ======================== FULL SUBSCRIPTION FLOW ========================
export async function createAndSendSubscription(reg) {
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
  });
  await subscribePush(sub);
  return sub;
}

export async function verifyAndRestoreSubscription() {
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) return await createAndSendSubscription(reg);

    const check = await checkSubscription(sub.endpoint);
    if (!check.exists) sub = await createAndSendSubscription(reg);

    return sub;
  } catch (err) {
    console.error('❌ Subscription verify failed:', err);
  }
}