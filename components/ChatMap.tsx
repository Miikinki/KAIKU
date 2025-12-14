import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import { Crosshair, Lock } from 'lucide-react';
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
  hasSignal: boolean;
}

// --- ANIMATED ELLIPSIS COMPONENT (Sequential) ---
const AnimatedEllipsis = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-block w-6 text-left font-bold text-inherit">
      {dots}
    </span>
  );
};

// --- MAP CONTROLLER ---
const MapController: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    setZoom: (z: number) => void
}> = ({ onViewportChange, setZoom }) => {
  
  const map = useMap();

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
        const center = map.getCenter();
        const z = map.getZoom();
        setZoom(z); 
        onViewportChange({
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
            zoom: z,
            center: { lat: center.lat, lng: center.lng }
        });
    },
    zoomend: () => {
        setZoom(map.getZoom());
    }
  });

  return null;
};

// --- MAIN CHAT MAP ---
const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, onViewportChange, onMapClick, lastNewMessage, hasSignal }) => {
  const [zoom, setZoom] = useState(5);
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12] w-full h-full">
      <MapContainer
        center={[25, 0]} 
        zoom={4}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }}
        minZoom={4}
        maxZoom={11}
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
        <HeatmapLayer messages={messages} />
        
      </MapContainer>

      {/* VIEWPORT TUNER CROSSHAIR OVERLAY */}
      <div className="pointer-events-none absolute inset-0 z-[400] flex flex-col items-center justify-center pb-48">
          
          {/* Wrapper for Circle and Crosshair */}
          <div className="relative flex items-center justify-center transition-all duration-500">
              {/* Animated Target HUD */}
              <div className={`absolute flex items-center justify-center w-64 h-64 transition-all duration-500 ${hasSignal ? 'opacity-100 scale-105' : 'opacity-20 scale-100'}`}>
                   {/* Outer Ring */}
                   <div className={`absolute inset-0 border rounded-full animate-[spin_10s_linear_infinite] transition-colors duration-500 ${hasSignal ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'border-cyan-500/30'}`} />
                   
                   {/* Inner Dashed Ring */}
                   <div className={`absolute inset-4 border rounded-full border-dashed animate-[spin_15s_linear_infinite_reverse] transition-colors duration-500 ${hasSignal ? 'border-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'border-cyan-500/20'}`} />
              </div>
              
              {/* Center Crosshair */}
              <div className={`transition-all duration-300 z-10 ${hasSignal ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.9)] scale-110' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]'}`}>
                  {hasSignal ? <Lock size={32} strokeWidth={2} /> : <Crosshair size={32} strokeWidth={1.5} />}
              </div>
          </div>

          {/* HUD Text */}
          <div className={`mt-36 flex items-center gap-2 text-[10px] font-mono tracking-[0.2em] uppercase px-4 py-2 rounded backdrop-blur-md border shadow-lg transition-all duration-500 ${
              hasSignal 
                ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]' 
                : 'bg-black/60 border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
          }`}>
              <span className={`drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] ${hasSignal ? 'animate-none font-bold' : 'animate-pulse'}`}>
                {hasSignal ? t('map.signal_locked') : t('map.sector_scan_active')}
              </span>
              {!hasSignal && <AnimatedEllipsis />}
          </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
    return prevProps.messages === nextProps.messages && 
           prevProps.lastNewMessage === nextProps.lastNewMessage &&
           prevProps.hasSignal === nextProps.hasSignal;
});

export default ChatMap;