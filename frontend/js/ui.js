import { el, showToast, formatTemp } from './utils.js';
import { gsap } from "https://cdn.skypack.dev/gsap";

export function renderCurrent(data, isCelsius){
  const container = el('currentWeather');
  const temp = isCelsius ? data.main.temp: data.main.temp;
  const desc = data.weather[0].description;
  const icon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
  container.innerHTML = `
    <h2>${data.name}, ${data.sys.country}</h2>
    <div class="current-row">
      <img src="${icon}" alt="${desc}">
      <div>
        <div class="temp">${formatTemp(data.main.temp, isCelsius)}</div>
        <div class="desc">${desc}</div>
      </div>
    </div>
  `;
  container.classList.remove('hidden');
  gsap.from(container, { y: -10, opacity: 0, duration: .6 });
}

export function renderAQI(data) {
  const elAQI = el('aqi');
  const aqi = data.list?.[0]?.main?.aqi ?? null; // 1..5
  if (!aqi) { elAQI.classList.add('hidden'); return; }
  const map = {1:'Good',2:'Fair',3:'Moderate',4:'Poor',5:'Very Poor'};
  elAQI.innerHTML = `<p>AQI: ${aqi} — ${map[aqi]}</p>`;
  elAQI.classList.remove('hidden');
}

export function updateRecentSearches(list) {
  const container = el('recentSearches');
  container.innerHTML = `<div><h4>Recent</h4></div> <div class="cities"> ${list.map(c=>`<button class="recent-btn">${c}</button>`).join('')}</div>`;
  container.querySelectorAll('.recent-btn').forEach(btn => {
    btn.addEventListener('click', ()=> document.getElementById('cityInput').value = btn.textContent);
  });
}

export function renderForecastList(items, isCelsius) {
  const container = el('forecast');
  container.innerHTML = items.map(it=>`
    <div class="fcard">
      <div>${new Date(it.dt*1000).toLocaleString()}</div>
      <img src="https://openweathermap.org/img/wn/${it.weather[0].icon}.png">
      <div>${formatTemp(it.main.temp, isCelsius)}</div>
      </div>
  `).join('');
}
