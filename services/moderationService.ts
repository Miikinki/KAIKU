import { BANNED_WORDS } from '../constants';

// 1. Content Moderation (Basic)
export const moderateContent = (text: string): boolean => {
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) return false; // Rejected
  }
  return true; // Approved
};

// Helper: Timeout wrapper for fetch
const fetchWithTimeout = async (resource: string, options: RequestInit = {}, timeout = 2000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, {
        ...options,
        signal: controller.signal
    });
    clearTimeout(id);
    return response;
};

// CACHE for Reverse Geocoding
// Key: "lat_fixed2,lng_fixed2" (approx 1km precision)
const cityCache = new Map<string, { city: string; countryCode: string; countryName: string }>();

// 2. Reverse Geocoding (BigDataCloud Free API - CORS Friendly)
export const getCityName = async (lat: number, lng: number): Promise<{ city: string; countryCode: string; countryName: string }> => {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  
  if (cityCache.has(cacheKey)) {
      return cityCache.get(cacheKey)!;
  }

  try {
    // Timeout set to 2000ms (2 seconds) to prevent hanging the UI
    const response = await fetchWithTimeout(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      {},
      2000
    );
    
    if (!response.ok) throw new Error('Geocoding failed');
    
    const data = await response.json();
    
    // Fallback logic for City Name
    const city = data.city || 
           data.locality || 
           data.principalSubdivision || 
           data.countryName || 
           "Unknown Sector";
    
    const countryCode = data.countryCode || "";
    const countryName = data.countryName || data.countryCode || "Unknown Territory";

    const result = { city, countryCode, countryName };
    
    // Save to Cache
    cityCache.set(cacheKey, result);
    // Limit cache size
    if (cityCache.size > 100) {
        const firstKey = cityCache.keys().next().value;
        if (firstKey) cityCache.delete(firstKey);
    }

    return result;
           
  } catch (error) {
    // Fail silently and quickly to coordinates
    // console.warn("Geocoding failed/timeout, falling back to coordinates");
    return { city: `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`, countryCode: "", countryName: "Unknown" };
  }
};

export interface SearchResult {
  lat: number;
  lng: number;
  name: string;
  bounds?: [number, number, number, number]; // [south, north, west, east]
}

// 3. Forward Geocoding (Search) - Switched to Photon (Komoot) for CORS support
export const searchLocations = async (query: string): Promise<SearchResult | null> => {
    try {
        const response = await fetchWithTimeout(
            `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`,
            {}, 
            3000
        );
        if (!response.ok) throw new Error("Search failed");
        
        const data = await response.json();
        
        if (data && data.features && data.features.length > 0) {
            const feature = data.features[0];
            const [lng, lat] = feature.geometry.coordinates;
            const props = feature.properties;
            
            let bounds: [number, number, number, number] | undefined = undefined;
            
            if (props.extent) {
                // Photon extent: [minLon (West), minLat (South), maxLon (East), maxLat (North)]
                // App expects: [south, north, west, east]
                bounds = [
                    props.extent[1], // South
                    props.extent[3], // North
                    props.extent[0], // West
                    props.extent[2]  // East
                ];
            }

            return {
                lat,
                lng,
                name: props.name || props.city || props.country || query,
                bounds
            };
        }
        return null;
    } catch (e) {
        console.warn("Search location failed", e);
        return null;
    }
};

export const getIpLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
        const response = await fetchWithTimeout(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en`,
            {}, 2000
        );
        if (response.ok) {
            const data = await response.json();
            if (data.latitude && data.longitude) {
                return { lat: data.latitude, lng: data.longitude };
            }
        }
    } catch (e) {
        // console.warn("Primary IP Location (BigDataCloud) failed");
    }

    try {
        const response = await fetchWithTimeout('https://ipapi.co/json/', {}, 2000);
        if (response.ok) {
            const data = await response.json();
            if (data.latitude && data.longitude) {
                return { lat: data.latitude, lng: data.longitude };
            }
        }
    } catch (e) {
        // console.warn("Secondary IP Location (ipapi) failed");
    }

    return null;
};