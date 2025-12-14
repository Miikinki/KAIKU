

export const MAP_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const MAP_ATTRIBUTION = ''; // Hidden as per request

export const MAX_POSTS_PER_WINDOW = 10;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const SPAM_RATE_LIMIT_MS = 4000; // 4 seconds between posts

// Lifecycle & Scoring
export const MESSAGE_LIFESPAN_MS = 48 * 60 * 60 * 1000; // 48 Hours
export const SCORE_THRESHOLD_HIDE = -5; // Hide posts with score <= -5

export const THEME_COLOR = '#06b6d4'; // Cyan-500
export const THEME_COLOR_GLOW = '#22d3ee'; // Cyan-400

// PRIVACY SETTINGS
// 0.03 degrees is roughly ~3km jitter. 
// This ensures that even if IP geolocation is accurate, the saved point is never the user's exact house.
export const PRIVACY_JITTER_DEG = 0.03; 

// Basic moderation list
export const BANNED_WORDS = [
  'spam', 'scam', 'buy', 'sell', 'crypto', 'nft' 
];

// Approximate POPULATION centers for arc generation (Not geographic centers)
// This ensures arcs look like they come from where people actually are.
export const COUNTRY_COORDINATES: Record<string, [number, number]> = {
  // Nordics & Baltics
  'FI': [60.1, 24.9], // Helsinki Region (Fixing the 'Central Finland' confusion)
  'SE': [59.3, 18.0], // Stockholm region
  'NO': [59.9, 10.7], // Oslo region
  'DK': [56.2, 9.5],
  'EE': [58.8, 25.5],
  'LV': [56.9, 24.1],
  'LT': [55.1, 23.8],
  
  // Europe
  'GB': [51.5, -0.1], // London centric
  'DE': [51.1, 10.4],
  'FR': [46.6, 2.2], // Central France
  'ES': [40.4, -3.7],
  'IT': [41.9, 12.6],
  'NL': [52.1, 5.2],
  'BE': [50.8, 4.4],
  'CH': [46.8, 8.2],
  'AT': [47.5, 14.5],
  'PL': [51.9, 19.1],
  'CZ': [49.8, 15.4],
  'PT': [39.5, -8.0],
  'GR': [38.2, 23.7],
  'RO': [45.9, 24.9],
  'UA': [48.3, 31.1],
  'HU': [47.1, 19.0],
  'IE': [53.1, -7.6],
  
  // Americas
  'US': [39.8, -98.5], // Geographic center, works best for wide coverage
  'CA': [56.1, -106.3],
  'BR': [-23.5, -46.6], // Sao Paulo centric (Population)
  'MX': [19.4, -99.1], // Mexico City
  'AR': [-34.6, -58.3], // Buenos Aires
  'CL': [-33.4, -70.6], // Santiago
  'CO': [4.7, -74.0], // Bogota
  'PE': [-12.0, -77.0], // Lima

  // Asia / Pacific
  'JP': [35.6, 139.6], // Tokyo centric
  'CN': [31.2, 121.4], // Shanghai/East coast centric
  'KR': [37.5, 126.9], // Seoul
  'TW': [23.6, 120.9],
  'IN': [20.5, 78.9],
  'TH': [13.7, 100.5],
  'VN': [21.0, 105.8],
  'ID': [-6.2, 106.8], // Jakarta
  'MY': [3.1, 101.6], // KL
  'PH': [12.8, 121.7],
  'AU': [-33.8, 151.2], // Sydney/East coast
  'NZ': [-40.9, 174.8],

  // Others
  'RU': [55.7, 37.6], // Moscow centric
  'TR': [39.9, 32.8],
  'ZA': [-26.2, 28.0], // Johannesburg
  'EG': [30.0, 31.2], // Cairo
  'NG': [9.0, 7.4],
  'SA': [24.7, 46.6],
  'AE': [25.2, 55.3],
  'IL': [31.0, 35.0]
};