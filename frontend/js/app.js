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

// ===== BUTTON EVENT LISTENERS =====

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

if (subscribeBtn) {
  subscribeBtn.addEventListener('click', async () => {
    const success = await window.subscribeUser();
    if (success) {
      subscribeBtn.style.display = 'none';
      unsubscribeBtn.style.display = 'inline-block';
      console.log('🔔 Notifications enabled');
    }
  });
}

if (unsubscribeBtn) {
  unsubscribeBtn.addEventListener('click', async () => {
    await window.unsubscribeUser();
    subscribeBtn.style.display = 'inline-block';
    unsubscribeBtn.style.display = 'none';
    console.log('🗑️ Notifications disabled');
  });
}

// ===== SERVICE WORKER MESSAGE HANDLER =====
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
  if (!API.isPushSupported()) return;

  // Initialize Service Worker
  const reg = window.swRegistration || (await API.initServiceWorker());
  if (!reg) return;

  window.swRegistration = reg;

  try {
    const sub = await reg.pushManager.getSubscription();

    if (!sub) {
      // No existing subscription — show subscribe button only
      if (subscribeBtn) subscribeBtn.style.display = 'inline-block';
      if (unsubscribeBtn) unsubscribeBtn.style.display = 'none';
      console.log('📩 No push subscription — waiting for user action');
      return;
    }

    // Verify with backend
    const check = await API.checkSubscription(sub.endpoint);

    if (check.exists) {
      if (subscribeBtn) subscribeBtn.style.display = 'none';
      if (unsubscribeBtn) unsubscribeBtn.style.display = 'inline-block';
      console.log('✅ Already subscribed (backend verified)');
    } else {
      // stale subscription — unsubscribe silently
      await sub.unsubscribe();
      if (subscribeBtn) subscribeBtn.style.display = 'inline-block';
      if (unsubscribeBtn) unsubscribeBtn.style.display = 'none';
      console.log('⚠️ Stale subscription removed — waiting for user action');
    }
  } catch (err) {
    console.warn('❌ Subscription check failed (ignored):', err.message);
    // Default to safe UI
    if (subscribeBtn) subscribeBtn.style.display = 'inline-block';
    if (unsubscribeBtn) unsubscribeBtn.style.display = 'none';
  }
})();

// ==================== Subscribe ====================
window.subscribeUser = async () => {
  if (!API.isPushSupported()) return false; // Push not supported

  try {
    const reg = window.swRegistration || (await API.initServiceWorker());
    if (!reg) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false; // user denied

    // Check if already subscribed
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: API.urlBase64ToUint8Array(API.VAPID_KEY)
      });
      await API.subscribePush(sub);
      console.log('✅ Push subscription created & synced with backend');
    } else {
      // verify with backend
      const check = await API.checkSubscription(sub.endpoint);
      if (!check.exists) await API.subscribePush(sub);
      console.log('✅ Push subscription verified');
    }

    // UI update
    if (subscribeBtn) subscribeBtn.style.display = 'none';
    if (unsubscribeBtn) unsubscribeBtn.style.display = 'inline-block';
    showToast('Notifications enabled');

    return true;

  } catch (err) {
    console.warn('❌ Failed to subscribe:', err.message);
    return false; // silent fail on mobile/desktop
  }
};

// ==================== Unsubscribe ====================
window.unsubscribeUser = async () => {
  if (!API.isPushSupported()) return;

  try {
    const reg = window.swRegistration || (await API.initServiceWorker());
    if (!reg) return;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      console.warn('⚠️ No active subscription to unsubscribe');
      return;
    }

    await API.unsubscribePush(sub);
    await sub.unsubscribe();

    // Close active notifications
    if (reg.active) reg.active.postMessage({ type: 'UNSUBSCRIBE' });

    // UI update
    if (subscribeBtn) subscribeBtn.style.display = 'inline-block';
    if (unsubscribeBtn) unsubscribeBtn.style.display = 'none';
    showToast('Notifications disabled');
    console.log('🗑️ Push notifications unsubscribed');

  } catch (err) {
    console.warn('❌ Failed to unsubscribe (ignored):', err.message);
  }
};


