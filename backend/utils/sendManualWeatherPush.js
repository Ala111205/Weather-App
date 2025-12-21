const axios = require('axios');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');

const MIN_PUSH_INTERVAL = 10 * 60 * 1000; // 10 minutes

const fetchWeather = async (city) => {
  try {
    const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        q: city,
        units: 'metric',
        appid: process.env.OPENWEATHER_API_KEY,
      },
      timeout: 5000,
    });
    return {
      temp: res.data.main.temp,
      desc: res.data.weather[0].description,
    };
  } catch (err) {
    console.error(`[WEATHER FETCH ERROR] ${city}:`, err.message);
    return null;
  }
};

const getBaseURL = () =>
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_PROD_URL
    : process.env.FRONTEND_BASE_URL;

async function sendManualWeatherPush(city, targetEndpoint = null) {
  const baseURL = getBaseURL();

  // Prevent spamming pushes too often
  const existingCity = await LastCity.findOne({ name: city });
  if (existingCity && Date.now() - new Date(existingCity.updatedAt).getTime() < MIN_PUSH_INTERVAL) {
    console.log(`⏳ Skipping push for ${city}, sent recently.`);
    return;
  }

  // Fetch fresh weather data
  const weather = await fetchWeather(city);
  if (!weather) return;

  // Update last push info
  if (targetEndpoint) {
    await LastCity.findOneAndUpdate(
      { endpoint: targetEndpoint },
      { name: city, updatedAt: new Date() },
      { upsert: true }
    );
  }

  // Determine subscribers
  const subs = await Subscription.find(targetEndpoint ? { endpoint: targetEndpoint } : {});
  if (!subs.length) {
    console.log('📭 No subscriptions found.');
    return;
  }

  console.log(`📡 Sending weather push for "${city}" to ${subs.length} subscription(s)`);

  let sent = 0;
  for (const s of subs) {
    const tail = s.endpoint.slice(-12).replace(/[^a-z0-9]/gi, '');
    const notificationId = `weather-${city.replace(/\s+/g, '_')}-${tail}`;

    const payload = JSON.stringify({
      data: {
        id: notificationId,
        title: `🌤 Weather in ${city}`,
        body: `${weather.desc}, ${weather.temp}°C`,
        icon: `${baseURL}/assets/icons/icon-192.png`,
        badge: `${baseURL}/assets/icons/icon-192.png`,
      },
    });

    try {
      await webpush.sendNotification(s, payload);
      sent++;
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

  console.log(`[PUSH COMPLETE] Sent: ${sent}, City: ${city}`);
}

module.exports = sendManualWeatherPush;