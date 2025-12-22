const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');

const getBaseURL = () =>
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_PROD_URL
    : process.env.FRONTEND_BASE_URL;

/**
 * Send weather push notifications using last stored city data
 * @param {string|null} targetEndpoint - optional specific subscription
 * @param {boolean} manualTrigger - true if triggered manually
 */
async function sendLastCityWeatherPush(targetEndpoint = null, manualTrigger = false) {
  const subs = await Subscription.find(
    targetEndpoint ? { endpoint: targetEndpoint } : {}
  );

  if (!subs.length) {
    console.log('⚠️ No subscriptions found');
    return 0;
  }

  const baseURL = getBaseURL();
  let sent = 0;

  for (const s of subs) {
    const last = await LastCity.findOne({ endpoint: s.endpoint });

    // 🛑 Hard validation — send NOTHING if data is incomplete
    if (
      !last ||
      !last.name ||
      !last.lastData ||
      typeof last.lastData.temp !== 'number' ||
      typeof last.lastData.desc !== 'string'
    ) {
      continue;
    }

    const notificationId =
      `weather-${last.name.replace(/\s+/g, '_')}-${Date.now()}`;

    const payload = JSON.stringify({
      data: {
        id: notificationId,
        title: `🌤 Weather in ${last.name}`,
        body: `${last.lastData.desc}, ${last.lastData.temp}°C`,
        icon: `${baseURL}/assets/icons/icon-192.png`,
        badge: `${baseURL}/assets/icons/icon-192.png`
      }
    });

    try {
      await webpush.sendNotification(s, payload);
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await Subscription.deleteOne({ endpoint: s.endpoint });
        await LastCity.deleteOne({ endpoint: s.endpoint });
        console.log(`🗑️ Removed stale subscription`);
      } else {
        console.error('[PUSH ERROR]', err.message);
      }
    }
  }

  console.log(`📩 Push sent to ${sent} subscriber(s)${manualTrigger ? ' (manual)' : ' (auto)'}`);
  return sent;
}

module.exports = sendLastCityWeatherPush;