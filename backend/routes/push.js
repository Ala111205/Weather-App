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

router.post('/check-subscription', async (req, res) => {
  try {
    const { endpoint } = req.body;
    const exists = await Subscription.exists({ endpoint });
    res.json({ exists: !!exists });
  } catch (err) {
    console.error('Error checking subscription:', err);
    res.status(500).json({ exists: false });
  }
});

const MIN_PUSH_INTERVAL = 10 * 60 * 1000;

// Notify weather
router.post('/notify-city', async (req, res) => {
  const userAgent = req.get('User-Agent') || '';
  const isCron = userAgent.includes('cron-job.org');
  
  // Wrapper log function
  const log = (...args) => { if (!isCron) console.log(...args); };

  const { city, temp, description, endpoint: targetEndpoint } = req.body;
  const baseURL = getBaseURL();

  try {
    const existingCity = await LastCity.findOne({ name: city });
    if (existingCity && Date.now() - new Date(existingCity.updatedAt).getTime() < MIN_PUSH_INTERVAL) {
      log(`⏳ Skipping duplicate push for ${city}`);
      return res.json({ ok: true, skipped: true });
    }

    if (targetEndpoint) {
      await LastCity.findOneAndUpdate(
        { endpoint: targetEndpoint },
        { name: city, updatedAt: new Date() },
        { upsert: true }
      );
    }

    const subs = await Subscription.find(targetEndpoint ? { endpoint: targetEndpoint } : {});
    if (!subs.length) {
      log('📭 No subscriptions to send to.');
      return res.json({ ok: true, sent: 0 });
    }

    log(`📡 Sending weather push for "${city}" to ${subs.length} subscription(s)`);

    let sent = 0;
    for (const s of subs) {
      const tail = s.endpoint.slice(-12).replace(/[^a-z0-9]/gi, '');
      const notificationId = `weather-${city.replace(/\s+/g, '_')}-${tail}`;

      const payload = JSON.stringify({
        data: {
          id: notificationId,
          title: `Weather in ${city}`,
          body: `${description}, ${temp}°`,
          icon: `${baseURL}/assets/icons/icon-192.png`,
          badge: `${baseURL}/assets/icons/icon-192.png`,
        },
      });

      try {
        await webpush.sendNotification(s, payload);
        sent++;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await Subscription.deleteOne({ endpoint: s.endpoint });
          await LastCity.deleteOne({ endpoint: s.endpoint });
        }
      }
    }

    res.json({ ok: true, sent });
  } catch (err) {
    console.error('notify-city failed:', err);
    res.status(500).json({ message: 'Push failed' });
  }
});


module.exports = router;
