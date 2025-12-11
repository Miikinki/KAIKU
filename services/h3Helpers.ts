import * as h3 from 'h3-js';
import { ChatMessage } from '../types';

export interface HexagonData {
  h3Index: string;
  boundary: [number, number][]; // Array of [lat, lng]
  center: [number, number]; // [lat, lng]
  messages: ChatMessage[];
  count: number;
  latestTimestamp: number;
}

export const getH3Resolution = (zoom: number): number => {
    // PRIVACY CLAMP: Never go finer than Resolution 8 (~0.7km²)
    // This prevents pinpointing users to specific blocks/streets.
    if (zoom > 10) return 8; 
    
    if (zoom >= 7) return 7; // ~5km² (District/City view)
    
    return 5; // ~250km² (Regional/Global view)
};

export const getHexagonForLocation = (lat: number, lng: number, resolution: number): string => {
  return h3.latLngToCell(lat, lng, resolution);
};

export const getHexagonBoundary = (h3Index: string): [number, number][] => {
  return h3.cellToBoundary(h3Index);
};

export const aggregateMessagesByHexagon = (messages: ChatMessage[], resolution: number): HexagonData[] => {
  const map = new Map<string, HexagonData>();

  messages.forEach(msg => {
    const h3Index = h3.latLngToCell(msg.location.lat, msg.location.lng, resolution);
    if (!map.has(h3Index)) {
      map.set(h3Index, {
        h3Index,
        boundary: h3.cellToBoundary(h3Index),
        center: h3.cellToLatLng(h3Index),
        messages: [],
        count: 0,
        latestTimestamp: 0
      });
    }
    const hex = map.get(h3Index)!;
    hex.messages.push(msg);
    hex.count++;
    if (msg.timestamp > hex.latestTimestamp) {
        hex.latestTimestamp = msg.timestamp;
    }
  });

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};