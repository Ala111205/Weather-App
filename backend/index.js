require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const weatherRoutes = require('./routes/weather');
const pushRoutes = require('./routes/push');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: 'http://127.0.0.1:5500', 
  methods: ['GET', 'POST'],        
  credentials: true                
}));

app.use(helmet());
app.use(bodyParser.json());

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
