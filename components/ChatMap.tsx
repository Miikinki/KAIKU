import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer, { HeatmapLayerRef } from './HeatmapLayer';
import { useTranslation } from 'react-i18next';

interface ChatMapProps {
  messages: ChatMessage[];
  signals: ChatMessage[]; 
  onViewportChange: (bounds: ViewportBounds) => void;
  onMapClick: () => void;
  lastNewMessage: ChatMessage | null;
  hasSignal: boolean;
  initialCenter?: { lat: number; lng: number }; 
}

// --- ANIMATED ELLIPSIS COMPONENT ---
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

// --- SONAR CLICK HANDLER (Map Events) ---
// Captures clicks on the map to trigger the Sonar Wave
const SonarController: React.FC<{ 
    onSonar: (lat: number, lng: number) => void,
    onMapClick: () => void
}> = ({ onSonar, onMapClick }) => {
    useMapEvents({
        click: (e) => {
            onSonar(e.latlng.lat, e.latlng.lng);
            onMapClick();
        }
    });
    return null;
};

// --- MAP CONTROLLER (Viewport Logic) ---
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

// --- SONAR VISUAL LAYER (SVG OVERLAY) ---
// Renders the expanding ring
interface ActivePing {
    id: number;
    lat: number;
    lng: number;
    startTime: number;
}
const SonarVisualLayer: React.FC<{ pings: ActivePing[] }> = ({ pings }) => {
    const map = useMap();
    const [frame, setFrame] = useState(0);

    // Re-render on map move to keep rings pinned
    useEffect(() => {
        const handler = () => setFrame(f => f + 1);
        map.on('move', handler);
        map.on('zoom', handler);
        return () => {
             map.off('move', handler);
             map.off('zoom', handler);
        };
    }, [map]);

    // Animation Loop for smooth expansion
    useEffect(() => {
        let raf: number;
        const loop = () => {
            setFrame(f => f + 1);
            raf = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(raf);
    }, []);

    if (pings.length === 0) return null;

    return (
        <svg 
            className="leaflet-zoom-hide pointer-events-none"
            style={{ 
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                zIndex: 450, overflow: 'visible' 
            }}
        >
            {pings.map(ping => {
                const elapsed = Date.now() - ping.startTime;
                if (elapsed > 2000) return null; // Hide after 2s

                const center = map.latLngToContainerPoint([ping.lat, ping.lng]);
                
                // Animation Params
                const radius = elapsed * 0.5; // Matches HEATMAP layer speed
                const opacity = 1 - (elapsed / 2000);
                
                return (
                    <circle 
                        key={ping.id}
                        cx={center.x}
                        cy={center.y}
                        r={radius}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth={2}
                        strokeOpacity={opacity * 0.5}
                    />
                );
            })}
        </svg>
    );
};

// --- MAIN CHAT MAP ---
const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, signals, onViewportChange, onMapClick, lastNewMessage, hasSignal, initialCenter }) => {
  const [zoom, setZoom] = useState(5);
  const { t } = useTranslation();
  
  // Sonar State
  const [pings, setPings] = useState<ActivePing[]>([]);
  const heatmapRef = useRef<HeatmapLayerRef>(null);

  const startPosition = initialCenter ? [initialCenter.lat, initialCenter.lng] : [60.1, 24.9];
  const startZoom = initialCenter ? 8 : 4; 

  const isMaxZoom = zoom >= 12;

  const handleSonar = useCallback((lat: number, lng: number) => {
      // 1. Add Visual Ring
      setPings(prev => {
          const now = Date.now();
          // Filter old pings
          const next = prev.filter(p => now - p.startTime < 2000);
          next.push({ id: Math.random(), lat, lng, startTime: now });
          return next;
      });

      // 2. Trigger Heatmap Reaction
      if (heatmapRef.current) {
          heatmapRef.current.ping(lat, lng);
      }
  }, []);

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12] w-full h-full">
      <MapContainer
        // @ts-ignore
        center={startPosition} 
        zoom={startZoom}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }}
        minZoom={4}
        maxZoom={12.5}
        zoomSnap={0.5} 
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
        
        <SonarController onSonar={handleSonar} onMapClick={onMapClick} />

        {/* Visual Layers */}
        <SonarVisualLayer pings={pings} />
        <ArcLayer messages={signals} />
        <HeatmapLayer ref={heatmapRef} messages={messages} />
        
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