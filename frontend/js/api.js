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
    const { name, main, weather } = cityData;
    await fetch(`${BASE_URL}/api/push/notify-city`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: name,
        temp: main.temp,
        description: weather[0].description
      })
    });
  } catch (err) {
    console.error('Push failed:', err);
  }
}


export async function subscribePush(subscription) {
  const res = await fetch(`${BASE_URL}/api/push/subscribe`, { method:'POST', body: JSON.stringify(subscription), headers:{'Content-Type':'application/json'}});
  return res.json();
}
