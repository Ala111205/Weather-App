const webpush = require('web-push');
const Subscription = require('../model/subscription');
const getCachedWeather = require('./getCachedOrFetchWeather');

async function sendManualWeatherPush(city, endpoint) {
  // FORCE fresh fetch for user-triggered search
  const weather = await getCachedWeather(city, true);
  if (!weather) return false;

  const sub = await Subscription.findOne({ endpoint });
  if (!sub) return false;

  const payload = JSON.stringify({
    data: {
      id: `weather-${city.replace(/\s+/g, '_')}`,
      title: `🌤 Weather in ${city}`,
      body: `${weather.desc}, ${weather.temp}°C`,
      icon: `${process.env.FRONTEND_BASE_URL}/assets/icons/icon-192.png`
    }
  });

  await webpush.sendNotification(sub, payload);
  return true;
}

module.exports = sendManualWeatherPush;