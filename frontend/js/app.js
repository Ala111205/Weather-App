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

if (subscribeBtn) {
  subscribeBtn.addEventListener('click', async () => {
    await window.subscribeUser();
    unsubscribeBtn.style.display = "inline-block";
    subscribeBtn.style.display = "none"
  });
}

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

  // 1️⃣ Register SW if not already
  const regs = await navigator.serviceWorker.getRegistrations();
  let reg = regs.find(r => r.active);

  if (!reg) {
    console.log('🛠 Registering new Service Worker...');
    reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    console.log('⚡ Service Worker activated');
  } else {
    console.log('✅ Service Worker already registered');
  }

  window.swRegistration = reg;

  const vapidKey = 'BCkItBSMU1gfKoiNDaKLZj9xvKGPFyYn9dqZ29_wNunc4_z-ITd9xhvxXU8fXTN0JQbb8b2YujBCCPi2M05m9co';
  await API.verifyAndRestoreSubscription(vapidKey);

  // 2️⃣ Get SW subscription
  const sub = await reg.pushManager.getSubscription();

  if (!sub) {
    // User not subscribed yet
    subscribeBtn.style.display = "inline-block";
    unsubscribeBtn.style.display = "none";
    console.log('📩 No active subscription yet');
    return;
  }

  // 3️⃣ Confirm subscription exists on backend
  try {
    const checkResp = await API.checkSubscription(sub.endpoint);
    if (checkResp.exists) {
      subscribeBtn.style.display = "none";
      unsubscribeBtn.style.display = "inline-block";
      console.log('✅ Subscribed and verified with backend');
    } else {
      // Subscription invalid on backend → clean up SW
      await sub.unsubscribe();
      subscribeBtn.style.display = "inline-block";
      unsubscribeBtn.style.display = "none";
      console.log('⚠️ Subscription not found on backend, reset SW');
    }
  } catch (err) {
    console.error('❌ Error checking backend subscription:', err);
    // Fallback to UI safe state
    subscribeBtn.style.display = "inline-block";
    unsubscribeBtn.style.display = "none";
  }
})();

window.subscribeUser = async () => {
  try {
    const reg = window.swRegistration || (await navigator.serviceWorker.ready);
    let sub = await reg.pushManager.getSubscription();
    if (sub) return alert('Already subscribed.');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notifications blocked.');
      return;
    }

    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: API.urlBase64ToUint8Array(
        'BCkItBSMU1gfKoiNDaKLZj9xvKGPFyYn9dqZ29_wNunc4_z-ITd9xhvxXU8fXTN0JQbb8b2YujBCCPi2M05m9co'
      )
    });

    const resp = await API.subscribePush(sub);
    if (!resp.ok) throw new Error('Backend subscription failed');

    // Only now update UI
    subscribeBtn.style.display = "none";
    unsubscribeBtn.style.display = "inline-block";
    console.log('✅ Notifications turned ON');
    alert('Subscribed successfully.');

  } catch (err) {
    console.error('❌ Failed to subscribe:', err);
    alert('Failed to turn on notifications.');
  }
};

window.unsubscribeUser = async () => {
  try {
    const reg = window.swRegistration || (await navigator.serviceWorker.ready);
    const sub = await reg.pushManager.getSubscription();

    if (!sub) {
      alert('No active subscription found.');
      return;
    }

    const resp = await API.unsubscribePush(sub);
    if (!resp.ok) throw new Error('Backend unsubscribe failed');

    const unsubscribed = await sub.unsubscribe();
    if (!unsubscribed) throw new Error('Failed to unsubscribe from SW');

    // Only now update UI
    subscribeBtn.style.display = "inline-block";
    unsubscribeBtn.style.display = "none";
    console.log('🗑️ Notifications turned OFF');
    alert('Notifications have been turned off.');

    if (reg.active) reg.active.postMessage({ type: 'UNSUBSCRIBE' });
  } catch (err) {
    console.error('❌ Failed to unsubscribe:', err);
    alert('Failed to turn off notifications.');
  }
};


