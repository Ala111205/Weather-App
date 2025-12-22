const express = require('express');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');
const sendManualWeatherPush = require('../utils/sendManualWeatherPush');
const router = express.Router();

// Configure VAPID
webpush.setVapidDetails(
  'mailto:sadham070403.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ message: 'Invalid subscription' });

    await Subscription.deleteMany({ endpoint });
    await Subscription.create({ endpoint, keys });

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
    await LastCity.deleteOne({ endpoint });

    console.log(`🗑️ Subscription deleted: ${endpoint}`);
    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unsubscribe failed' });
  }
});

// Check if subscription exists
router.post('/check-subscription', async (req, res) => {
  try {
    const { endpoint } = req.body;
    const exists = await Subscription.exists({ endpoint });
    res.json({ exists: !!exists });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false });
  }
});

// Update last city for a subscription
router.post('/subscription/update-city', async (req, res) => {
  const { endpoint, city, lat, lon, temp, desc } = req.body;

  if (
    !endpoint ||
    !city ||
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    typeof temp !== 'number' ||
    typeof desc !== 'string'
  ) {
    return res.status(400).json({
      message: 'Invalid city payload'
    });
  }

  await LastCity.updateOne(
    { endpoint },
    {
      $set: {
        name: city,
        updatedAt: new Date(),
        lastData: { lat, lon, temp, desc }
      }
    },
    { upsert: true }
  );

  res.json({ success: true });
});

// Manual push trigger from frontend search
router.post('/search', async (req, res) => {
  console.log('🔴 HIT /api/push/search');
  console.log('BODY:', req.body);
  const { endpoint } = req.body;
  if (!endpoint)
    return res.status(400).json({ message: 'endpoint required' });

  const sub = await Subscription.findOne({ endpoint });
  if (!sub)
    return res.status(404).json({ message: 'Subscription not found' });

  const last = await LastCity.findOne({ endpoint });
  if (!last)
    return res.status(404).json({ message: 'No city data' });

  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: sub.keys
    },
    JSON.stringify({
      title: `Weather: ${last.name}`,
      body: `Temp: ${last.lastData.temp}°C ${last.lastData.desc}`,
      icon: '/assets/icons/icon-192.png'
    })
  );

  res.json({ success: true });
});

module.exports = router;