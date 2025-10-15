const axios = require('axios');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');

async function sendWeatherPush() {
  console.log('🌦️ Checking weather for subscribers...');

  const lastCities = await LastCity.find();

  if (!lastCities.length) {
    console.log('⚠️ No subscribers found.');
    return { sent: 0, removed: 0 };
  }

  let sentCount = 0;
  let removedCount = 0;

  // Run in parallel but suppress verbose logs
  await Promise.all(
    lastCities.map(async (entry) => {
      try {
        const sub = await Subscription.findOne({ endpoint: entry.endpoint });
        if (!sub) return;

        const city = entry.name;
        const res = await axios.get(
          'https://api.openweathermap.org/data/2.5/weather',
          {
            params: {
              q: city,
              units: 'metric',
              appid: process.env.OPENWEATHER_API_KEY,
            },
          }
        );

        const { temp } = res.data.main;
        const description = res.data.weather[0].description;

        const payload = JSON.stringify({
          data: {
            title: `🌤 Weather in ${city}`,
            body: `${description}, ${temp}°C`,
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
        } else {
          console.error(`⚠️ Push error: ${err.message.slice(0, 50)}`);
        }
      }
    })
  );

  console.log(`✅ Summary: Sent=${sentCount}, Removed=${removedCount}`);
  return { sent: sentCount, removed: removedCount };
}

module.exports = sendWeatherPush;
