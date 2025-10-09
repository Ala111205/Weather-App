import L from 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/+esm';
let map, marker;

export function initMap() {
  map = L.map('map', {
    center: [20.5937, 78.9629], 
    zoom: 4,                    
    minZoom: 2,                 
    maxZoom: 18                
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'© OpenStreetMap'
  }).addTo(map);
}

export function showLocation(lat, lon, label='') {
  if (!map) initMap();
  map.setView([lat, lon], 10);
  if (marker) marker.remove();
  marker = L.marker([lat, lon]).addTo(map).bindPopup(label).openPopup();
}
