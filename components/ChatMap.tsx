import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import { Crosshair } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer from './HeatmapLayer';
import { useTranslation } from 'react-i18next';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMapClick: () => void;
  lastNewMessage: ChatMessage | null;
}

// --- MAP CONTROLLER ---
const MapController: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    setZoom: (z: number) => void
}> = ({ onViewportChange, setZoom }) => {
  
  const map = useMap();

  // CRITICAL FIX: Robust Size Invalidation
  useEffect(() => {
      const invalidate = () => map.invalidateSize();
      invalidate();
      const rafId = requestAnimationFrame(() => { invalidate(); });
      const timer = setTimeout(invalidate, 500);
      const container = map.getContainer();
      const resizeObserver = new ResizeObserver(() => { invalidate(); });
      resizeObserver.observe(container);
      return () => {
          cancelAnimationFrame(rafId);
          clearTimeout(timer);
          resizeObserver.disconnect();
      };
  }, [map]);

  useMapEvents({
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

  return null;
};

// --- MAIN CHAT MAP ---
const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, onViewportChange, onMapClick, lastNewMessage }) => {
  const [zoom, setZoom] = useState(5);
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12] w-full h-full">
      <MapContainer
        center={[25, 0]} 
        zoom={3}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }}
        minZoom={2} 
        maxZoom={14} // RESTRICTION: City District Level (Privacy "Fog of Zoom")
        maxBounds={[[-90, -180], [90, 180]]} 
        maxBoundsViscosity={1.0} 
        preferCanvas={true}
        worldCopyJump={false} 
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={true}
          opacity={0.8}
        />

        <MapController 
            onViewportChange={onViewportChange}
            setZoom={setZoom}
        />

        <ArcLayer messages={messages} />
        
        {/* HEATMAP LAYER: Pure visual aggregation of activity */}
        <HeatmapLayer messages={messages} />
        
      </MapContainer>

      {/* VIEWPORT TUNER CROSSHAIR OVERLAY */}
      <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
          {/* Animated Target HUD */}
          <div className="relative flex items-center justify-center w-64 h-64 opacity-20">
               <div className="absolute inset-0 border border-cyan-500/30 rounded-full animate-[spin_10s_linear_infinite]" />
               <div className="absolute inset-4 border border-cyan-500/20 rounded-full border-dashed animate-[spin_15s_linear_infinite_reverse]" />
          </div>
          
          {/* Center Crosshair */}
          <div className="absolute text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]">
              <Crosshair size={32} strokeWidth={1.5} />
          </div>

          {/* HUD Text */}
          <div className="absolute mt-24 text-[10px] font-mono text-cyan-500/50 tracking-[0.2em] uppercase bg-black/40 px-2 py-1 rounded backdrop-blur-sm border border-white/5">
              {t('map.sector_scan_active')}
          </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
    return prevProps.messages === nextProps.messages && 
           prevProps.lastNewMessage === nextProps.lastNewMessage;
});

export default ChatMap;