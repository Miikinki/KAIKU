import { getIpLocation } from './moderationService';
import { calculateDistance } from './storageService';

export interface LocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  isFallback: boolean; // True if we had to revert to low accuracy or IP
}

/**
 * ROBUST GEOLOCATION STRATEGY FOR MOBILE CHROME
 * 
 * Android Chrome issues addressed:
 * 1. Increased timeout (5s -> 15s) to allow cold GPS start.
 * 2. Enabled cached positions (maximumAge: 10000) to prevent lock-ups.
 * 3. Automatic fall-through to IP location if hardware fails.
 */
export const getPreciseLocation = async (): Promise<LocationResult> => {
  
  // 0. SECURE CONTEXT CHECK (Critical for Chrome)
  if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.protocol !== 'file:') {
      console.warn("KAIKU_GPS: Non-secure context. Geolocation might fail.");
  }

  const getPos = (options: PositionOptions): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  // STEP 1: Attempt High Accuracy (GPS Hardware)
  // Timeout increased to 15s for Android "Cold Start"
  try {
    console.log("KAIKU_GPS: Step 1 - High Accuracy...");
    const pos = await getPos({
      enableHighAccuracy: true,
      timeout: 15000, 
      maximumAge: 10000 // Accept positions up to 10s old to allow instant UI response
    });

    console.log(`KAIKU_GPS: High Accuracy Lock. ±${Math.round(pos.coords.accuracy)}m`);
    
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      isFallback: false
    };

  } catch (err: any) {
    // Check if permission was explicitly denied - STOP HERE if so.
    if (err.code === 1) { // PERMISSION_DENIED
        console.error("KAIKU_GPS: Permission Denied.");
        throw new Error("Permission Denied: Please enable Location in Browser Settings.");
    }

    console.warn(`KAIKU_GPS: High Accuracy Failed (Code: ${err.code}). Reverting to Network/IP...`);

    // STEP 2: Low Accuracy Fallback (Network Triangulation)
    // Faster timeout (7s) since network location should be quick if available.
    try {
      const pos = await getPos({
        enableHighAccuracy: false,
        timeout: 7000, 
        maximumAge: 30000 
      });

      console.log(`KAIKU_GPS: Low Accuracy Lock. ±${Math.round(pos.coords.accuracy)}m`);

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        isFallback: true
      };
    } catch (fallbackErr: any) {
      console.warn("KAIKU_GPS: Hardware methods failed. Attempting IP fallback...");
      
      // STEP 3: IP LOCATION FALLBACK (Last Resort)
      // This ensures the UI never gets stuck on "Locating..."
      const ipLoc = await getIpLocation();
      if (ipLoc) {
          console.log("KAIKU_GPS: IP Location used.");
          return {
              lat: ipLoc.lat,
              lng: ipLoc.lng,
              accuracy: 5000, // Low accuracy for IP
              isFallback: true
          };
      }
      
      throw new Error("Could not determine location via GPS or IP.");
    }
  }
};

/**
 * Returns a humanized, conversational label for distance.
 * Jodel-style: "Here", "Close", "In the area".
 */
export const getHumanizedDistance = (
    userLat: number,
    userLng: number,
    targetLat: number,
    targetLng: number,
    cityName: string,
    t: (key: string) => string
): { text: string; style: string } => {
    
    const distKm = calculateDistance(userLat, userLng, targetLat, targetLng);

    // 0 - 1 km: Here
    if (distKm <= 1.0) {
        return { 
            text: t('distance.here'), 
            style: 'text-cyan-400 font-black tracking-wide' 
        };
    }
    // 1 - 3 km: Very Close (NEW)
    if (distKm <= 3.0) {
        return { 
            text: t('distance.very_close'), 
            style: 'text-green-400 font-bold' 
        };
    }
    // 3 - 10 km: Close
    if (distKm <= 10.0) {
        return { 
            text: t('distance.close'), 
            style: 'text-green-500/80 font-medium' 
        };
    }
    // 10 - 25 km: In the area
    if (distKm <= 25.0) {
        return { 
            text: t('distance.area'), 
            style: 'text-yellow-400 font-medium' 
        };
    }

    // > 25 km: City Name or "Further away"
    return { 
        text: cityName || t('distance.far'), 
        style: 'text-gray-400 font-medium' 
    };
};