import { getIpLocation } from './moderationService';
import { calculateDistance } from './storageService';

export interface LocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  isFallback: boolean; // True if we had to revert to low accuracy or IP
}

/**
 * GRACEFUL FALLBACK GEOLOCATION STRATEGY
 * Designed specifically to handle "High Accuracy" failures on Chrome Android.
 * 1. Step 1: Attempt High Accuracy (GPS) with 5s timeout (Reduced from 10s).
 * 2. Step 2: On failure, attempt Low Accuracy (Network/WiFi) with 10s timeout.
 * 3. Step 3: Use maximumAge: 0 to ensure fresh readings and prevent stale Android cache.
 */
export const getPreciseLocation = async (): Promise<LocationResult> => {
  
  // 0. SECURE CONTEXT CHECK (Critical for Chrome)
  if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.protocol !== 'file:') {
      throw new Error("Secure Context Required (HTTPS) for location access.");
  }

  const getPos = (options: PositionOptions): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  // STEP 1: Attempt High Accuracy (GPS Hardware)
  try {
    console.log("KAIKU_GPS: Attempting High Accuracy (5s timeout)...");
    const pos = await getPos({
      enableHighAccuracy: true,
      timeout: 5000, // Reduced to 5s for Chrome Android responsiveness
      maximumAge: 0   // Force fresh reading
    });

    console.log(`KAIKU_GPS: High Accuracy Lock. ±${Math.round(pos.coords.accuracy)}m`);
    
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      isFallback: false
    };

  } catch (err: any) {
    // Check if permission was explicitly denied
    if (err.code === 1) { // PERMISSION_DENIED
        console.error("KAIKU_GPS: Permission Denied.");
        throw new Error("Permission Denied: Please enable Location in Browser Settings.");
    }

    console.warn(`KAIKU_GPS: High Accuracy Failed (Code: ${err.code}). Error: ${err.message}`);
    console.log("KAIKU_GPS: Reverting to Step 2: Low Accuracy (Network/WiFi)...");

    // STEP 2: Low Accuracy Fallback (Network Triangulation)
    // This is much more reliable on Chrome Android in indoor or power-saving modes.
    try {
      const pos = await getPos({
        enableHighAccuracy: false,
        timeout: 10000, // 10s timeout for network fallback
        maximumAge: 0
      });

      console.log(`KAIKU_GPS: Low Accuracy Lock. ±${Math.round(pos.coords.accuracy)}m`);

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        isFallback: true
      };
    } catch (fallbackErr: any) {
      console.error("KAIKU_GPS: All hardware/network methods failed.", fallbackErr);
      
      if (fallbackErr.code === 1) throw new Error("Permission Denied");
      if (fallbackErr.code === 2) throw new Error("Position Unavailable: Check GPS Settings."); // POSITION_UNAVAILABLE
      if (fallbackErr.code === 3) throw new Error("Connection Timeout: GPS Signal weak."); // TIMEOUT
      
      throw new Error("Could not determine location.");
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
            style: 'text-cyan-400 font-black tracking-wide' // Removed 'uppercase'
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