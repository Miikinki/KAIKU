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
// Increased default timeout to 10s to avoid aggressive aborts
const fetchWithTimeout = async (resource: string, options: RequestInit = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

// CACHE for Reverse Geocoding
// Key: "lat_fixed2,lng_fixed2" (approx 1km precision)
const cityCache = new Map<string, { city: string; countryCode: string; countryName: string }>();

// 2. Reverse Geocoding (Robust Multi-Provider)
export const getCityName = async (lat: number, lng: number): Promise<{ city: string; countryCode: string; countryName: string }> => {
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  
  if (cityCache.has(cacheKey)) {
      return cityCache.get(cacheKey)!;
  }

  // Default Fallback: Coordinates (looks cooler than "Unknown")
  let result = { 
      city: `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`, 
      countryCode: "", 
      countryName: "Unknown Territory" 
  };
  
  let found = false;

  // STRATEGY 1: Photon (OpenStreetMap) - High Precision
  try {
    const response = await fetchWithTimeout(
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`,
      {},
      4000 // Short timeout to allow failover
    );
    
    if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
            const props = data.features[0].properties;
            
            // Try to find the most relevant city name
            const cityName = props.city || 
                   props.town || 
                   props.village || 
                   props.county || 
                   props.name;
                   
            if (cityName) {
                result.city = cityName;
                result.countryCode = props.countrycode ? props.countrycode.toUpperCase() : "";
                result.countryName = props.country || "Unknown Territory";
                found = true;
            }
        }
    }
  } catch (error) {
    // Photon failed, proceed to Strategy 2
  }

  // STRATEGY 2: BigDataCloud (Client Side) - High Reliability for Admin Areas
  if (!found) {
      try {
          // Note: BDC uses full words 'latitude' and 'longitude'
          const response = await fetchWithTimeout(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
              {},
              4000
          );

          if (response.ok) {
              const data = await response.json();
              // BDC hierarchy
              const cityName = data.city || data.locality || data.principalSubdivision;
              
              if (cityName) {
                  result.city = cityName;
                  result.countryCode = data.countryCode || "";
                  result.countryName = data.countryName || "Unknown Territory";
                  found = true;
              }
          }
      } catch (e) {
          // BDC failed, keep coordinate fallback
      }
  }

  // Save to Cache
  cityCache.set(cacheKey, result);
  
  // Limit cache size
  if (cityCache.size > 100) {
      const firstKey = cityCache.keys().next().value;
      if (firstKey) cityCache.delete(firstKey);
  }

  return result;
};

export interface SearchResult {
  lat: number;
  lng: number;
  name: string;
  bounds?: [number, number, number, number]; // [south, north, west, east]
}

// 3. Forward Geocoding (Search) - Photon (Komoot)
export const searchLocations = async (query: string): Promise<SearchResult | null> => {
    try {
        const response = await fetchWithTimeout(
            `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`,
            {}, 
            12000
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
    // Fallback chain for IP location
    try {
        // Try ipapi.co first (more reliable JSON)
        const response = await fetchWithTimeout('https://ipapi.co/json/', {}, 5000);
        if (response.ok) {
            const data = await response.json();
            if (data.latitude && data.longitude) {
                return { lat: data.latitude, lng: data.longitude };
            }
        }
    } catch (e) {
        // ignore
    }

    try {
        // Try BigDataCloud as secondary (might fail with 400 but worth a shot for IP based)
        const response = await fetchWithTimeout(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en`,
            {}, 5000
        );
        if (response.ok) {
            const data = await response.json();
            if (data.latitude && data.longitude) {
                return { lat: data.latitude, lng: data.longitude };
            }
        }
    } catch (e) {
        // ignore
    }

    return null;
};