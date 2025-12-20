async function fetchWeather(city) {
  try {
    const res = await axios.get(
      'https://api.openweathermap.org/data/2.5/weather',
      {
        params: {
          q: city,
          units: 'metric',
          appid: process.env.OPENWEATHER_API_KEY
        },
        timeout: 4000
      }
    );

    return {
      temp: res.data.main.temp,
      desc: res.data.weather[0].description
    };
  } catch {
    return null;
  }
}