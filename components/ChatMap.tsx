import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, Marker } from 'react-leaflet';
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
        
        // Fix: Do NOT round here. Pass the raw float to state 
        // to avoid fighting with Leaflet's internal animation loop.
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

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onMapClick, lastNewMessage }) => {
  const [zoom, setZoom] = useState(5);
  const [shockwaves, setShockwaves] = useState<{id: string, lat: number, lng: number}[]>([]);

  // Effect: Trigger Shockwave when a new message arrives
  useEffect(() => {
    if (lastNewMessage) {
        const id = Date.now().toString() + Math.random().toString();
        const wave = { 
            id, 
            lat: lastNewMessage.location.lat, 
            lng: lastNewMessage.location.lng 
        };
        
        setShockwaves(prev => [...prev, wave]);

        // Remove after animation (2 seconds)
        setTimeout(() => {
            setShockwaves(prev => prev.filter(w => w.id !== id));
        }, 2000);
    }
  }, [lastNewMessage]);

  const hexData = useMemo(() => {
      // PRIVACY & VISUAL LOGIC
      // We calculate the effective integer zoom for H3 logic only here,
      // without affecting the actual map view state.
      const effectiveZoom = Math.floor(zoom);

      let res = 4; // Default: Regional (approx 20km radius)
      
      // Adjusted Logic:
      // Zoom 0-8:   Res 4 (Big Hexagons, covers whole cities)
      // Zoom 9-11:  Res 5 (Medium, ~8km radius)
      // Zoom 12+:   Res 6 (District, ~3km radius) -> PRIVACY CAP
      
      if (effectiveZoom >= 9) res = 5;
      if (effectiveZoom >= 12) res = 6; 
      
      const counts: Record<string, number> = {};
      
      if (messages.length > 0) {
        messages.forEach(msg => {
            try {
               const hexIndex = h3.latLngToCell(msg.location.lat, msg.location.lng, res);
               if (!counts[hexIndex]) counts[hexIndex] = 0;
               counts[hexIndex]++;
            } catch(e) {
                // Ignore invalid coords
            }
        });
      }

      return Object.entries(counts).map(([hexId, count]) => ({
          coords: h3.cellToBoundary(hexId) as [number, number][],
          count: count
      }));

  }, [messages, zoom]);

  // DivIcon for Shockwave Animation
  const createShockwaveIcon = () => {
      return L.divIcon({
          className: 'custom-shockwave-icon',
          html: `<div class="shockwave-container"><div class="shockwave-ring"></div></div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
      });
  };

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
        worldCopyJump={true} 
        maxBounds={[[-85, -180], [85, 180]]}
        preferCanvas={true} 
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={false} 
          opacity={0.8}
        />

        <MapEventHandler 
            onMapClick={onMapClick} 
            onViewportChange={onViewportChange}
            setZoom={setZoom}
        />

        <HeatmapLayer polygons={hexData} />

        {/* Render Active Shockwaves */}
        {shockwaves.map(wave => (
            <Marker 
                key={wave.id}
                position={[wave.lat, wave.lng]}
                icon={createShockwaveIcon()}
            />
        ))}
        
      </MapContainer>
    </div>
  );
};

export default ChatMap;