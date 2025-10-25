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
const sendWeatherPush = require('./utils/sendWeatherPush');

const app = express();

const allowedOrigins = [
  "http://127.0.0.1:5500",
  "https://weather-pwa-blush.vercel.app",
  "https://weather-app-two-red-discc085r3.vercel.app"
];

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

// Handle preflight requests manually
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

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));

// Trust proxy (required for Render)
app.set('trust proxy', 1);
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api",limiter);

const cronLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  
  max: 100,                     
  standardHeaders: true,
});
app.use("/trigger-weather-push", cronLimiter);

app.use('/api/weather', weatherRoutes);
app.use('/api/push', pushRoutes);

// Optional static serving for frontend
app.use(express.static('../frontend'));

// VAPID setup
webpush.setVapidDetails(
  'mailto:sadham070403.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

app.get('/trigger-weather-push', async (req, res) => {
  try {
    console.log('🕒 Triggered via cron-job.org at', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    const result = await sendWeatherPush();
    res.status(200).json({
      success: true,
      time: new Date().toISOString(),
      sent: result.sent,
      removed: result.removed
    });
  } catch (err) {
    console.error('❌ Error during weather push:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('☀️ Weather PWA backend is running fine');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

