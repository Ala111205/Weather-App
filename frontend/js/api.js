const BASE_URL = 'https://weather-app-lsaz.onrender.com';

async function fetchJSON(url, retries=2) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // rate-limit handling
      if (res.status === 429) throw new Error('Rate limit exceeded');
      throw new Error(`API error ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (retries>0) {
      await new Promise(r=>setTimeout(r, 500*(3-retries)));
      return fetchJSON(url, retries-1);
    }
    throw err;
  }
}

export async function getCurrentByCity(city, units='metric') {
  const url = `${BASE_URL}/api/weather/current?q=${encodeURIComponent(city)}&units=${units}`;
  return fetchJSON(url);
}

export async function getCurrentByCoords(lat, lon, units='metric') {
  const url = `${BASE_URL}/api/weather/current?lat=${lat}&lon=${lon}&units=${units}`;
  return fetchJSON(url);
}

export async function getForecast(qOrLat, lon=null, units='metric') {
  const url = lon===null ? `${BASE_URL}/api/weather/forecast?q=${encodeURIComponent(qOrLat)}&units=${units}`
                        : `${BASE_URL}/api/weather/forecast?lat=${qOrLat}&lon=${lon}&units=${units}`;
  return fetchJSON(url);
}

export async function getAir(lat, lon) {
  const url = `${BASE_URL}/api/weather/air?lat=${lat}&lon=${lon}`;
  return fetchJSON(url);
}

export async function reverseGeocode(lat, lon) {
  const url = `${BASE_URL}/api/weather/reverse?lat=${lat}&lon=${lon}`;
  return fetchJSON(url);
}

export async function pushCityWeather(cityData) {
  try {
    const { name } = cityData;

    // Get the current active push subscription
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    // Only proceed if a subscription exists
    if (!sub) {
      console.warn('⚠️ No push subscription found.');
      return;
    }

    // Call the new /search endpoint for manual push
    await fetch(`${BASE_URL}/api/push/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: name,
        endpoint: sub.endpoint
      })
    });

    console.log(`📩 Push requested for ${name}`);
  } catch (err) {
    console.error('Push failed:', err);
  }
}

export async function subscribePush(subscription) {
  const res = await fetch(`${BASE_URL}/api/push/subscribe`, { method:'POST', body: JSON.stringify(subscription), headers:{'Content-Type':'application/json'}});
  return res.json();
}

export async function unsubscribePush(subscription) {
  if (!subscription || !subscription.endpoint) return;

  try {
    const res = await fetch(`${BASE_URL}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
    const data = await res.json();
    console.log('Unsubscribe response:', data);
    return data;
  } catch (err) {
    console.error('Failed to unsubscribe:', err);
  }
}

// ✅ AUTO CHECK & REPAIR SUBSCRIPTION (NEW FUNCTION)
export async function verifyAndRestoreSubscription(vapidPublicKey) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (!sub) {
      console.log('📩 No existing push subscription — subscribing new...');
      await createAndSendSubscription(reg, vapidPublicKey);
      return;
    }

    // Check if subscription exists in backend
    const res = await fetch(`${BASE_URL}/api/push/check-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });

    const data = await res.json();

    if (!data.exists) {
      console.log('🔁 Subscription missing in backend — re-registering...');
      await createAndSendSubscription(reg, vapidPublicKey);
    } else {
      console.log('✅ Subscription verified with backend');
    }
  } catch (err) {
    console.error('❌ Failed to verify subscription:', err);
  }
}

async function createAndSendSubscription(reg, vapidKey) {
  const newSub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  await fetch(`${BASE_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newSub),
  });

  console.log('✅ Push subscription created & synced with backend');
}

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

