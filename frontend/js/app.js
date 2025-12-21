import * as API from './api.js';
import * as UI from './ui.js';
import { el, parseLatLonInput, showToast, formatTemp } from './utils.js';
import { initMap, showLocation } from './map.js';
import { renderTempChart } from './charts.js';

let isCelsius = true;
let recent = JSON.parse(localStorage.getItem('recentCities')||'[]');
let compareCities = JSON.parse(localStorage.getItem('compareCities')) || [];

const cityInput = el('cityInput');
const searchBtn = el('searchBtn');
const compareBtn = el('compareBtn');
const geoBtn = el('geoBtn');
const unitToggle = el('unitToggle');
const themeToggle = el('themeToggle');
const compareList = el('compareList');
const subscribeBtn = el('subscribeBtn');
const unsubscribeBtn = el('unsubscribeBtn');

async function performSearch(term) {
  try {
    showToast('Fetching weather...');
    let coords = parseLatLonInput(term);
    let current = coords ? await API.getCurrentByCoords(coords.lat, coords.lon, isCelsius?'metric':'imperial')
                         : await API.getCurrentByCity(term, isCelsius?'metric':'imperial');

    UI.renderCurrent(current, isCelsius);

    const lat = current.coord.lat, lon = current.coord.lon;
    showLocation(lat, lon, `${current.name}`);
    const forecast = await API.getForecast(coords? coords.lat : term, coords? coords.lon : null, isCelsius?'metric':'imperial');

    // pick every 3 hours or daily summary; here we pass first 8 points
    UI.renderForecastList(forecast.list.slice(0,8), isCelsius);
    const labels = forecast.list.slice(0,8).map(l => new Date(l.dt*1000).toLocaleTimeString());
    const temps = forecast.list.slice(0,8).map(l => l.main.temp);
    renderTempChart(document.getElementById('tempChart').getContext('2d'), labels, temps, isCelsius);
    const air = await API.getAir(lat, lon);
    UI.renderAQI(air);

    // save recent
    recent = [current.name, ...recent.filter(r=>r!==current.name)].slice(0,3);
    localStorage.setItem('recentCities', JSON.stringify(recent));
    UI.updateRecentSearches(recent);

    // Push notification for this city
    API.pushCityWeather(current);

    showToast('Updated');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load');
  }
}

searchBtn.addEventListener('click', ()=> {
  const q = cityInput.value.trim();
  if (!q) return showToast('Enter a city or lat,lon');
  performSearch(q);
});

compareBtn.addEventListener('click', () => {
  compareList.style.border = '5px double'
  const city = cityInput.value.trim();
  if (!city) return showToast('Enter a city name to compare');
  addCityToCompare(city);
});


unitToggle.textContent = isCelsius ? '°F': '°C';

unitToggle.addEventListener('click', async ()=>{
  isCelsius = !isCelsius;
  unitToggle.textContent = isCelsius ? '°F': '°C';
  // re-run last search if exists
  const last = recent[0] || cityInput.value.trim();
  if (last) performSearch(last);
});

geoBtn.addEventListener('click', ()=> {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async pos=>{
      const { latitude, longitude } = pos.coords;
      performSearch(`${latitude},${longitude}`);
    }, err => showToast('Geolocation denied'));
  } else showToast('Geolocation not supported');
});

themeToggle.addEventListener('click', ()=> {
  const app = document.getElementById('app');
  app.classList.toggle('dark');
  themeToggle.textContent = app.classList.contains('dark') ? 'Light' : 'Dark';
});

subscribeBtn.addEventListener('click', async () => {
  const ok = await window.subscribeUser();
  if (!ok) return;

  subscribeBtn.style.display = 'none';
  unsubscribeBtn.style.display = 'inline-block';
  showToast('Notifications enabled');
});

if (unsubscribeBtn) {
  unsubscribeBtn.addEventListener('click', async () => {
    await window.unsubscribeUser();
    subscribeBtn.style.display = "inline-block";
    unsubscribeBtn.style.display = "none"
  });
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'UNSUBSCRIBE') {
    self.registration.getNotifications().then(notifications => {
      notifications.forEach(n => n.close());
    });
  }
});

