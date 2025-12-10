import { DreamCategory } from './types';

export const MAP_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const MAP_ATTRIBUTION = ''; // Hidden as per request

export const MAX_POSTS_PER_WINDOW = 10;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

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
// 1 degree lat is ~111km. 0.1 is ~11km. 0.01 is ~1.1km.
export const JITTER_CONFIG = {
  GLOBAL: 0.45,   // ~50km
  REGION: 0.09,   // ~10km
  LOCAL: 0.045     // ~5km
};

export const WORLD_GEOJSON_URL = 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json';

export const CATEGORY_COLORS: Record<string, string> = {
  [DreamCategory.NIGHTMARE]: '#ef4444', 
  [DreamCategory.LUCID]: '#a855f7',
  [DreamCategory.RECURRING]: '#f59e0b',
  [DreamCategory.MUNDANE]: '#6b7280',
  [DreamCategory.PROPHETIC]: '#06b6d4',
  [DreamCategory.ABSTRACT]: '#ec4899'
};

export const CATEGORY_SENTIMENT: Record<string, number> = {
  [DreamCategory.NIGHTMARE]: -50,
  [DreamCategory.LUCID]: 20,
  [DreamCategory.RECURRING]: -10,
  [DreamCategory.MUNDANE]: 0,
  [DreamCategory.PROPHETIC]: 10,
  [DreamCategory.ABSTRACT]: 5
};