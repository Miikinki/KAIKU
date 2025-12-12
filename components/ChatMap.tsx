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
  const [zoom, setZoom] = useState(5); // Default start zoom

  // --- PRIVACY-FIRST DATA PREPARATION ---
  const heatmapData = useMemo(() => {
      // Snapping ~600-700m. 
      const SNAPPING_PRECISION = 0.006; 
      
      const points = messages.map(msg => {
          const snappedLat = Math.round(msg.location.lat / SNAPPING_PRECISION) * SNAPPING_PRECISION;
          const snappedLng = Math.round(msg.location.lng / SNAPPING_PRECISION) * SNAPPING_PRECISION;
          
          // Intensity Logic:
          // Range: 0.5 - 3.0
          const baseIntensity = 0.6;
          const scoreBonus = Math.max(msg.score, 0) * 0.1; 
          const intensity = Math.min(baseIntensity + scoreBonus, 3.0);

          return [snappedLat, snappedLng, intensity] as [number, number, number];
      });

      return points;
  }, [messages]);

  // --- DYNAMIC VISUAL TUNING ---
  
  // VISIBILITY FIX:
  // When zoomed out, we prevent the points from fading away by setting maxZoom = currentZoom.
  // This effectively disables the intensity reduction formula in the heatmap engine.
  const dynamicMaxZoom = zoom;

  // Size of the dots
  const getRadius = (z: number) => {
      if (z < 6) return 8;    // World view: small, distinct dots
      if (z < 10) return 18;  // Country view
      if (z < 13) return 30;  // City view
      return 45;              // Street view: ambient glow
  };

  // Visibility floor
  const getMinOpacity = (z: number) => {
       if (z < 8) return 0.35; // High floor when zoomed out -> dots are ALWAYS visible
       return 0.05;            // Low floor when zoomed in -> allows transparency
  };

  const heatOptions = useMemo(() => ({
      radius: getRadius(zoom),
      blur: 15,           // Standard blur
      max: 2.0,           // Intensity saturation point
      minOpacity: getMinOpacity(zoom),
      maxZoom: dynamicMaxZoom, // Keeps dots bright at all levels
      gradient: {
          0.0: 'rgba(6, 182, 212, 0)',    // Transparent
          0.1: 'rgba(6, 182, 212, 0.4)',  // Cyan Mist (Starts early!)
          0.5: 'rgba(34, 211, 238, 0.7)', // Visible Cyan
          0.8: 'rgba(200, 255, 255, 0.9)', // Bright
          1.0: '#ffffff'                  // Core White
      }
  }), [zoom, dynamicMaxZoom]); 

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
        minZoom={3} // FIX: Raised to 3 to prevent extreme zoom-out drift
        worldCopyJump={false} // DISABLED to fix drift
        maxBounds={[[-85, -180], [85, 180]]} // Strict bounds
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={true} // Don't repeat tiles
          opacity={0.7} // Background map visibility
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