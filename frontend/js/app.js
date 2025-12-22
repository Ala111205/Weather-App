console.log('🔥 app.js version 2025-09-UNSUBSCRIBE-FIX');

import * as API from './api.js';
import * as UI from './ui.js';
import { el, parseLatLonInput, showToast, formatTemp } from './utils.js';
import { initMap, showLocation } from './map.js';
import { renderTempChart } from './charts.js';

let isCelsius = true;
let recent = JSON.parse(localStorage.getItem('recentCities')||'[]');
let compareCities = JSON.parse(localStorage.getItem('compareCities')) || [];
let lastCityForNotification = null;

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

    const coords = parseLatLonInput(term);
    const current = coords 
      ? await API.getCurrentByCoords(coords.lat, coords.lon, isCelsius ? 'metric' : 'imperial')
      : await API.getCurrentByCity(term, isCelsius ? 'metric' : 'imperial');

    // Render current weather
    UI.renderCurrent(current, isCelsius);

    const lat = current.coord.lat;
    const lon = current.coord.lon;
    showLocation(lat, lon, current.name);

    // Render forecast (first 8 points)
    const forecast = await API.getForecast(coords ? coords.lat : term, coords ? coords.lon : null, isCelsius ? 'metric' : 'imperial');
    UI.renderForecastList(forecast.list.slice(0, 8), isCelsius);

    const labels = forecast.list.slice(0, 8).map(l => new Date(l.dt * 1000).toLocaleTimeString());
    const temps = forecast.list.slice(0, 8).map(l => l.main.temp);
    renderTempChart(document.getElementById('tempChart').getContext('2d'), labels, temps, isCelsius);

    const air = await API.getAir(lat, lon);
    UI.renderAQI(air);

    // Save recent searches
    recent = [current.name, ...recent.filter(r => r !== current.name)].slice(0, 3);
    localStorage.setItem('recentCities', JSON.stringify(recent));
    UI.updateRecentSearches(recent);

    // Update lastCityForNotification with full data for push
    lastCityForNotification = {
      name: current.name,
      lat: current.coord.lat,
      lon: current.coord.lon,
      temp: current.main.temp,
      desc: current.weather[0].description
    };

    showToast('Updated');

    return current; // return current for further use (e.g., subscription update)
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Failed to load');
  }
}

// ===== BUTTON EVENT LISTENERS =====

// ==================== SEARCH BUTTON ====================
searchBtn.addEventListener('click', async () => {
  const q = cityInput.value.trim();
  if (!q) return showToast('Enter a city name or lat,lon');

  // Perform search and get the current city object
  const current = await performSearch(q);
  if (!current) return;

  // Update last searched city for notifications if subscribed
  try {
    const reg = await API.getActiveSW();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      // Prepare full lastCityForNotification data
      lastCityForNotification = {
        name: current.name,
        lat: current.coord.lat,
        lon: current.coord.lon,
        temp: current.main.temp,
        desc: current.weather[0].description
      };

      // Update backend subscription with the latest city
      await API.updateSubscriptionCity({
        endpoint: sub.endpoint,
        city: lastCityForNotification.name,
        lat: lastCityForNotification.lat,
        lon: lastCityForNotification.lon,
        temp: lastCityForNotification.temp,
        desc: lastCityForNotification.desc
      });

      // Trigger a manual push immediately
      await API.pushCityWeather(lastCityForNotification);
    }
  } catch (err) {
    console.error('❌ Failed to update last city for notifications:', err.message);
  }
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

async function updateUI(subscribed) {
  if (subscribeBtn) subscribeBtn.style.display = subscribed ? 'none' : 'inline-block';
  if (unsubscribeBtn) unsubscribeBtn.style.display = subscribed ? 'inline-block' : 'none';
}

// ==================== SUBSCRIBE ====================
window.subscribeUser = async () => {
  try {
    if (!API.isPushSupported()) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Permission denied');

    const reg = await API.getActiveSW();
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: API.urlBase64ToUint8Array(API.VAPID_KEY)
      });
      await API.subscribePush(sub);
    }

    // Sync last searched city if available
    if (lastCityForNotification) {
      await API.updateSubscriptionCity({
        endpoint: sub.endpoint,
        city: lastCityForNotification.name,
        lat: lastCityForNotification.lat,
        lon: lastCityForNotification.lon,
        temp: lastCityForNotification.temp,
        desc: lastCityForNotification.desc
      });
    }

    alert('Notifications enabled');
  } catch (err) {
    console.error('❌ Failed to enable:', err.message);
    alert('Failed to enable notifications');
  }
};

// ==================== UNSUBSCRIBE ====================
window.unsubscribeUser = async () => {
  try {
    const reg = await API.getActiveSW();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    await API.unsubscribePush(sub);
    await sub.unsubscribe();

    reg.active?.postMessage({ type: 'UNSUBSCRIBE' });

    alert('Notifications disabled');
  } catch (err) {
    console.error('❌ Unsubscribe failed:', err.message);
  }
};

// ==================== INITIAL LOAD ====================
(async () => {
  if (!API.isPushSupported()) return;

  const reg = window.swRegistration || await API.getActiveSW();
  if (!reg) return;
  window.swRegistration = reg;

  const sub = await reg.pushManager.getSubscription();
  if (!sub) return updateUI(false);

  const check = await API.checkSubscription(sub.endpoint);
  if (check.exists) updateUI(true);
  else {
    await sub.unsubscribe();
    updateUI(false);
  }
})();

// ==================== BUTTON EVENTS ====================
if (subscribeBtn) subscribeBtn.addEventListener('click', window.subscribeUser);
if (unsubscribeBtn) unsubscribeBtn.addEventListener('click', window.unsubscribeUser);