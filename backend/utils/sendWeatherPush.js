const axios = require('axios');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');

// Delay helper
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Safe fetch with retries
async function fetchWeather(city, retries = 2) {
  try {
    const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: { q: city, units: 'metric', appid: process.env.OPENWEATHER_API_KEY },
    });
    return res.data;
  } catch (err) {
    if (retries > 0) {
      await delay(2000); 
      return fetchWeather(city, retries - 1);
    }
    return null;
  }
}

async function sendWeatherPush() {
  const quiet = process.env.CRON_MODE === 'true';
  if (!quiet) console.log('🌦️ Checking weather for subscribers...');

  const lastCities = await LastCity.find();
  if (!lastCities.length) {
    if (!quiet) console.log('⚠️ No subscribers found.');
    return { sent: 0, removed: 0 };
  }

  const cityCache = {};
  const uniqueCities = [...new Set(lastCities.map(c => c.name))];

  // Fetch weather for unique cities sequentially 
  for (const city of uniqueCities) {
    const data = await fetchWeather(city);
    cityCache[city] = data;
    await delay(3000); 
    if (!quiet && !data) console.warn(`⚠️ Failed to fetch weather for ${city}`);
  }

  let sentCount = 0;
  let removedCount = 0;

  // Send notifications to all subscribers
  for (const entry of lastCities) {
    try {
      const sub = await Subscription.findOne({ endpoint: entry.endpoint });
      if (!sub) continue;

      const data = cityCache[entry.name];
      if (!data) continue;

      const lastData = entry.lastData || {};
      const newTemp = data.main.temp.toFixed(1);
      const newDesc = data.weather[0].description;

      //  Skip if weather hasn’t changed (within 1°C difference)
      // const tempDiff = Math.abs((lastData.temp || 0) - newTemp);
      // if (lastData.desc === newDesc && tempDiff < 1) {
      //   console.log(`⏳ No weather change for ${entry.name} — skipping`);
      //   continue;
      // }

      await LastCity.updateOne(
        { endpoint: entry.endpoint },
        { lastData: { temp: newTemp, desc: newDesc }, updatedAt: new Date() }
      );

      const payload = JSON.stringify({
        data: {
          id: `weather-${entry.name.replace(/\s+/g, '_')}`,
          title: `🌤 Weather in ${entry.name}`,
          body: `${data.weather[0].description}, ${data.main.temp}°C`,
          icon: `${process.env.FRONTEND_BASE_URL}/assets/icons/icon-192.png`,
          badge: `${process.env.FRONTEND_BASE_URL}/assets/icons/icon-192.png`,
        },
      });

      await webpush.sendNotification(sub, payload);
      sentCount++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await Subscription.deleteOne({ endpoint: entry.endpoint });
        await LastCity.deleteOne({ endpoint: entry.endpoint });
        removedCount++;
      } else if (!quiet) {
        console.error(`⚠️ Push error: ${err.message.slice(0, 80)}`);
      }
    }
  }

  if (!quiet) console.log(`✅ Summary: Sent=${sentCount}, Removed=${removedCount}`);
  return { sent: sentCount, removed: removedCount };
}

module.exports = sendWeatherPush;