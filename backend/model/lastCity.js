const mongoose = require('mongoose');

const lastCitySchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  lastData: {
    lat: Number,
    lon: Number,
    temp: Number,
    desc: String
  },
  lastPushAt: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('LastCity', lastCitySchema);
