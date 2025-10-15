// utils/sendWeatherPush.js
const axios = require('axios');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');

async function sendWeatherPush() {
  console.log('⏰ Checking weather for subscribers...');

  const lastCities = await LastCity.find();
  await Promise.all(
    lastCities.map(async (entry) => {
      try {
        const sub = await Subscription.findOne({ endpoint: entry.endpoint });
        if (!sub) return;

        const city = entry.name;
        const res = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather`,
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
        console.log(`✅ Hourly weather push sent for ${city}`);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await Subscription.deleteOne({ endpoint: entry.endpoint });
          await LastCity.deleteOne({ endpoint: entry.endpoint });
          console.log('🗑️ Removed expired endpoint:', entry.endpoint);
        } else {
          console.error('⚠️ Push failed for', entry.endpoint, err.message);
        }
      }
    })
  );
}

module.exports = sendWeatherPush;
