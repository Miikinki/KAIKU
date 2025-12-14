import { cellToBoundary, latLngToCell, cellToLatLng } from 'h3-js';
import { ChatMessage } from '../types';

export interface HexData {
  h3Id: string;
  count: number;
  score: number; // Aggregate sentiment
  coordinates: number[][]; // Polygon coordinates [lat, lng]
  center: { lat: number, lng: number };
  intensity: number; // 0.0 to 1.0 based on count vs max
}

// HIGH FIDELITY RESOLUTION MAPPING
// We prioritize precision over clustering to avoid "Border Bleed" (e.g. Rovaniemi -> Sweden).
const getH3Resolution = (zoom: number): number => {
  // Zoom 0-3: World View. 
  if (zoom <= 3) return 3; // ~60km edge. Still big, but acceptable for world view.
  
  // Zoom 4: Continent/Large Country (e.g. looking at Scandinavia).
  // Was 3 (~60km), now 4 (~22km). 
  if (zoom <= 4) return 4; 
  
  // Zoom 5: Country View (e.g. Finland fit to screen).
  // Was 4 (~22km), now 5 (~8.5km). This is critical for borders.
  if (zoom <= 5) return 5; 
  
  // Zoom 6-7: Region View.
  // Was 5 (~8.5km), now 6 (~3.2km).
  if (zoom <= 7) return 6;
  
  // Zoom 8-9: Sub-region/City Metro.
  // Now 7 (~1.2km).
  if (zoom <= 9) return 7; 
  
  // Zoom 10-11: City.
  // Now 8 (~460m).
  if (zoom <= 11) return 8;

  // Zoom 12+: Street level.
  // Now 9 (~170m).
  return 9; 
};

export const aggregateMessagesToHexagons = (
  messages: ChatMessage[], 
  zoom: number
): HexData[] => {
  const resolution = getH3Resolution(zoom);
  const hexMap = new Map<string, { count: number; score: number }>();

  // 1. Bin messages into Hexagons
  messages.forEach(msg => {
    try {
      const h3Index = latLngToCell(msg.location.lat, msg.location.lng, resolution);
      const current = hexMap.get(h3Index) || { count: 0, score: 0 };
      
      hexMap.set(h3Index, {
        count: current.count + 1,
        score: current.score + msg.score
      });
    } catch (e) {
      // Ignore invalid coords
    }
  });

  // 2. Determine Max Count for Normalization
  let maxCount = 1;
  hexMap.forEach(val => {
    if (val.count > maxCount) maxCount = val.count;
  });

  // 3. Convert to Renderable Data with LOGARITHMIC SCALING
  const results: HexData[] = [];
  
  hexMap.forEach((data, h3Id) => {
    const boundary = cellToBoundary(h3Id); 
    const [lat, lng] = cellToLatLng(h3Id);

    // Log scale intensity
    const logCount = Math.log(data.count + 1);
    const logMax = Math.log(maxCount + 1);
    const intensity = logMax > 0 ? logCount / logMax : 0.5;

    results.push({
      h3Id,
      count: data.count,
      score: data.score,
      coordinates: boundary,
      center: { lat, lng },
      intensity: intensity 
    });
  });

  return results;
};
