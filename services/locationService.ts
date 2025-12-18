import { getIpLocation } from './moderationService';

export interface LocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  isFallback: boolean; // True if we had to revert to low accuracy or IP
}

/**
 * GRACEFUL FALLBACK GEOLOCATION STRATEGY
 * Designed specifically to handle "High Accuracy" failures on Chrome Android.
 * 1. Step 1: Attempt High Accuracy (GPS) with 10s timeout.
 * 2. Step 2: On failure, attempt Low Accuracy (Network/WiFi) with 10s timeout.
 * 3. Step 3: Use maximumAge: 0 to ensure fresh readings and prevent stale Android cache.
 */
export const getPreciseLocation = async (): Promise<LocationResult> => {
  
  const getPos = (options: PositionOptions): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  // STEP 1: Attempt High Accuracy (GPS Hardware)
  try {
    console.log("KAIKU_GPS: Attempting High Accuracy (10s timeout)...");
    const pos = await getPos({
      enableHighAccuracy: true,
      timeout: 10000, // 10s timeout as requested
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
    if (err.code === 1) {
        console.error("KAIKU_GPS: Permission Denied.");
        throw new Error("Location permission denied");
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
      throw new Error("Could not determine location.");
    }
  }
};
