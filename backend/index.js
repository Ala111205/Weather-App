require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const cors = require('cors');
const weatherRoutes = require('./routes/weather');
const pushRoutes = require('./routes/push');
const Subscription = require('./model/subscription');

const app = express();
const allowedOrigins = [
  "http://127.0.0.1:5500",
  "https://weather-pwa-blush.vercel.app",
];

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin (like local file)
    if(!origin) return callback(null, true);
    if(allowedOrigins.includes(origin)){
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET","POST"],
  credentials: true
}));

app.use(helmet());
app.use(bodyParser.json());

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));


const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 60, // limit each IP to 60 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

app.use('/api/weather', weatherRoutes);
app.use('/api/push', pushRoutes);

// static for production frontend build (optional)
app.use(express.static('../frontend'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

// --- ADD CRON JOB HERE ---
const cron = require('node-cron');
const axios = require('axios');

cron.schedule('0 * * * *', async () => {
  console.log('Checking weather for subscribers...');
  try {
    const subs = await Subscription.find();
    const city = 'Madurai';
    const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`);
    const { temp } = res.data.main;
    const description = res.data.weather[0].description;
    const payload = JSON.stringify({ title: `Weather in ${city}`, body: `${description}, ${temp}°` });
    subs.forEach(s => webpush.sendNotification(s, payload).catch(err => console.error(err)));
  } catch (err) {
    console.error('Scheduled push failed:', err);
  }
});
