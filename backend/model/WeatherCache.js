const mongoose = require('mongoose');

const WeatherCacheSchema = new mongoose.Schema({
  city: {
    type: String,
    required: true,
    unique: true
  },
  data: {
    type: Object,
    required: true
  },
  fetchedAt: {
    type: Date,
    required: true
  }
});

module.exports = mongoose.model('WeatherCache', WeatherCacheSchema);