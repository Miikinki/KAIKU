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
export const getCityName = async (lat: number, lng: number): Promise<string> => {
  try {
    // Using BigDataCloud's free client-side API which handles CORS much better than Nominatim
    // and doesn't require a strict User-Agent header (which browsers block).
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    
    if (!response.ok) throw new Error('Geocoding failed');
    
    const data = await response.json();
    
    // Extract the most relevant location name
    // API returns fields like: city, locality, principalSubdivision, countryName
    return data.city || 
           data.locality || 
           data.principalSubdivision || 
           data.countryName || 
           "Unknown Sector";
           
  } catch (error) {
    console.warn("Geocoding failed, falling back to coordinates", error);
    return `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
  }
};