export const MAP_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const MAP_ATTRIBUTION = ''; // Hidden as per request

export const MAX_POSTS_PER_WINDOW = 10;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const SPAM_RATE_LIMIT_MS = 4000; // 4 seconds between posts

// Lifecycle & Scoring - SIGNAL DECAY SYSTEM
export const BASE_LIFESPAN_MS = 24 * 60 * 60 * 1000; // 24 Hours Base Life
export const BOOST_EXTENSION_MS = 4 * 60 * 60 * 1000; // +4 Hours per Boost
export const MESSAGE_LIFESPAN_MS = BASE_LIFESPAN_MS; // Fallback ref
export const SCORE_THRESHOLD_HIDE = -999; // Hard deletion threshold (Deprecated)

// VOTING THRESHOLDS (COLD START TUNING)
export const HIGH_SIGNAL_THRESHOLD = 5;  // Score required to glow (Low for cold start)
export const LOW_SIGNAL_THRESHOLD = -3;  // Score where content gets blurred/collapsed

export const THEME_COLOR = '#06b6d4'; // Cyan-500
export const THEME_COLOR_GLOW = '#22d3ee'; // Cyan-400

// Basic moderation list
export const BANNED_WORDS = [
  'spam', 'scam', 'buy', 'sell', 'crypto', 'nft' 
];

// --- IDENTITY PRESETS ---

export const AVATAR_COLORS = [
  '#06b6d4', // Cyan (Default)
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#84cc16', // Lime
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
  '#ffffff', // White
];

// Mapping of ID -> SVG Path Data (for raw usage in Leaflet & React)
export const AVATAR_ICONS: Record<string, string> = {
  'radar': 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M12 2v10 l4 4', // Radar
  'ghost': 'M9 22v-3.333a2 2 0 0 1 .6-1.46L10.3 16.5A5.6 5.6 0 0 0 12 12V6a4 4 0 0 0-8 0v6a5.6 5.6 0 0 0 1.7 4.5l.7 1.04a2 2 0 0 1 .6 1.46V22', // Ghost
  'skull': 'M12 4c-3.3 0-6 2.7-6 6c0 1.3.4 2.5 1 3.5c.6 1.1 1 2.3 1 3.5h8c0-1.2.4-2.4 1-3.5c.6-1 1-2.2 1-3.5c0-3.3-2.7-6-6-6z M10 12h.01 M14 12h.01', // Skull
  'robot': 'M12 8V4H8 M16 4h-4v4 M10 8h4 M4 14v2a2 2 0 0 0 2 2h2v4h8v-4h2a2 2 0 0 0 2-2v-2 M9 10a3 3 0 0 1 6 0v4H9z', // Bot
  'shield': 'M12 22s8-4 8-10V5l-8-3l-8 3v7c0 6 8 10 8 10z', // Shield
  'zap': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', // Lightning
  'crosshair': 'M12 2v4 M12 18v4 M4 12H2 M22 12h-2 M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', // Target
  'wolf': 'M12 2l-3 6l-6 1l4.5 4l-1 6l5.5-3l5.5 3l-1-6l4.5-4l-6-1z', // Star/Wolfish shape
  'radio': 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9 M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5 M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6', // Signal
  'hexagon': 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', // Hex
  'eye': 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', // Eye
  'flame': 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.6-3z' // Flame
};

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