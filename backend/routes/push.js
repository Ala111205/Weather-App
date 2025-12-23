const express = require('express');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const LastCity = require('../model/lastCity');
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

    await Subscription.updateOne(
      { endpoint },
      { $set: { keys } },
      { upsert: true }
    );

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
    if (!endpoint) {
      return res.status(400).json({ message: 'endpoint required' });
    }

    const sub = await Subscription.findOne({ endpoint });

    if (!sub) {
      // Already gone → treat as success
      return res.json({ success: true, message: 'Already unsubscribed' });
    }

    await Subscription.deleteOne({ endpoint });
    await LastCity.deleteOne({ endpoint });

    console.log('🗑️ Unsubscribed:', endpoint);
    res.json({ success: true });

  } catch (err) {
    console.error('❌ Unsubscribe error:', err.message);
    res.status(500).json({ success: false });
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

  console.log('UPDATE CITY BODY:', req.body);

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
  try {
    console.log('🔴 HIT /api/push/search');
    console.log('BODY:', req.body);

    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ message: 'endpoint required' });
    }

    const sub = await Subscription.findOne({ endpoint });
    if (!sub) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    const last = await LastCity.findOne({ endpoint });
    if (
      !last ||
      !last.name ||
      !last.lastData ||
      typeof last.lastData.temp !== 'number' ||
      typeof last.lastData.desc !== 'string'
    ) {
      return res.status(404).json({ message: 'No valid city data' });
    }

    const payload = JSON.stringify({
      data: {
        id: `manual-${Date.now()}`,
        title: `🌤 Weather in ${last.name}`,
        body: `${last.lastData.desc}, ${last.lastData.temp}°C`,
        icon: `${process.env.FRONTEND_PROD_URL}/assets/icons/icon-192.png`,
        badge: `${process.env.FRONTEND_PROD_URL}/assets/icons/icon-192.png`
      }
    });

    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: sub.keys
      },
      payload
    );

    res.json({ success: true });

  } catch (err) {
    console.error('❌ Manual push error:', err.message);

    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await Subscription.deleteOne({ endpoint: req.body.endpoint });
      await LastCity.deleteOne({ endpoint: req.body.endpoint });
      console.log('🗑️ Removed stale subscription');
    }

    res.status(500).json({ success: false });
  }
});

module.exports = router;