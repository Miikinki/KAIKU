import * as h3 from 'h3-js';
import { ChatMessage } from '../types';

export interface HexagonData {
  h3Index: string;
  boundary: [number, number][]; // Array of [lat, lng]
  messages: ChatMessage[];
  count: number;
}

// Resolution 7 is approx 5km edge length (City district size)
// Resolution 8 is approx 2km edge length (Neighborhood size)
const H3_RESOLUTION = 7; 

export const getHexagonForLocation = (lat: number, lng: number): string => {
  return h3.latLngToCell(lat, lng, H3_RESOLUTION);
};

export const getHexagonBoundary = (h3Index: string): [number, number][] => {
  return h3.cellToBoundary(h3Index);
};

export const aggregateMessagesByHexagon = (messages: ChatMessage[]): HexagonData[] => {
  const map = new Map<string, ChatMessage[]>();

  messages.forEach(msg => {
    const h3Index = getHexagonForLocation(msg.location.lat, msg.location.lng);
    if (!map.has(h3Index)) {
      map.set(h3Index, []);
    }
    map.get(h3Index)?.push(msg);
  });

  const results: HexagonData[] = [];
  
  for (const [h3Index, msgs] of map.entries()) {
    results.push({
      h3Index,
      boundary: getHexagonBoundary(h3Index),
      messages: msgs,
      count: msgs.length
    });
  }

  return results.sort((a, b) => b.count - a.count);
};