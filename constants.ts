
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
