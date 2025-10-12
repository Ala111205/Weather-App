const express = require('express');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');
const router = express.Router();

webpush.setVapidDetails(
  'mailto:sadham070403.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const getBaseURL = () =>
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_PROD_URL
    : process.env.FRONTEND_BASE_URL;

// Subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ message: 'Invalid subscription' });

    const deviceId = Buffer.from(endpoint).toString('base64').slice(0, 20);

    // Remove duplicates (optional)
    await Subscription.deleteMany({ endpoint });

    await Subscription.create({ endpoint, keys, deviceId });
    console.log('✅ New subscription added');
    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Subscription failed' });
  }
});

// Unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'No endpoint' });

    await Subscription.deleteOne({ endpoint });
    console.log(`🗑️ Subscription deleted: ${endpoint}`);
    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unsubscribe failed' });
  }
});

router.get('/unsubscribe', (req, res) => {
  res.send('Use POST /api/push/unsubscribe with { endpoint } in body');
});

// Notify weather
router.post('/notify-city', async (req, res) => {
  const { city, temp, description, endpoint } = req.body;
  const baseURL = getBaseURL();

  await LastCity.findOneAndUpdate({endpoint}, { name: city, updatedAt: new Date() }, { upsert: true });

  const notificationId = `weather-${Date.now()}`; 
  const payload = JSON.stringify({
    data: {          
      id: notificationId,
      title: `Weather in ${city}`,
      body: `${description}, ${temp}°`,
      icon: `${baseURL}/assets/icons/icon-192.png`,
      badge: `${baseURL}/assets/icons/icon-192.png`
    }
  });

  try {
    const subs = await Subscription.find(endpoint? {endpoint}: {});
    console.log(`📡 Sending to ${subs.length} subscription(s)`);
    for (const s of subs) {
      try {
        await webpush.sendNotification(s, payload);
      } catch (err) {
        console.error('Push send error:', err.statusCode);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await Subscription.deleteOne({ endpoint: s.endpoint });
          console.log('🗑️ Deleted expired subscription');
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Push failed' });
  }
});

module.exports = router;
