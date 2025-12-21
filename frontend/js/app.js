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

async function updateUI(subscribed) {
  if (subscribeBtn) subscribeBtn.style.display = subscribed ? 'none' : 'inline-block';
  if (unsubscribeBtn) unsubscribeBtn.style.display = subscribed ? 'inline-block' : 'none';
}

// ==================== SUBSCRIBE ====================
window.subscribeUser = async () => {
  if (!API.isPushSupported()) return false;
  try {
    const reg = window.swRegistration || await API.initServiceWorker();
    if (!reg) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await API.createAndSendSubscription(reg);
    else {
      const check = await API.checkSubscription(sub.endpoint);
      if (!check.exists) sub = await API.createAndSendSubscription(reg);
    }

    await updateUI(true);
    showToast('Notifications enabled');
    return true;
  } catch (err) {
    console.error('❌ Failed to subscribe:', err);
    return false;
  }
};

// ==================== UNSUBSCRIBE ====================
window.unsubscribeUser = async () => {
  if (!API.isPushSupported()) return;
  try {
    const reg = window.swRegistration || await API.initServiceWorker();
    if (!reg) return;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      await updateUI(false);
      return;
    }

    await API.unsubscribePush(sub);
    await sub.unsubscribe();
    if (reg.active) reg.active.postMessage({ type: 'UNSUBSCRIBE' });

    await updateUI(false);
    showToast('Notifications disabled');
  } catch (err) {
    console.warn('❌ Failed to unsubscribe:', err);
  }
};

// ==================== INITIAL LOAD ====================
(async () => {
  if (!API.isPushSupported()) return;

  const reg = window.swRegistration || await API.initServiceWorker();
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