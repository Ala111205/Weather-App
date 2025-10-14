const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const router = express.Router();

const cache = new NodeCache({ stdTTL: 300 }); // cache 5 minutes
const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE = 'https://api.openweathermap.org/data/2.5';

// helper: exponential backoff retry
async function fetchWithRetry(url, opts = {}, retries = 2, backoff = 500) {
  try {
    return await axios({ url, ...opts, timeout: 8000 });
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithRetry(url, opts, retries - 1, backoff * 2);
    }
    throw err;
  }
}

// GET /api/weather/current?q=city&units=metric
router.get('/current', async (req, res) => {
  try {
    const { q, lat, lon, units = 'metric' } = req.query;
    let cacheKey = `current:${q||lat+','+lon}:${units}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    let url;
    if (q) {
      url = `${BASE}/weather?q=${encodeURIComponent(q)}&units=${units}&appid=${API_KEY}`;
    } else if (lat && lon) {
      url = `${BASE}/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
    } else {
      return res.status(400).json({ message: 'Missing q or lat/lon' });
    }
    const response = await fetchWithRetry(url);
    cache.set(cacheKey, response.data);
    res.json(response.data);
  } catch (err) {
    console.error(err.message || err);
    res.status(500).json({ message: 'Failed to fetch weather', error: err.message });
  }
});

// GET /api/weather/forecast?q=city&units=metric
router.get('/forecast', async (req, res) => {
  try {
    const { q, lat, lon, units = 'metric' } = req.query;
    let cacheKey = `forecast:${q||lat+','+lon}:${units}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    let url;
    if (q) {
      url = `${BASE}/forecast?q=${encodeURIComponent(q)}&units=${units}&appid=${API_KEY}`;
    } else if (lat && lon) {
      url = `${BASE}/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
    } else {
      return res.status(400).json({ message: 'Missing q or lat/lon' });
    }
    const response = await fetchWithRetry(url);
    cache.set(cacheKey, response.data, 600); // cache 10 min
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch forecast', error: err.message });
  }
});

// GET /api/weather/air?lat=..&lon=..
router.get('/air', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ message: 'lat & lon required' });
    const cacheKey = `air:${lat},${lon}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const url = `${BASE}/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
    const response = await fetchWithRetry(url);
    cache.set(cacheKey, response.data, 300);
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch air quality', error: err.message });
  }
});

router.get('/reverse', async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ message: 'lat & lon required' });
    const url = `http://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`;
    const response = await fetchWithRetry(url);
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Reverse geocode failed', error: err.message });
  }
});

module.exports = router;
