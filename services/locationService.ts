import { getIpLocation } from './moderationService';

export interface LocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  isFallback: boolean; // True if we had to revert to low accuracy or IP
}

/**
 * AGGRESSIVE GEOLOCATION STRATEGY
 * 1. Mandates High Accuracy to wake up GPS hardware.
 * 2. Sets a timeout (15s) to allow cold-boot GPS to lock.
 * 3. Sets maximumAge: 0 to prevent cached Wi-Fi location.
 * 4. Automatically falls back to Low Accuracy if hardware fails.
 */
export const getPreciseLocation = async (): Promise<LocationResult> => {
  
  const getPos = (options: PositionOptions): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  // STRATEGY 1: HARDWARE GPS (Strict High Accuracy)
  try {
    console.log("KAIKU: Attempting High Accuracy GPS (15s timeout)...");
    const pos = await getPos({
      enableHighAccuracy: true,
      timeout: 15000, // 15s allows mobile GPS radio to warm up
      maximumAge: 0   // Force fresh reading, no cache
    });

    console.log(`KAIKU: GPS Lock Acquired. Accuracy: ${Math.round(pos.coords.accuracy)}m`);
    
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      isFallback: false
    };

  } catch (err: any) {
    const errorTypes = ['UNKNOWN', 'PERMISSION_DENIED', 'POSITION_UNAVAILABLE', 'TIMEOUT'];
    const errorType = errorTypes[err.code] || 'UNKNOWN';
    console.warn(`KAIKU: High Accuracy Failed [${errorType}]: ${err.message}`);

    // If permission was denied, throw immediately
    if (err.code === 1) {
        throw new Error("Location permission denied");
    }

    // STRATEGY 2: SOFT FALLBACK (WiFi/Cell Towers)
    // If hardware timed out (code 3) or unavailable (code 2), try low accuracy.
    try {
      console.log("KAIKU: Attempting Low Accuracy Fallback...");
      const pos = await getPos({
        enableHighAccuracy: false,
        timeout: 10000, // 10s for network location
        maximumAge: 0
      });

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        isFallback: true
      };
    } catch (fallbackErr) {
      console.warn("KAIKU: Low Accuracy Fallback Failed.", fallbackErr);
      throw new Error("Could not determine location.");
    }
  }
};
