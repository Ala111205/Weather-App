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

// Determine base URL for notification icons
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
    await LastCity.deleteOne({ endpoint });

    console.log(`🗑️ Subscription deleted: ${endpoint}`);
    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unsubscribe failed' });
  }
});

// Check if subscription exists in backend
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

router.post('/subscription/update-city', async (req, res) => {
  const { endpoint, city } = req.body;

  if (!endpoint || !city) {
    return res.status(400).json({ message: 'Missing data' });
  }

  await Subscription.updateOne(
    { endpoint },
    { $set: { city } }
  );

  res.json({ message: 'City updated' });
});

// Shortcut route for manual trigger from frontend search
router.post('/search', async (req, res) => {
  const { city, endpoint } = req.body;
  if (!city || !endpoint) return res.status(400).json({ message: 'city & endpoint required' });

  try {
    await sendManualWeatherPush(city, endpoint, true);
    res.json({ success: true });
  } catch (err) {
    console.error('[MANUAL PUSH ERROR]', err.message);
    res.status(500).json({ success: false });
  }
});

// Test push route
router.post('/test-push', async (req, res) => {
  const baseURL = getBaseURL();
  const subs = await Subscription.find({});

  for (const s of subs) {
    await webpush.sendNotification(s, JSON.stringify({
      data: {
        title: 'Manual Push Test',
        body: 'If you see this, notifications work!',
        icon: `${baseURL}/assets/icons/icon-192.png`
      }
    }));
  }

  res.json({ ok: true });
});

router.get('/test-push', (req, res) => {
  res.json({ message: '✅ Push route is active, use POST to send notifications.' });
});

module.exports = router;