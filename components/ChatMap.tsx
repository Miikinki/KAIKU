import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer from './HeatmapLayer';
import { useTranslation } from 'react-i18next';

interface ChatMapProps {
  messages: ChatMessage[];
  signals: ChatMessage[]; 
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
  const lastUpdateRef = useRef(0);

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

  const handleMove = useCallback(() => {
      const bounds = map.getBounds();
      const center = map.getCenter();
      const z = map.getZoom();
      const size = map.getSize();

      const visualOffsetY = 96; 
      const sectorPoint = [size.x / 2, (size.y / 2) - visualOffsetY];
      
      let sectorLatLng = center;
      try {
          // @ts-ignore
          sectorLatLng = map.containerPointToLatLng(sectorPoint);
      } catch (e) {}

      setZoom(z); 
      onViewportChange({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
          zoom: z,
          center: { lat: center.lat, lng: center.lng },
          sectorCenter: { lat: sectorLatLng.lat, lng: sectorLatLng.lng }
      });
  }, [map, onViewportChange, setZoom]);

  useMapEvents({
    move: () => {
        const now = Date.now();
        if (now - lastUpdateRef.current > 40) {
            handleMove();
            lastUpdateRef.current = now;
        }
    },
    moveend: () => {
        handleMove();
        lastUpdateRef.current = Date.now();
    },
    zoomend: () => {
        setZoom(map.getZoom());
        handleMove(); 
    }
  });

  return null;
};

// --- MAIN CHAT MAP ---
const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, signals, onViewportChange, onMapClick, lastNewMessage, hasSignal }) => {
  const [zoom, setZoom] = useState(5);
  const { t } = useTranslation();

  // Adjusted threshold: UI warning triggers at 12, forcing "Security Protocol" look
  const isMaxZoom = zoom >= 12;

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
        // Reduced from 14 to 13 (Neighborhood level, but not street address level)
        maxZoom={13}
        maxBounds={[[-90, -220], [90, 220]]} 
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

        <ArcLayer messages={signals} />
        <HeatmapLayer messages={messages} />
        
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 z-[400] flex flex-col items-center justify-center pb-48">
          
          <div className="relative flex items-center justify-center transition-all duration-200">
              <div className={`absolute flex items-center justify-center w-64 h-64 transition-all duration-200 ease-out 
                  ${isMaxZoom ? 'opacity-100 scale-110' : (hasSignal ? 'opacity-100 scale-105' : 'opacity-20 scale-100')}
              `}>
                   <div className={`absolute inset-0 border rounded-full animate-[spin_10s_linear_infinite] transition-colors duration-300 
                       ${isMaxZoom 
                            ? 'border-red-500 shadow-[0_0_25px_rgba(239,68,68,0.6)]' 
                            : (hasSignal ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'border-cyan-500/30')
                       }`} 
                   />
                   
                   <div className={`absolute inset-4 border rounded-full border-dashed animate-[spin_15s_linear_infinite_reverse] transition-colors duration-300 
                       ${isMaxZoom 
                            ? 'border-red-400/50 shadow-[0_0_15px_rgba(239,68,68,0.4)]' 
                            : (hasSignal ? 'border-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'border-cyan-500/20')
                       }`} 
                   />
              </div>
              
              <div className={`transition-all duration-300 z-10 
                  ${isMaxZoom 
                      ? 'text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,1)] scale-125' 
                      : (hasSignal ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.9)] scale-110' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]')
                  }`}>
                  {isMaxZoom ? <ShieldAlert size={32} strokeWidth={2} /> : (hasSignal ? <Lock size={32} strokeWidth={2} /> : <Crosshair size={32} strokeWidth={1.5} />)}
              </div>
          </div>

          <div className={`mt-36 flex items-center gap-2 text-[10px] font-mono tracking-[0.2em] uppercase px-4 py-2 rounded backdrop-blur-md border shadow-lg transition-all duration-300 ${
              isMaxZoom
                ? 'bg-red-950/80 border-red-500 text-red-500 shadow-[0_0_30px_rgba(220,38,38,0.5)] animate-pulse'
                : (hasSignal 
                    ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]' 
                    : 'bg-black/60 border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]')
          }`}>
              <span className={`drop-shadow-md ${isMaxZoom || hasSignal ? 'font-bold' : ''}`}>
                {isMaxZoom 
                    ? t('map.zoom_limit') 
                    : (hasSignal ? t('map.signal_locked') : t('map.sector_scan_active'))
                }
              </span>
              {!hasSignal && !isMaxZoom && <AnimatedEllipsis />}
          </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
    return prevProps.messages === nextProps.messages && 
           prevProps.signals === nextProps.signals && 
           prevProps.lastNewMessage === nextProps.lastNewMessage &&
           prevProps.hasSignal === nextProps.hasSignal;
});

export default ChatMap;