// Compare Cities Feature
async function addCityToCompare(city) {
  try {
    const current = await API.getCurrentByCity(city, isCelsius ? 'metric' : 'imperial');
    const air = await API.getAir(current.coord.lat, current.coord.lon);

    const cardDiv = document.createElement('div');
    cardDiv.classList.add('compare-card');

    const closeIcon = document.createElement('i');
    closeIcon.classList.add('fa-regular', 'fa-circle-xmark');

    const cityName = document.createElement('h3');
    cityName.textContent = current.name;

    const temp = document.createElement('p');
    temp.textContent = formatTemp(current.main.temp, isCelsius);

    const desc = document.createElement('p');
    desc.textContent = current.weather[0].description;

    const aqi = document.createElement('p');
    aqi.textContent = `AQI: ${air.list[0].main.aqi}`;

    cardDiv.append(closeIcon, cityName, temp, desc, aqi);

    closeIcon.addEventListener('click', () => {
      closeIcon.classList.add('fade-out')
      
      setTimeout(()=>{
        cardDiv.remove();
      }, 300)
    });

    compareList.appendChild(cardDiv);

    compareCities = [...new Set([...compareCities, city])];
    localStorage.setItem('compareCities', JSON.stringify(compareCities));

  } catch (err) {
    showToast('Could not fetch data for ' + city);
  }
}

initMap();
UI.updateRecentSearches(recent);

(async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  // 1️⃣ Register / reuse SW ONCE
  const reg = await initServiceWorker();
  if (!reg) return;

  // 2️⃣ Get browser subscription
  const sub = await reg.pushManager.getSubscription();

  if (!sub) {
    // No browser subscription → show Subscribe
    subscribeBtn.style.display = 'inline-block';
    unsubscribeBtn.style.display = 'none';
    return;
  }

  // 3️⃣ Verify with backend
  const check = await API.checkSubscription(sub.endpoint);

  if (check.exists) {
    // Browser + backend OK
    subscribeBtn.style.display = 'none';
    unsubscribeBtn.style.display = 'inline-block';
  } else {
    // Browser has stale subscription → clean it
    await sub.unsubscribe();
    subscribeBtn.style.display = 'inline-block';
    unsubscribeBtn.style.display = 'none';
  }
})();

window.subscribeUser = async () => {
  // 0️⃣ Hard capability check (mobile-safe)
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('❌ Push not supported on this device');
    return false;
  }

  try {
    // 1️⃣ Ensure SW exists (ONLY ONCE)
    const reg = window.swRegistration || await initServiceWorker();
    if (!reg) return false;

    // 2️⃣ If already subscribed → verify backend, do NOT resubscribe
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const check = await API.checkSubscription(sub.endpoint);
      if (check.exists) {
        console.log('✅ Already subscribed (browser + backend)');
        return true;
      }

      // Browser has stale subscription → clean it
      await sub.unsubscribe();
      sub = null;
    }

    // 3️⃣ Request permission ONLY when user clicks
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('🚫 Notification permission denied');
      return false;
    }

    // 4️⃣ Create fresh subscription
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: API.urlBase64ToUint8Array(VAPID_KEY)
    });

    // 5️⃣ Sync with backend (single source of truth)
    await API.subscribePush(sub);

    console.log('🔔 Push subscribed successfully');
    return true;

  } catch (err) {
    // 🔇 SILENT FAIL — mobile browsers are flaky
    console.warn('⚠️ subscribeUser failed (ignored):', err.message);
    return false;
  }
};

window.unsubscribeUser = async () => {
  // 0️⃣ Capability check (silent)
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push not supported');
    return false;
  }

  try {
    const reg = window.swRegistration || await initServiceWorker();
    if (!reg) return false;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      console.log('ℹ️ No active subscription to remove');
      return true; // already clean
    }

    // 1️⃣ Backend cleanup FIRST (never trust browser state)
    try {
      await API.unsubscribePush(sub);
    } catch (e) {
      // backend failure must NOT block browser cleanup
      console.warn('Backend unsubscribe failed (ignored)');
    }

    // 2️⃣ Browser unsubscribe
    await sub.unsubscribe();

    // 3️⃣ Close active notifications (optional but clean)
    if (reg.active) {
      reg.active.postMessage({ type: 'UNSUBSCRIBE' });
    }

    // 4️⃣ Update UI only after everything succeeded
    subscribeBtn.style.display = 'inline-block';
    unsubscribeBtn.style.display = 'none';

    showToast('Notifications disabled');
    console.log('🗑️ Push unsubscribed cleanly');

    return true;

  } catch (err) {
    // 🔇 Silent failure — do not break mobile UX
    console.warn('unsubscribeUser failed (ignored):', err.message);
    return false;
  }
};

