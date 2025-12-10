import { Dream, DreamCategory, CountryStats, TrendingSymbol } from '../types';
import { CATEGORY_SENTIMENT } from '../constants';

// --- GEOMETRY UTILS ---

/**
 * Checks if a point (lat, lng) is inside a polygon.
 * Using ray-casting algorithm.
 */
const isPointInPolygon = (point: [number, number], vs: [number, number][]): boolean => {
  // point: [lng, lat] (GeoJSON standard) vs [lat, lng] (Leaflet standard)
  // Be careful: GeoJSON uses [lng, lat]. Leaflet uses [lat, lng].
  // Our inputs: point is [lng, lat]. vs is array of [lng, lat].
  
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * Checks if a point is inside a GeoJSON Feature (Polygon or MultiPolygon).
 * Point is {lat, lng}.
 */
export const isPointInFeature = (lat: number, lng: number, feature: any): boolean => {
  if (!feature.geometry) return false;
  const { type, coordinates } = feature.geometry;
  
  // GeoJSON uses [lng, lat]
  const pt: [number, number] = [lng, lat];

  if (type === 'Polygon') {
    // coordinates[0] is the outer ring
    return isPointInPolygon(pt, coordinates[0]);
  } 
  else if (type === 'MultiPolygon') {
    // coordinates is an array of Polygons
    for (const polygon of coordinates) {
      if (isPointInPolygon(pt, polygon[0])) return true;
    }
  }
  
  return false;
};

// --- NLP UTILS ---

const STOP_WORDS = new Set([
  'the', 'and', 'a', 'to', 'of', 'in', 'i', 'is', 'that', 'it', 'on', 'you', 'this', 'for', 'but', 'with', 'are', 'have', 'be', 'at', 'or', 'as', 'was', 'so', 'if', 'out', 'not', 'me', 'my', 'dream', 'dreamed', 'saw', 'felt', 'like', 'just', 'had', 'about', 'from', 'up', 'down', 'went', 'go', 'get', 'see', 'one', 'what', 'some', 'can', 'very', 'really', 'then', 'when', 'there'
]);

const getTrendingSymbols = (dreams: Dream[], limit = 5): TrendingSymbol[] => {
  const frequency: Record<string, number> = {};

  dreams.forEach(d => {
    // Normalize: lowercase, remove punctuation, split by space
    const words = d.text.toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
      .split(/\s+/);
      
    words.forEach(w => {
      if (w.length > 2 && !STOP_WORDS.has(w)) {
        frequency[w] = (frequency[w] || 0) + 1;
      }
    });
  });

  return Object.entries(frequency)
    .map(([word, count]) => ({ word: `#${word}`, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

// --- AGGREGATION ---

export const calculateRegionalStats = (countryName: string, countryFeature: any, allDreams: Dream[]): CountryStats => {
  // 1. Filter dreams within borders
  const regionDreams = allDreams.filter(d => isPointInFeature(d.location.lat, d.location.lng, countryFeature));
  const total = regionDreams.length;

  if (total === 0) {
    return {
      countryName,
      totalDreams: 0,
      dominantTheme: 'N/A',
      moodScore: 0,
      trendingSymbols: []
    };
  }

  // 2. Dominant Theme
  const themeCounts: Record<string, number> = {};
  regionDreams.forEach(d => {
    themeCounts[d.category] = (themeCounts[d.category] || 0) + 1;
  });
  
  let dominantTheme = DreamCategory.MUNDANE;
  let maxCount = 0;
  
  (Object.entries(themeCounts) as [DreamCategory, number][]).forEach(([cat, count]) => {
    if (count > maxCount) {
      maxCount = count;
      dominantTheme = cat;
    }
  });

  // 3. Mood Score (Weighted Average)
  const totalSentiment = regionDreams.reduce((acc, d) => {
    const score = CATEGORY_SENTIMENT[d.category] ?? 0;
    return acc + score;
  }, 0);
  
  // Normalize to integer -100 to 100
  const moodScore = Math.round((totalSentiment / total) * 100);

  // 4. Trending Symbols
  const trendingSymbols = getTrendingSymbols(regionDreams, 4);

  return {
    countryName,
    totalDreams: total,
    dominantTheme,
    moodScore,
    trendingSymbols
  };
};