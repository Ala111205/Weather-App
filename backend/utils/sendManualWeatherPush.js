const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');
const axios = require('axios');

const BASE = 'https://api.openweathermap.org/data/2.5/weather';
const MIN_PUSH_INTERVAL = 10 * 60 * 1000; // 10 min

const getBaseURL = () =>
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_PROD_URL
    : process.env.FRONTEND_BASE_URL;

// Fetch weather safely with retries
async function fetchWeather(city, retries = 2) {
  try {
    const res = await axios.get(BASE, {
      params: { q: city, units: 'metric', appid: process.env.OPENWEATHER_API_KEY },
      timeout: 4000
    });
    return {
      temp: res.data.main.temp,
      description: res.data.weather[0].description
    };
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 500));
      return fetchWeather(city, retries - 1);
    }
    console.error(`[WEATHER FETCH ERROR] ${city}:`, err.message);
    return null;
  }
}

async function sendManualWeatherPush(city, targetEndpoint = null) {
  if (!city) return { sent: 0 };

  const weather = await fetchWeather(city);
  if (!weather) return { sent: 0 };

  const subs = await Subscription.find(targetEndpoint ? { endpoint: targetEndpoint } : {});
  if (!subs.length) return { sent: 0 };

  const baseURL = getBaseURL();
  let sent = 0;

  for (const s of subs) {
    const last = await LastCity.findOne({ endpoint: s.endpoint });

    // Skip if same city pushed too recently
    if (last && last.name === city && Date.now() - new Date(last.updatedAt).getTime() < MIN_PUSH_INTERVAL) {
      console.log(`⏱️ Skipping push for "${city}" to ${s.endpoint.slice(-12)} (too soon)`);
      continue;
    }

    const tail = s.endpoint.slice(-12).replace(/[^a-z0-9]/gi, '');
    const notificationId = `weather-${city.replace(/\s+/g, '_')}-${tail}`;

    const payload = JSON.stringify({
      data: {
        id: notificationId,
        title: `🌤 Weather in ${city}`,
        body: `${weather.description}, ${weather.temp}°C`,
        icon: `${baseURL}/assets/icons/icon-192.png`,
        badge: `${baseURL}/assets/icons/icon-192.png`
      }
    });

    try {
      await webpush.sendNotification(s, payload);
      sent++;

      // Update last push info
      await LastCity.findOneAndUpdate(
        { endpoint: s.endpoint },
        { name: city, updatedAt: new Date(), lastData: { temp: weather.temp, desc: weather.description } },
        { upsert: true }
      );
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await Subscription.deleteOne({ endpoint: s.endpoint });
        await LastCity.deleteOne({ endpoint: s.endpoint });
        console.log(`🗑️ Removed stale subscription: ${s.endpoint}`);
      } else {
        console.error(`[PUSH ERROR] ${s.endpoint}:`, err.message);
      }
    }
  }

  console.log(`📩 Manual weather push for "${city}" sent to ${sent} subscriber(s)`);
  return { sent };
}

module.exports = sendManualWeatherPush;