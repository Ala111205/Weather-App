const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');
const axios = require('axios');

const BASE = 'https://api.openweathermap.org/data/2.5/weather';
const MIN_PUSH_INTERVAL = 10 * 60 * 1000; // 10 min for automated pushes

const getBaseURL = () =>
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_PROD_URL
    : process.env.FRONTEND_BASE_URL;

// Helper: fetch weather from OpenWeather with retries
async function fetchWeather(city, retries = 2) {
  try {
    const res = await axios.get(BASE, {
      params: {
        q: city,
        units: 'metric',
        appid: process.env.OPENWEATHER_API_KEY
      },
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

/**
 * Send weather push notifications
 * @param {string} city - city name
 * @param {string|null} targetEndpoint - optional specific subscription
 * @param {boolean} manualTrigger - true if triggered via /search
 */
async function sendManualWeatherPush(city, targetEndpoint = null, manualTrigger = false) {
  if (!city) return;

  const weather = await fetchWeather(city);
  if (!weather) return;

  const subs = await Subscription.find(targetEndpoint ? { endpoint: targetEndpoint } : {});
  if (!subs.length) return;

  const baseURL = getBaseURL();
  let sent = 0;

  for (const s of subs) {
    const last = await LastCity.findOne({ endpoint: s.endpoint });

    // Only enforce MIN_PUSH_INTERVAL for automated pushes
    if (!manualTrigger && last && Date.now() - new Date(last.updatedAt).getTime() < MIN_PUSH_INTERVAL) {
      continue;
    }

    const tail = s.endpoint.slice(-12).replace(/[^a-z0-9]/gi, '');
    const notificationId = `weather-${city.replace(/\s+/g, '_')}-${tail}-${Date.now()}`;

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

      // Update last push timestamp
      await LastCity.findOneAndUpdate(
        { endpoint: s.endpoint },
        { name: city, updatedAt: new Date() },
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

  console.log(`📩 Weather push for "${city}" sent to ${sent} subscriber(s)${manualTrigger ? ' (manual)' : ''}`);
  return sent;
}

module.exports = sendManualWeatherPush;