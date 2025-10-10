const express = require('express');
const webpush = require('web-push');
const router = express.Router();

const publicVapid = process.env.VAPID_PUBLIC_KEY;
const privateVapid = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails('mailto:sadham070403.com', publicVapid, privateVapid);

// store subscriptions in memory or DB (for demo: in-memory)
const subscriptions = [];

router.post('/subscribe', (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  res.status(201).json({});
});

router.post('/notify-city', async (req, res) => {
  const { city, temp, description } = req.body; // pass city weather info
  const payload = JSON.stringify({
    title: `Weather in ${city}`,
    body: `${description}, ${temp}°`
  });

  try {
    const results = await Promise.all(
      subscriptions.map(s => webpush.sendNotification(s, payload).catch(e => e))
    );
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Push failed' });
  }
});


module.exports = router;
