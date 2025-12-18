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

// 2. Reverse Geocoding (BigDataCloud Free API - CORS Friendly)
export const getCityName = async (lat: number, lng: number): Promise<{ city: string; countryCode: string; countryName: string }> => {
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

    return { city, countryCode, countryName };
           
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

// 3. Forward Geocoding (Search)
export const searchLocations = async (query: string): Promise<SearchResult | null> => {
    try {
        const response = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
            { headers: { 'User-Agent': 'KaikuApp/2.0' } },
            3000
        );
        if (!response.ok) throw new Error("Search failed");
        
        const data = await response.json();
        if (data && data.length > 0) {
            const result = data[0];
            let bounds: [number, number, number, number] | undefined = undefined;
            
            if (result.boundingbox) {
                // Nominatim returns [lat_min, lat_max, lon_min, lon_max]
                bounds = [
                    parseFloat(result.boundingbox[0]), 
                    parseFloat(result.boundingbox[1]), 
                    parseFloat(result.boundingbox[2]), 
                    parseFloat(result.boundingbox[3])
                ];
            }

            return {
                lat: parseFloat(result.lat),
                lng: parseFloat(result.lon),
                name: result.display_name.split(',')[0],
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