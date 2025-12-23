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
const sendLastCityWeatherPush = require('./utils/SendLastCityWeatherPush');
const LastCity = require('./model/lastCity');

let mongoReady = false;

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

app.use(helmet());
app.use(bodyParser.json());

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,

      maxPoolSize: 10,
      minPoolSize: 1,

      retryWrites: true,
      autoIndex: false,        
      heartbeatFrequencyMS: 10000
    });

    console.log('✅ MongoDB connected');

  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

/* Connection lifecycle logging */
mongoose.connection.on('connected', () => {
  mongoReady = true;
  console.log('🟢 MongoDB ready');
});

mongoose.connection.on('disconnected', () => {
  mongoReady = false;
  console.warn('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  mongoReady = true;
  console.log('🔄 MongoDB reconnected');
});

mongoose.connection.on('error', err => {
  console.error('❌ MongoDB runtime error:', err.message);
});

connectDB();

// Trust proxy (required for Render)
app.set('trust proxy', 1);
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
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
  'mailto:sadham070403@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

app.get('/trigger-weather-push', (req, res) => {
  console.log(
    '🕒 UptimeRobot auto trigger at',
    new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  );

  res.status(200).json({
    success: true,
    mode: 'automatic',
    message: 'Weather push scheduled'
  });

  setImmediate(async () => {
    try {
      if (mongoose.connection.readyState !== 1 || !mongoReady) {
        console.warn('Mongo not ready, skipping auto push');
        return;
      }
      await sendLastCityWeatherPush(null, false);
    } catch (err) {
      console.error('❌ Auto push background error:', err.message);
    }
  });
});

app.get('/', (req, res) => {
  res.send('☀️ Weather PWA backend is running fine');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));