// Auto-fills the diary's weather field from a free, keyless API
// (Open-Meteo) so nobody has to type "Fine, 24°C" by hand every day.
// Best-effort only: any failure (no network, date out of range, geocoding
// miss) returns null rather than throwing — a diary entry should never be
// blocked by the weather lookup.

const { store } = require('./store');

const DEFAULT_LOCATION_QUERY = 'Sydney, New South Wales, Australia';

// WMO weather codes (used by Open-Meteo) collapsed to plain English.
const WMO_TEXT = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm (hail)', 99: 'Thunderstorm (hail)',
};

let coordsCache = null; // { query, lat, lon } — cached for the life of the process

async function getSiteCoords() {
  const query = ((await store.getSetting('project_postcode').catch(() => null)) || '').trim() || DEFAULT_LOCATION_QUERY;
  if (coordsCache && coordsCache.query === query) return coordsCache;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&country=AU`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  const hit = data.results && data.results[0];
  if (!hit) throw new Error(`Could not find a location for "${query}"`);
  coordsCache = { query, lat: hit.latitude, lon: hit.longitude };
  return coordsCache;
}

// Returns a short string like "Partly cloudy, 18-26°C", or null if the
// date is out of range / the lookup fails for any reason.
async function getWeatherForDate(dateIso) {
  try {
    const { lat, lon } = await getSiteCoords();
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
      `&timezone=Australia%2FSydney&past_days=92&forecast_days=16`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const days = data.daily && data.daily.time;
    if (!days) return null;
    const idx = days.indexOf(dateIso);
    if (idx === -1) return null;
    const code = data.daily.weathercode[idx];
    const lo = Math.round(data.daily.temperature_2m_min[idx]);
    const hi = Math.round(data.daily.temperature_2m_max[idx]);
    const text = WMO_TEXT[code] || 'Mixed conditions';
    return `${text}, ${lo}-${hi}°C`;
  } catch {
    return null;
  }
}

module.exports = { getWeatherForDate, getSiteCoords, DEFAULT_LOCATION_QUERY };
