const express = require('express');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const router = express.Router();

webpush.setVapidDetails(
  'mailto:sadham070403.com', 
  process.env.VAPID_PUBLIC_KEY, 
  process.env.VAPID_PRIVATE_KEY
);

const getBaseURL = () => {
  return process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_PROD_URL
    : process.env.FRONTEND_BASE_URL;
};

router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ message: 'Invalid subscription' });

    const existing = await Subscription.findOne({ endpoint });
    if (existing) {
      console.log('🔹 Subscription already exists');
      return res.status(200).json({ message: 'Already subscribed' });
    }

    await Subscription.create({ endpoint, keys });
    console.log('✅ New subscription added');
    res.status(201).json({ message: 'Subscribed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Subscription failed' });
  }
});

router.post('/notify-city', async (req, res) => {
  const { city, temp, description } = req.body;

    // Determine frontend base URL dynamically from env
  const baseURL = getBaseURL();

  const payload = JSON.stringify({
    data: {
      title: `Weather in ${city}`,
      body: `${description}, ${temp}°`,
      icon: `${baseURL}/assets/icons/icon-192.png`,
      badge: `${baseURL}/assets/icons/icon-192.png`
    }
  });

  try {
    const subs = await Subscription.find();
    const results = [];

    const uniqueSubs = new Map();
    for (const s of subs) {
      if (!uniqueSubs.has(s.endpoint)) {
        uniqueSubs.set(s.endpoint, s);
      }
      else {
        const existing = uniqueSubs.get(s.endpoint);
        if (s.keys.p256dh !== existing.keys.p256dh || s.keys.auth !== existing.keys.auth) {
          await Subscription.updateOne({ endpoint: s.endpoint }, { keys: s.keys });
          console.log(`🔄 Updated keys for ${s.endpoint}`);
        }
      }
    }

    for (const [endpoint, s] of uniqueSubs) {
      try {
        await webpush.sendNotification(s, payload);
        results.push({ endpoint: s.endpoint, status: 'sent' });
      } catch (err) {
        console.error('Push send error:', err.statusCode);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await Subscription.deleteOne({ endpoint: s.endpoint });
          console.log('🗑️ Deleted expired subscription');
        }
        results.push({ endpoint: s.endpoint, status: 'failed' });
      }
    }

    res.json({ ok: true, results });
  } catch (err) {
    console.error('Push failed:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
