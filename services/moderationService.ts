import { BANNED_WORDS } from '../constants';

// 1. Content Moderation (Basic)
export const moderateContent = (text: string): boolean => {
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) return false; // Rejected
  }
  return true; // Approved
};

// 2. Reverse Geocoding (BigDataCloud Free API - CORS Friendly)
export const getCityName = async (lat: number, lng: number): Promise<{ city: string; countryCode: string }> => {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    
    if (!response.ok) throw new Error('Geocoding failed');
    
    const data = await response.json();
    
    const city = data.city || 
           data.locality || 
           data.principalSubdivision || 
           data.countryName || 
           "Unknown Sector";
    
    const countryCode = data.countryCode || "";

    return { city, countryCode };
           
  } catch (error) {
    console.warn("Geocoding failed, falling back to coordinates", error);
    return { city: `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`, countryCode: "" };
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
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
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
        const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en`
        );
        if (response.ok) {
            const data = await response.json();
            if (data.latitude && data.longitude) {
                return { lat: data.latitude, lng: data.longitude };
            }
        }
    } catch (e) {
        console.warn("Primary IP Location (BigDataCloud) failed", e);
    }

    try {
        const response = await fetch('https://ipapi.co/json/');
        if (response.ok) {
            const data = await response.json();
            if (data.latitude && data.longitude) {
                return { lat: data.latitude, lng: data.longitude };
            }
        }
    } catch (e) {
        console.warn("Secondary IP Location (ipapi) failed", e);
    }

    return null;
};