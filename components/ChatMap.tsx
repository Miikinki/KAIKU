import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';
import * as h3 from 'h3-js';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import HeatmapLayer from './HeatmapLayer';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMapClick: () => void;
  lastNewMessage: ChatMessage | null;
}

// Handler for Map Events (Move, Zoom, Click)
const MapEventHandler: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    onMapClick: () => void,
    setZoom: (z: number) => void 
}> = ({ onViewportChange, onMapClick, setZoom }) => {
  
  const map = useMapEvents({
    click: () => onMapClick(),
    moveend: () => {
        const bounds = map.getBounds();
        const z = map.getZoom();
        setZoom(z);
        onViewportChange({
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
            zoom: z
        });
    },
    zoomend: () => {
        setZoom(map.getZoom());
    }
  });

  // Trigger initial load
  React.useEffect(() => {
      map.invalidateSize();
      const bounds = map.getBounds();
      const z = map.getZoom();
      onViewportChange({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
          zoom: z
      });
  }, [map, onViewportChange]);

  return null;
};

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onMapClick }) => {
  const [zoom, setZoom] = useState(5);

  const hexData = useMemo(() => {
      // Robust H3 Resolution Logic
      let res = 4; // Default: Regional
      
      if (zoom >= 6) res = 5;  // City
      if (zoom >= 9) res = 6;  // District
      if (zoom >= 11) res = 7; // Neighborhood (Max Detail)
      
      const counts: Record<string, number> = {};
      
      messages.forEach(msg => {
          try {
             const hexIndex = h3.latLngToCell(msg.location.lat, msg.location.lng, res);
             if (!counts[hexIndex]) counts[hexIndex] = 0;
             counts[hexIndex]++;
          } catch(e) {
              // Ignore invalid coords
          }
      });

      return Object.entries(counts).map(([hexId, count]) => ({
          coords: h3.cellToBoundary(hexId) as [number, number][],
          count: count
      }));

  }, [messages, zoom]);

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[60.16, 24.93]} // Helsinki
        zoom={5}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }}
        minZoom={3}
        worldCopyJump={true} // Smoother infinite scrolling
        maxBounds={[[-85, -180], [85, 180]]}
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={false} // Allow wrapping for worldCopyJump
          opacity={0.8}
        />

        <MapEventHandler 
            onMapClick={onMapClick} 
            onViewportChange={onViewportChange}
            setZoom={setZoom}
        />

        <HeatmapLayer polygons={hexData} />
        
      </MapContainer>
    </div>
  );
};

export default ChatMap;