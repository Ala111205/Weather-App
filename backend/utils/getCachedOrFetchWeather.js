const WeatherCache = require('../models/WeatherCache');
const fetchWeatherFromAPI = require('./fetchWeatherFromAPI');

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getCachedOrFetchWeather(city) {
    const cached = await WeatherCache.findOne({ city });

    if (cached) {
        const age = Date.now() - cached.fetchedAt.getTime();

        if (age < CACHE_TTL) {
        return cached.data;
        }
    }

    // Fetch fresh data
    const freshData = await fetchWeatherFromAPI(city);

    if (!freshData) {
        return cached ? cached.data : null;
    }

    await WeatherCache.findOneAndUpdate(
    { city },
    {
        city,
        data: freshData,
        fetchedAt: new Date()
    },
    { upsert: true }
    );

    return freshData;
}

module.exports = getCachedOrFetchWeather;