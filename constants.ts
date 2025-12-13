
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

// Basic moderation list
export const BANNED_WORDS = [
  'spam', 'scam', 'buy', 'sell', 'crypto', 'nft' 
];

// Jitter settings (in degrees, roughly)
export const JITTER_CONFIG = {
  GLOBAL: 0.45,   // ~50km
  REGION: 0.09,   // ~10km
  LOCAL: 0.045     // ~5km
};

// Approximate centers for arc generation
export const COUNTRY_COORDINATES: Record<string, [number, number]> = {
  'FI': [64.0, 26.0],
  'JP': [36.2, 138.2],
  'US': [37.0, -95.7],
  'GB': [55.3, -3.4],
  'DE': [51.1, 10.4],
  'BR': [-14.2, -51.9],
  'CN': [35.8, 104.1],
  'FR': [46.2, 2.2],
  'ES': [40.4, -3.7],
  'IT': [41.8, 12.5],
  'RU': [61.5, 105.3],
  'AU': [-25.2, 133.7],
  'CA': [56.1, -106.3],
  'IN': [20.5, 78.9],
  'ZA': [-30.5, 22.9]
};
