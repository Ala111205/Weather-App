require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const webpush = require('web-push');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const cors = require('cors');
const weatherRoutes = require('./routes/weather');
const pushRoutes = require('./routes/push');
const Subscription = require('./model/subscription');
const LastCity = require('./model/lastCity');
const cron = require('node-cron');
const axios = require('axios');

const app = express();

const allowedOrigins = [
  "http://127.0.0.1:5500",
  "https://weather-pwa-blush.vercel.app",
  "https://weather-app-two-red-discc085r3.vercel.app"
];

// ✅ CORS setup
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST"],
  credentials: true
}));

// ✅ Handle preflight requests manually
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      return res.sendStatus(204);
    } else {
      return res.sendStatus(403);
    }
  }
  next();
});

app.use(helmet());
app.use(bodyParser.json());

// ✅ MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));

// ✅ Trust proxy (required for Render)
app.set('trust proxy', 1);
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

app.use('/api/weather', weatherRoutes);
app.use('/api/push', pushRoutes);

// Optional static serving for frontend
app.use(express.static('../frontend'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

// ✅ VAPID setup
webpush.setVapidDetails(
  'mailto:sadham070403.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ✅ CRON job — fixed payload structure
cron.schedule('0 * * * *', async () => {
  console.log('⏰ Checking weather for subscribers...');

  try {
    const lastCities = await LastCity.find(); // get all devices' last searched cities

    // Use Promise.all for parallel async execution without blocking
    await Promise.all(lastCities.map(async (entry) => {
      try {
        const sub = await Subscription.findOne({ endpoint: entry.endpoint });
        if (!sub) return; // skip if subscription expired

        const city = entry.name;
        const res = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather`,
          {
            params: {
              q: city,
              units: 'metric',
              appid: process.env.OPENWEATHER_API_KEY
            }
          }
        );

        const { temp } = res.data.main;
        const description = res.data.weather[0].description;

        const payload = JSON.stringify({
          data: {
            title: `🌤 Weather in ${city}`,
            body: `${description}, ${temp}°C`,
            icon: `${process.env.FRONTEND_BASE_URL}/assets/icons/icon-192.png`,
            badge: `${process.env.FRONTEND_BASE_URL}/assets/icons/icon-192.png`
          }
        });

        await webpush.sendNotification(sub, payload);
        console.log(`✅ Hourly weather push sent for ${city}`);

      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // remove expired subscription and lastCity
          await Subscription.deleteOne({ endpoint: entry.endpoint });
          await LastCity.deleteOne({ endpoint: entry.endpoint });
          console.log('🗑️ Removed expired subscription & last city for endpoint:', entry.endpoint);
        } else {
          console.error('⚠️ Failed to send push for', entry.endpoint, err);
        }
      }
    }));
    
  } catch (err) {
    console.error('❌ Scheduled push failed:', err);
  }
}, {
  scheduled: true,
  timezone: 'Asia/Kolkata' // ensure consistent cron execution
});

