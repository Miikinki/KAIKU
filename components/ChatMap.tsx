import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import * as L from 'leaflet';
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
    onZoomChange: (z: number) => void;
    onMapClick: () => void;
}> = ({ onZoomChange, onMapClick }) => {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
    click: () => {
        // Global Map Click Handler -> Opens Feed
        onMapClick();
    }
  });
  return null;
};

const MapResizeHandler: React.FC<{ onViewportChange: (b: ViewportBounds) => void }> = ({ onViewportChange }) => {
  const map = useMap();
  const mapContainerRef = useRef<HTMLElement | null>(map.getContainer());

  useEffect(() => {
    const handleUpdate = () => {
      map.invalidateSize();
      const bounds = map.getBounds();
      onViewportChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom()
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
  const [zoom, setZoom] = useState(2.5);

  // --- PRIVACY-FIRST DATA PREPARATION ---
  const heatmapData = useMemo(() => {
      const SNAPPING_PRECISION = 0.01; // Approx 1.1km
      
      const points = messages.map(msg => {
          const snappedLat = Math.round(msg.location.lat / SNAPPING_PRECISION) * SNAPPING_PRECISION;
          const snappedLng = Math.round(msg.location.lng / SNAPPING_PRECISION) * SNAPPING_PRECISION;
          
          // Use Score to weight intensity.
          // Base intensity must be high enough to be seen with new settings.
          // Range: 0.8 (base) to 5.0 (highly upvoted)
          const baseIntensity = 0.8;
          const scoreBonus = Math.max(msg.score, 0) * 0.2; 
          const intensity = Math.min(baseIntensity + scoreBonus, 5.0);

          return [snappedLat, snappedLng, intensity] as [number, number, number];
      });

      return points;
  }, [messages]);

  // --- VISUAL TUNING: "NORTHERN LIGHTS" FIXED ---
  const heatOptions = useMemo(() => ({
      radius: 30,         // Slightly larger for better connectivity
      blur: 25,           // Soft edges
      max: 2.0,           // CRITICAL FIX: Lower max means points reach full brightness easier.
      minOpacity: 0.15,   // CRITICAL FIX: Ensure background glow is visible (not 0.0)
      gradient: {
          0.0: 'rgba(6, 182, 212, 0)',    // Fully Transparent
          0.2: 'rgba(6, 182, 212, 0.3)',  // Cyan Mist (Visible now)
          0.5: 'rgba(34, 211, 238, 0.7)', // Cyan Signal
          0.8: 'rgba(165, 243, 252, 0.9)', // Ice Blue
          1.0: '#ffffff'                  // White Hot Core
      }
  }), [zoom]);

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[60.16, 24.93]} // Default to Helsinki coords roughly for better initial UX if Geo fails
        zoom={5}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100vw', height: '100vh', background: '#0a0a12' }}
        minZoom={2}
        worldCopyJump={true}
        maxBounds={[[-85, -Infinity], [85, Infinity]]}
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={false}
          opacity={0.5} // Keep background map dark
        />

        <MapController onZoomChange={setZoom} onMapClick={onMapClick} />
        <MapResizeHandler onViewportChange={onViewportChange} />

        {/* PRIVACY-SAFE HEATMAP LAYER */}
        <HeatmapLayer 
            points={heatmapData} 
            options={heatOptions}
        />
        
      </MapContainer>
    </div>
  );
};

export default ChatMap;