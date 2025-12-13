import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
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

// ----------------------------------------------------------------------
// MAP CONTROLLERS
// ----------------------------------------------------------------------

const MapController: React.FC<{ 
    onMapClick: () => void;
}> = ({ onMapClick }) => {
  useMapEvents({
    click: () => {
        onMapClick();
    }
  });
  return null;
};

const MapResizeHandler: React.FC<{ onViewportChange: (b: ViewportBounds) => void, setZoom: (z: number) => void }> = ({ onViewportChange, setZoom }) => {
  const map = useMap();
  const mapContainerRef = useRef<HTMLElement | null>(map.getContainer());

  useEffect(() => {
    const handleUpdate = () => {
      map.invalidateSize();
      const bounds = map.getBounds();
      const currentZoom = map.getZoom();
      
      setZoom(currentZoom);
      
      onViewportChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: currentZoom
      });
    };
    
    // Initial warmup
    setTimeout(handleUpdate, 100);
    setTimeout(handleUpdate, 500);

    const resizeObserver = new ResizeObserver(() => handleUpdate());
    if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);
    
    map.on('moveend', handleUpdate);
    map.on('zoomend', handleUpdate);

    return () => {
      resizeObserver.disconnect();
      map.off('moveend', handleUpdate);
      map.off('zoomend', handleUpdate);
    };
  }, [map, onViewportChange]);
  
  return null;
};

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onMapClick, lastNewMessage }) => {
  const [zoom, setZoom] = useState(5);

  const hexData = useMemo(() => {
      // DYNAMIC RESOLUTION BASED ON ZOOM
      // H3 Resolution Scale:
      // Res 4: ~22km edge (Metro Area) - BASELINE. Never go bigger than this.
      // Res 5: ~8.5km edge (City)
      // Res 6: ~3km edge (District)
      // Res 7: ~1.2km edge (Neighborhood) - MAX DETAIL.
      
      let res = 4; // Start at "Large City/Region" level, so Porvoo is just Porvoo.
      
      if (zoom >= 7) res = 5;  // Zoomed into province
      if (zoom >= 9) res = 6;  // Zoomed into city
      if (zoom >= 11) res = 7; // Zoomed into district (Privacy Cap)
      
      const counts: Record<string, number> = {};
      
      messages.forEach(msg => {
          try {
             // Convert point to Hexagon ID
             const hexIndex = h3.latLngToCell(msg.location.lat, msg.location.lng, res);
             if (!counts[hexIndex]) counts[hexIndex] = 0;
             counts[hexIndex]++;
          } catch(e) {
              // Ignore invalid coords
          }
      });

      // Convert Hex IDs to Polygon Coordinates for Leaflet
      return Object.entries(counts).map(([hexId, count]) => {
          const boundary = h3.cellToBoundary(hexId);
          // h3 returns [lat, lng] arrays, exactly what Leaflet wants
          return {
              coords: boundary as [number, number][],
              count: count
          };
      });

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
        style={{ width: '100vw', height: '100vh', background: '#0a0a12' }}
        minZoom={3}
        worldCopyJump={false} 
        maxBounds={[[-85, -180], [85, 180]]}
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={true}
          opacity={0.7}
        />

        <MapController onMapClick={onMapClick} />
        <MapResizeHandler onViewportChange={onViewportChange} setZoom={setZoom} />

        {/* 
            RENDER HEXAGONS
        */}
        <HeatmapLayer polygons={hexData} />
        
      </MapContainer>
    </div>
  );
};

export default ChatMap;