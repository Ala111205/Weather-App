const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');
const getCachedWeather = require('./getCachedOrFetchWeather'); // Mongo-based cache helper

async function sendWeatherPush() {
  const quiet = process.env.CRON_MODE === 'true';

  // Fetch all last cities with subscribers
  const lastCities = await LastCity.find();
  if (!lastCities.length) return { sent: 0, removed: 0 };

  // Group endpoints by city
  const cityMap = new Map();
  for (const entry of lastCities) {
    if (!cityMap.has(entry.name)) cityMap.set(entry.name, []);
    cityMap.get(entry.name).push(entry);
  }

  // Sort cities by subscriber count and enforce MAX_CITIES
  const MAX_CITIES = 10;
  const sortedCities = [...cityMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_CITIES);

  // Fetch all subscriptions at once
  const allSubs = await Subscription.find({});
  const subMap = new Map(allSubs.map(s => [s.endpoint, s]));

  let sent = 0;
  let removed = 0;
  const start = Date.now();

  for (const [city, entries] of sortedCities) {
    // Safety: abort if cron runs too long
    if (Date.now() - start > 8000) break;

    // Get weather from Mongo cache
    const weather = await getCachedWeather(city);
    if (!weather) continue;

    for (const entry of entries) {
      const sub = subMap.get(entry.endpoint);
      if (!sub) continue;

      try {
        // Prepare notification payload
        const payload = JSON.stringify({
          data: {
            id: `weather-${city.replace(/\s+/g, '_')}`,
            title: `🌤 Weather in ${city}`,
            body: `${weather.desc}, ${weather.temp}°C`,
            icon: `${process.env.FRONTEND_BASE_URL}/assets/icons/icon-192.png`,
            badge: `${process.env.FRONTEND_BASE_URL}/assets/icons/icon-192.png`
          }
        });

        // Send push notification
        await webpush.sendNotification(sub, payload);
        sent++;

        // Update lastData
        await LastCity.updateOne(
          { endpoint: entry.endpoint },
          { lastData: weather, updatedAt: new Date() }
        );
      } catch (err) {
        // Cleanup invalid subscriptions
        if (err.statusCode === 404 || err.statusCode === 410) {
          await Subscription.deleteOne({ endpoint: entry.endpoint });
          await LastCity.deleteOne({ endpoint: entry.endpoint });
          removed++;
        } else if (!quiet) {
          console.error(`⚠️ Push error: ${err.message.slice(0, 80)}`);
        }
      }
    }
  }

  if (!quiet) console.log(`[CRON] Sent=${sent}, Removed=${removed}`);
  return { sent, removed };
}

module.exports = sendWeatherPush;