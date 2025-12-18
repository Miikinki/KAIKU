import { getIpLocation } from './moderationService';
import { calculateDistance } from './storageService';

export interface LocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  isFallback: boolean; // True if we had to revert to low accuracy or IP
}

/**
 * ROBUST GEOLOCATION STRATEGY FOR MOBILE CHROME (SIMPLIFIED)
 * 
 * Reverted to "Try High, Accept Low" logic without strict timeouts blocking usage.
 * This ensures the app always gets a location eventually.
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
  // If it takes too long (>10s), we failover.
  try {
    const pos = await getPos({
      enableHighAccuracy: true,
      timeout: 10000, 
      maximumAge: 60000 // Accept positions up to 1m old
    });

    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      isFallback: false
    };

  } catch (err: any) {
    console.warn(`KAIKU_GPS: High Accuracy Failed (Code: ${err.code}). Reverting to standard...`);

    // STEP 2: Standard Accuracy (Network/Cell)
    // Very loose constraints to just get SOMETHING
    try {
      const pos = await getPos({
        enableHighAccuracy: false,
        timeout: 10000, 
        maximumAge: 300000 // Accept 5 min old data
      });

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        isFallback: true
      };
    } catch (fallbackErr: any) {
      console.warn("KAIKU_GPS: Hardware methods failed. Attempting IP fallback...");
      
      // STEP 3: IP LOCATION FALLBACK (Last Resort)
      const ipLoc = await getIpLocation();
      if (ipLoc) {
          return {
              lat: ipLoc.lat,
              lng: ipLoc.lng,
              accuracy: 5000, // Low accuracy
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