**🌦️ Advanced Weather PWA**

A professional-grade Progressive Web App (PWA) delivering real-time weather updates, air quality data, city comparisons, and more — with offline support.
Built with a modular full-stack architecture, featuring push notifications, service worker caching, hourly background alerts, and a smooth, interactive user interface.

**Repository Link** 👉 https://weather-app-two-red-discc085r3.vercel.app/

**🚀 Features:-**

**🔹 Core Weather Features**

🌍 Search weather by city name or geolocation coordinates (lat, lon)

🌡️ Display current weather, forecast, and air quality index (AQI)

📈 Temperature trends with dynamic Chart.js graphs

🗺️ Interactive map display using Leaflet.js

🏙️ Compare multiple cities side-by-side

🔹 Advanced & Hard-Level Features

⚙️ Modularized project structure (UI, API, utils, map, chart separated)

🔐 Backend proxy server for secure API key handling

🧠 Error handling & retry logic for network failures

📦 Caching & offline mode using Service Worker

🌓 Dark / Light themes with one-click toggle

🧭 Geolocation support to detect user’s current city

🎨 GSAP animations for smooth UI transitions

📊 Dynamic temperature trend charts

📅 Persistent city storage (recent searches + compare list)

🔔 **Push Notifications**

Instant weather alerts from backend (via Web Push)

Hourly background notifications, even when the app is closed

⚠️ Users can manually turn notifications on or off directly from the notification icon.

⚙️ **Automated Weather Push via Cron Job**

To keep users updated 24/7, the backend integrates with cron-job.org
 to automatically trigger weather notifications hourly — even when the frontend is closed.

💾 **Installable PWA**

🌐 Cross-origin protected API proxy for OpenWeather API

**⚙️ Tech Stack:-**

**🖥️ Frontend**

HTML5, CSS3, JavaScript (ES6 Modules) – modular code structure for maintainability.

Chart.js – temperature and forecast trend visualization.

Leaflet.js – interactive map rendering and location handling.

GSAP (GreenSock Animation Platform) – smooth UI transitions and animations.

Service Worker & Manifest.json – for offline caching, push notifications, and PWA installable features.

**🧠 Backend**

Node.js + Express.js – server-side application, API proxy, and notification dispatcher.

web-push – handles Web Push notifications to subscribed devices.

MongoDB / Mongoose – storage of push subscriptions and last searched cities.

cors & dotenv – secure API access and environment variable management.

Deployment – Render (or Vercel proxy) for production-ready hosting.
