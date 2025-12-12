import { ChatMessage } from '../types';

// Generic interface for both City Hubs and District Beacons
export interface HubData {
  id: string; 
  name: string;
  center: { lat: number, lng: number };
  count: number;
  messages: ChatMessage[];
  latestTimestamp: number;
}

// --------------------------------------------------------------------------
// ZOOM OUT: City Aggregation (Zoom < 10)
// Groups everything by city name.
// --------------------------------------------------------------------------
export const aggregateMessagesByCity = (messages: ChatMessage[]): HubData[] => {
  const cityMap = new Map<string, HubData>();

  messages.forEach(msg => {
    const cityName = msg.city || 'Unknown Sector';
    
    if (!cityMap.has(cityName)) {
      cityMap.set(cityName, {
        id: cityName,
        name: cityName,
        center: { lat: 0, lng: 0 },
        count: 0,
        messages: [],
        latestTimestamp: 0
      });
    }
    
    const hub = cityMap.get(cityName)!;
    hub.messages.push(msg);
    hub.count++;
    if (msg.timestamp > hub.latestTimestamp) {
      hub.latestTimestamp = msg.timestamp;
    }
  });

  // For Cities, we average the location to find the visual center of activity
  return Array.from(cityMap.values()).map(hub => {
    const totalLat = hub.messages.reduce((sum, m) => sum + m.location.lat, 0);
    const totalLng = hub.messages.reduce((sum, m) => sum + m.location.lng, 0);
    
    return {
      ...hub,
      center: {
        lat: totalLat / hub.count,
        lng: totalLng / hub.count
      }
    };
  }).sort((a, b) => b.count - a.count);
};

// --------------------------------------------------------------------------
// ZOOM IN: District Beacon Snapping (Zoom >= 10)
// Privacy-First: Snaps to fixed grid points (2 decimal places).
// NEVER reveals exact user location. 
// --------------------------------------------------------------------------
export const aggregateMessagesByDistrict = (messages: ChatMessage[]): HubData[] => {
  const gridMap = new Map<string, HubData>();
  const PRECISION = 100; // 2 decimal places -> ~1.1km grid

  messages.forEach(msg => {
    // 1. Calculate the Snap ID (Fixed Grid)
    const snappedLat = Math.round(msg.location.lat * PRECISION) / PRECISION;
    const snappedLng = Math.round(msg.location.lng * PRECISION) / PRECISION;
    const key = `${snappedLat.toFixed(2)}_${snappedLng.toFixed(2)}`;

    if (!gridMap.has(key)) {
      gridMap.set(key, {
        id: key,
        name: msg.city || 'District', // We'll just use the city name for the label for now
        center: { lat: snappedLat, lng: snappedLng }, // CRITICAL: Use snapped loc, not msg loc
        count: 0,
        messages: [],
        latestTimestamp: 0
      });
    }

    const beacon = gridMap.get(key)!;
    beacon.messages.push(msg);
    beacon.count++;
    // Keep name as the most common city name in this grid if we wanted to be fancy, 
    // but just taking the first one is usually fine for a district.
  });

  return Array.from(gridMap.values()).sort((a, b) => b.count - a.count);
};