import { ChatMessage } from '../types';

export interface CityHubData {
  id: string; // Use city name as ID
  name: string;
  center: { lat: number, lng: number };
  count: number;
  messages: ChatMessage[];
  latestTimestamp: number;
}

export const aggregateMessagesByCity = (messages: ChatMessage[]): CityHubData[] => {
  const cityMap = new Map<string, CityHubData>();

  messages.forEach(msg => {
    // Normalize city name
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

  // Calculate averages for center point and return array
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