import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert, X, Locate } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer, { HeatmapLayerRef } from './HeatmapLayer';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { triggerHaptic } from '../services/hapticService';

interface ChatMapProps {
  messages: ChatMessage[];
  signals: ChatMessage[]; 
  onViewportChange: (bounds: ViewportBounds) => void;
  onMapClick: () => void;
  lastNewMessage: ChatMessage | null;
  hasSignal: boolean;
  initialCenter?: { lat: number; lng: number };
  focusedMessage: ChatMessage | null;
  onOpenThread: (msg: ChatMessage) => void;
  onClosePopup: () => void;
  hiddenIds: Set<string>;
  getUserLocation: () => Promise<{lat: number, lng: number}>;
}

// --- CUSTOM PIN ICON ---
const customPinIcon = L.divIcon({
    className: 'custom-pin',
    html: `<div class="relative w-4 h-4">
            <div class="absolute inset-0 bg-cyan-400 rounded-full animate-ping opacity-75"></div>
            <div class="relative w-4 h-4 bg-cyan-500 rounded-full border-2 border-white shadow-[0_0_15px_#06b6d4]"></div>
           </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8], // Center
    popupAnchor: [0, -10]
});

// --- LOCATE USER CONTROL ---
const LocateControl = ({ getUserLocation }: { getUserLocation: () => Promise<{lat: number, lng: number}> }) => {
    const map = useMap();
    const [isLocating, setIsLocating] = useState(false);

    const handleLocate = async (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault(); 
        setIsLocating(true);
        triggerHaptic('light');
        try {
            const loc = await getUserLocation();
            map.flyTo([loc.lat, loc.lng], 14, {
                animate: true,
                duration: 1.5,
                easeLinearity: 0.25
            });
        } catch (error) {
            console.warn("Locate failed", error);
        } finally {
            setIsLocating(false);
        }
    };

    return (
        <div className="absolute bottom-28 right-4 z-[400] pointer-events-auto">
            <button
                onClick={handleLocate}
                className={`
                    flex items-center justify-center w-12 h-12 
                    bg-[#0a0a12]/80 backdrop-blur-md 
                    border border-cyan-500/50 rounded-full 
                    shadow-[0_0_15px_rgba(6,182,212,0.4)] 
                    text-cyan-400 hover:bg-cyan-950/50 hover:text-white transition-all
                    active:scale-95 group
                    ${isLocating ? 'animate-pulse' : ''}
                `}
                title="Locate Me"
            >
                <Locate size={24} className="group-hover:rotate-45 transition-transform duration-500" />
            </button>
        </div>
    );
};

// --- MAP FLY TO CONTROLLER ---
const MapFlyTo: React.FC<{ target: ChatMessage | null }> = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyTo([target.location.lat, target.location.lng], 14, {
                animate: true,
                duration: 1.5,
                easeLinearity: 0.25
            });
        }
    }, [target, map]);
    return null;
};

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
      const z = map.getSize().x > 0 ? map.getZoom() : 0;
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
const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, signals, onViewportChange, onMapClick, lastNewMessage, hasSignal, initialCenter, focusedMessage, onOpenThread, onClosePopup, hiddenIds, getUserLocation }) => {
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
        doubleClickZoom={false} 
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

        <MapFlyTo target={focusedMessage} />
        
        <SonarController onSonar={handleSonar} onMapClick={onMapClick} />
        
        <LocateControl getUserLocation={getUserLocation} />

        {/* Focused Message Marker */}
        {focusedMessage && (
            <Marker 
                key={focusedMessage.id}
                position={[focusedMessage.location.lat, focusedMessage.location.lng]} 
                icon={customPinIcon}
                ref={(ref) => {
                    if (ref) setTimeout(() => ref.openPopup(), 600); 
                }}
            >
                <Popup className="kaiku-custom-popup" closeButton={false} offset={[0, -4]}>
                    <div className="p-3 relative">
                        {/* CLOSE BUTTON */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onClosePopup();
                            }}
                            className="absolute top-2 right-2 p-1 text-gray-500 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors z-50"
                        >
                            <X size={14} />
                        </button>

                        <div onClick={() => !hiddenIds.has(focusedMessage.id) && onOpenThread(focusedMessage)} className="cursor-pointer group mt-1">
                            <div className="flex items-center justify-between mb-2 pr-6">
                                <span className="text-[10px] text-cyan-400 font-mono font-bold tracking-wider flex items-center gap-1">
                                    <Crosshair size={10} /> TARGET
                                </span>
                                <span className="text-[10px] text-gray-500 font-mono">
                                    {new Date(focusedMessage.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </div>
                            
                            {hiddenIds.has(focusedMessage.id) ? (
                                <p className="text-sm text-gray-500 italic leading-relaxed mb-3 font-light border-l-2 border-gray-500/30 pl-2">
                                    ** CONTENT HIDDEN **
                                </p>
                            ) : (
                                <p className="text-sm text-gray-200 leading-relaxed line-clamp-3 mb-3 font-light border-l-2 border-cyan-500/30 pl-2 group-hover:border-cyan-400 transition-colors">
                                    {focusedMessage.text}
                                </p>
                            )}
                            
                            {!hiddenIds.has(focusedMessage.id) && (
                                <div className="text-center py-1.5 bg-white/5 rounded text-[10px] text-cyan-400 font-bold tracking-widest group-hover:bg-cyan-500 group-hover:text-black transition-all">
                                    OPEN CHANNEL
                                </div>
                            )}
                        </div>
                    </div>
                </Popup>
            </Marker>
        )}

        {/* Visual Layers */}
        <SonarVisualLayer pings={pings} />
        <ArcLayer messages={signals} />
        <HeatmapLayer ref={heatmapRef} messages={messages} />
        
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 z-[400] flex flex-col items-center justify-center pb-48">
          
          <div className="relative flex items-center justify-center transition-all duration-200">
              {/* HYBRID RADAR SWEEP ANIMATION */}
              <div className={`absolute flex items-center justify-center w-64 h-64 rounded-full transition-all duration-500 ease-out 
                  ${isMaxZoom ? 'opacity-100 scale-110' : (hasSignal ? 'opacity-100 scale-105' : 'opacity-60 scale-100')}
              `}>
                   {/* Layer 1: Sonar Pulse (The Ripple) */}
                   <div className={`absolute inset-0 border border-cyan-500/40 rounded-full animate-[ping_3s_linear_infinite] 
                       ${isMaxZoom ? 'border-red-500/40' : ''}`} 
                   />
                   
                   {/* Layer 2: Rotating Sweep (The Radar Trail) */}
                   <div 
                       className="absolute inset-0 rounded-full animate-[spin_4s_linear_infinite]"
                       style={{ 
                           background: isMaxZoom
                            ? `conic-gradient(from 0deg, transparent 0deg, transparent 240deg, rgba(239, 68, 68, 0.4) 360deg)`
                            : `conic-gradient(from 0deg, transparent 0deg, transparent 240deg, rgba(6, 182, 212, 0.3) 360deg)`
                       }} 
                   />

                   {/* Static Rim for definition */}
                   <div className={`absolute inset-0 border border-white/10 rounded-full ${isMaxZoom ? 'border-red-500/30' : 'border-cyan-500/30'}`} />

                   {/* Inner decorative ring */}
                   <div className={`absolute inset-[25%] border border-dashed rounded-full animate-[spin_10s_linear_infinite_reverse] opacity-30 
                       ${isMaxZoom ? 'border-red-500' : 'border-cyan-500'}`} 
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
           prevProps.hasSignal === nextProps.hasSignal &&
           prevProps.focusedMessage === nextProps.focusedMessage &&
           prevProps.hiddenIds === nextProps.hiddenIds &&
           prevProps.getUserLocation === nextProps.getUserLocation;
});

export default ChatMap;