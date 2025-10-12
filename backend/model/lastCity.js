const mongoose = require('mongoose');

const lastCitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LastCity', lastCitySchema);
