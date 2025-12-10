import { BANNED_WORDS } from '../constants';

// 1. Content Moderation (Basic)
export const moderateContent = (text: string): boolean => {
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) return false; // Rejected
  }
  return true; // Approved
};

// 2. Reverse Geocoding (Nominatim Free API)
export const getCityName = async (lat: number, lng: number): Promise<string> => {
  try {
    // Artificial delay to prevent spamming the free API
    await new Promise(r => setTimeout(r, 500));
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
      { headers: { 'User-Agent': 'Kaiku/1.0' } }
    );
    
    if (!response.ok) throw new Error('Geocoding failed');
    
    const data = await response.json();
    const addr = data.address;
    
    // Try to find the most relevant "City" name
    return addr.city || 
           addr.town || 
           addr.village || 
           addr.municipality || 
           addr.county || 
           addr.state || 
           "Unknown Sector";
           
  } catch (error) {
    console.warn("Geocoding failed, falling back to coordinates", error);
    return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  }
};