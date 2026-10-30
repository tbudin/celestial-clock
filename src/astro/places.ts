/**
 * Locations. A time zone sets civil time; it does not identify a place.
 * When only the zone is known, we use a representative city for it and
 * label the result as approximate.
 */

export type LocationSource = 'device' | 'city' | 'custom' | 'approximate'

export interface Place {
  name: string
  latitude: number
  longitude: number
  timeZone: string
  source: LocationSource
}

export const CITIES: Omit<Place, 'source'>[] = [
  { name: 'Singapore', latitude: 1.2903, longitude: 103.852, timeZone: 'Asia/Singapore' },
  { name: 'London', latitude: 51.5074, longitude: -0.1278, timeZone: 'Europe/London' },
  { name: 'New York', latitude: 40.7128, longitude: -74.006, timeZone: 'America/New_York' },
  { name: 'Sydney', latitude: -33.8688, longitude: 151.2093, timeZone: 'Australia/Sydney' },
  { name: 'Paris', latitude: 48.8566, longitude: 2.3522, timeZone: 'Europe/Paris' },
  { name: 'Tokyo', latitude: 35.6762, longitude: 139.6503, timeZone: 'Asia/Tokyo' },
  { name: 'Hong Kong', latitude: 22.3193, longitude: 114.1694, timeZone: 'Asia/Hong_Kong' },
  { name: 'Dubai', latitude: 25.2048, longitude: 55.2708, timeZone: 'Asia/Dubai' },
  { name: 'Mumbai', latitude: 19.076, longitude: 72.8777, timeZone: 'Asia/Kolkata' },
  { name: 'Los Angeles', latitude: 34.0522, longitude: -118.2437, timeZone: 'America/Los_Angeles' },
  { name: 'São Paulo', latitude: -23.5505, longitude: -46.6333, timeZone: 'America/Sao_Paulo' },
  { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241, timeZone: 'Africa/Johannesburg' },
  { name: 'Reykjavík', latitude: 64.1466, longitude: -21.9426, timeZone: 'Atlantic/Reykjavik' },
  { name: 'Tromsø', latitude: 69.6492, longitude: 18.9553, timeZone: 'Europe/Oslo' },
  { name: 'Auckland', latitude: -36.8485, longitude: 174.7633, timeZone: 'Pacific/Auckland' },
  { name: 'Greenwich', latitude: 51.4769, longitude: 0.0005, timeZone: 'Europe/London' },
]

/** Representative cities for common zones, used only for the approximate fallback. */
const ZONE_HINTS: Record<string, [string, number, number]> = {
  'Asia/Singapore': ['Singapore', 1.2903, 103.852],
  'Asia/Kuala_Lumpur': ['Kuala Lumpur', 3.139, 101.6869],
  'Asia/Jakarta': ['Jakarta', -6.2088, 106.8456],
  'Asia/Bangkok': ['Bangkok', 13.7563, 100.5018],
  'Asia/Manila': ['Manila', 14.5995, 120.9842],
  'Asia/Hong_Kong': ['Hong Kong', 22.3193, 114.1694],
  'Asia/Shanghai': ['Shanghai', 31.2304, 121.4737],
  'Asia/Tokyo': ['Tokyo', 35.6762, 139.6503],
  'Asia/Seoul': ['Seoul', 37.5665, 126.978],
  'Asia/Kolkata': ['New Delhi', 28.6139, 77.209],
  'Asia/Dubai': ['Dubai', 25.2048, 55.2708],
  'Europe/London': ['London', 51.5074, -0.1278],
  'Europe/Paris': ['Paris', 48.8566, 2.3522],
  'Europe/Berlin': ['Berlin', 52.52, 13.405],
  'Europe/Madrid': ['Madrid', 40.4168, -3.7038],
  'Europe/Rome': ['Rome', 41.9028, 12.4964],
  'Europe/Amsterdam': ['Amsterdam', 52.3676, 4.9041],
  'Europe/Zurich': ['Zürich', 47.3769, 8.5417],
  'Europe/Oslo': ['Oslo', 59.9139, 10.7522],
  'Europe/Stockholm': ['Stockholm', 59.3293, 18.0686],
  'Europe/Moscow': ['Moscow', 55.7558, 37.6173],
  'Africa/Johannesburg': ['Johannesburg', -26.2041, 28.0473],
  'Africa/Lagos': ['Lagos', 6.5244, 3.3792],
  'Africa/Cairo': ['Cairo', 30.0444, 31.2357],
  'America/New_York': ['New York', 40.7128, -74.006],
  'America/Chicago': ['Chicago', 41.8781, -87.6298],
  'America/Denver': ['Denver', 39.7392, -104.9903],
  'America/Los_Angeles': ['Los Angeles', 34.0522, -118.2437],
  'America/Toronto': ['Toronto', 43.6532, -79.3832],
  'America/Vancouver': ['Vancouver', 49.2827, -123.1207],
  'America/Mexico_City': ['Mexico City', 19.4326, -99.1332],
  'America/Sao_Paulo': ['São Paulo', -23.5505, -46.6333],
  'America/Argentina/Buenos_Aires': ['Buenos Aires', -34.6037, -58.3816],
  'Australia/Sydney': ['Sydney', -33.8688, 151.2093],
  'Australia/Melbourne': ['Melbourne', -37.8136, 144.9631],
  'Australia/Perth': ['Perth', -31.9505, 115.8605],
  'Pacific/Auckland': ['Auckland', -36.8485, 174.7633],
  UTC: ['Greenwich', 51.4769, 0.0005],
}

export function approximatePlace(timeZone: string, offsetMinutes: number): Place {
  const hint = ZONE_HINTS[timeZone]
  if (hint) return { name: hint[0], latitude: hint[1], longitude: hint[2], timeZone, source: 'approximate' }
  // Unknown zone: equator at the zone's nominal meridian
  const lon = Math.max(-180, Math.min(180, (offsetMinutes / 60) * 15))
  return { name: timeZone.split('/').pop()!.replace(/_/g, ' '), latitude: 0, longitude: lon, timeZone, source: 'approximate' }
}

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
