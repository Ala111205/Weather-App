// routes/push.js
const express = require('express');
const webpush = require('web-push');
const Subscription = require('../model/subscription');
const router = express.Router();

const publicVapid = process.env.VAPID_PUBLIC_KEY;
const privateVapid = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails('mailto:sadham070403.com', publicVapid, privateVapid);

// subscribe route
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


// notify specific city (optional)
router.post('/notify-city', async (req, res) => {
  const { city, temp, description } = req.body;
  const payload = JSON.stringify({ title: `Weather in ${city}`, body: `${description}, ${temp}°` });

  try {
    const subs = await Subscription.find();
    const results = await Promise.all(
      subs.map(s => webpush.sendNotification(s, payload).catch(e => e))
    );
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Push failed' });
  }
});

module.exports = router;
