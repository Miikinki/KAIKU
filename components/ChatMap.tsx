import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert, X } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer, { HeatmapLayerRef } from './HeatmapLayer';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';

interface ChatMapProps {
  messages: ChatMessage[];
  signals: ChatMessage[]; 
  onViewportChange: (bounds: ViewportBounds) => void;
  onMapClick: () => void;
  lastNewMessage: ChatMessage | null;
  hasSignal: boolean;
  initialCenter?: { lat: number; lng: number };
  flyToLocation: { lat: number; lng: number; timestamp: number } | null; 
  focusedMessage: ChatMessage | null;
  onOpenThread: (msg: ChatMessage) => void;
  onClosePopup: () => void;
  hiddenIds: Set<string>;
  getUserLocation: () => Promise<{lat: number, lng: number}>;
}

// --- DYNAMIC MARKER ICON GENERATOR ---
const getMarkerIcon = (msg: ChatMessage) => {
    // Logic: Pulse ONLY if fresh (< 15m) or hot (score > 20)
    // This reduces CSS animation load significantly.
    const ageMins = (Date.now() - msg.timestamp) / 60000;
    const isFresh = ageMins < 15;
    const isHot = msg.score > 20;
    const shouldPulse = isFresh || isHot;
    
    // Default to false if property missing
    const isMasked = msg.isMasked || false; 

    let html = '';

    if (isMasked) {
         // MASKED: Hollow Circle
         // Visual: 16px, Cyan Border, Transparent BG
         html = `
            <div class="relative w-4 h-4 flex items-center justify-center">
                ${shouldPulse ? `<div class="absolute inset-0 rounded-full border border-cyan-400 animate-ping opacity-50"></div>` : ''}
                <div class="relative w-4 h-4 rounded-full border-2 border-cyan-400 bg-black/20 box-border shadow-[0_0_2px_#06b6d4]"></div>
            </div>
         `;
    } else {
         // EXACT: Solid Diamond
         // Visual: 12px, Cyan Fill, Rotated 45deg
         html = `
            <div class="relative w-3 h-3 flex items-center justify-center">
                ${shouldPulse ? `<div class="absolute inset-0 bg-cyan-400 rotate-45 animate-ping opacity-75"></div>` : ''}
                <div class="relative w-3 h-3 bg-[#00f0ff] transform rotate-45 border border-black/40 shadow-[0_0_5px_#00f0ff]"></div>
            </div>
         `;
    }

    return L.divIcon({
        className: 'custom-marker-container', // Empty class used to remove Leaflet defaults via CSS if needed
        html: html,
        iconSize: isMasked ? [16, 16] : [12, 12],
        iconAnchor: isMasked ? [8, 8] : [6, 6],
        popupAnchor: [0, -10]
    });
};

// --- MAP FLY TO CONTROLLER (MESSAGE) ---
const MessageFlyTo: React.FC<{ target: ChatMessage | null }> = ({ target }) => {
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

// --- COORDINATE FLY TO CONTROLLER (AUTO-CORRECT & EXTERNAL LOCATE) ---
const CoordinateFlyTo: React.FC<{ target: { lat: number, lng: number, timestamp: number } | null }> = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyTo([target.lat, target.lng], 14, {
                animate: true,
                duration: 2.0, // Cinematic fly-in
                easeLinearity: 0.2
            });
        }
    }, [target?.timestamp, map]); // Dependent on timestamp to force re-fly
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

// --- MAP EVENTS HANDLER ---
const MapEventsHandler: React.FC<{ 
    onMapClick: () => void
}> = ({ onMapClick }) => {
    useMapEvents({
        click: () => {
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
    },
    zoom: () => {
        setZoom(map.getZoom());
    }
  });

  return null;
};

// --- MAIN CHAT MAP ---
const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, signals, onViewportChange, onMapClick, lastNewMessage, hasSignal, initialCenter, flyToLocation, focusedMessage, onOpenThread, onClosePopup, hiddenIds, getUserLocation }) => {
  const [zoom, setZoom] = useState(3.5);
  const { t } = useTranslation();
  
  const heatmapRef = useRef<HeatmapLayerRef>(null);

  // START WIDE: Center on general Europe/Global view roughly, Zoom 3.5
  const startPosition: [number, number] = [52.0, 10.0]; 
  const startZoom = 3.5; 

  const isMaxZoom = zoom >= 12;

  // Radar Scaling Logic
  const getRadarScale = (currentZoom: number) => {
    // Street level (13+): Full Scale
    if (currentZoom >= 13) return 1.0;
    // Country level (7-): Small Scale
    if (currentZoom <= 7) return 0.4;
    // Interpolate
    return 0.4 + ((currentZoom - 7) / (13 - 7)) * (1.0 - 0.4);
  };

  const baseScale = getRadarScale(zoom);
  const pulseMultiplier = isMaxZoom ? 1.1 : (hasSignal ? 1.05 : 1.0);
  const totalScale = baseScale * pulseMultiplier;

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
        minZoom={3}
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

        <MessageFlyTo target={focusedMessage} />
        <CoordinateFlyTo target={flyToLocation} />
        
        <MapEventsHandler onMapClick={onMapClick} />
        
        {/* Messages as Markers */}
        {messages.map(msg => (
            <Marker 
                key={msg.id}
                position={[msg.location.lat, msg.location.lng]} 
                icon={getMarkerIcon(msg)} // Use dynamic icon
                ref={(ref) => {
                    // Auto-open if this is the focused message
                    if (ref && focusedMessage?.id === msg.id) {
                        setTimeout(() => ref.openPopup(), 600); 
                    }
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

                        <div onClick={() => !hiddenIds.has(msg.id) && onOpenThread(msg)} className="cursor-pointer group mt-1">
                            <div className="flex items-center justify-between mb-2 pr-6">
                                <span className="text-[10px] text-cyan-400 font-mono font-bold tracking-wider flex items-center gap-1">
                                    <Crosshair size={10} /> {msg.isMasked ? 'MASKED' : 'EXACT'}
                                </span>
                                <span className="text-[10px] text-gray-500 font-mono">
                                    {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </div>
                            
                            {hiddenIds.has(msg.id) ? (
                                <p className="text-sm text-gray-500 italic leading-relaxed mb-3 font-light border-l-2 border-gray-500/30 pl-2">
                                    ** CONTENT HIDDEN **
                                </p>
                            ) : (
                                <p className="text-sm text-gray-200 leading-relaxed line-clamp-3 mb-3 font-light border-l-2 border-cyan-500/30 pl-2 group-hover:border-cyan-400 transition-colors">
                                    {msg.text}
                                </p>
                            )}
                            
                            {!hiddenIds.has(msg.id) && (
                                <div className="text-center py-1.5 bg-white/5 rounded text-[10px] text-cyan-400 font-bold tracking-widest group-hover:bg-cyan-500 group-hover:text-black transition-all">
                                    OPEN CHANNEL
                                </div>
                            )}
                        </div>
                    </div>
                </Popup>
            </Marker>
        ))}

        {/* Visual Layers */}
        <ArcLayer messages={signals} />
        <HeatmapLayer ref={heatmapRef} messages={messages} />
        
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 z-[400] flex flex-col items-center justify-center pb-48">
          
          <div className="relative flex items-center justify-center transition-all duration-200">
              {/* HYBRID RADAR SWEEP ANIMATION */}
              <div 
                   className="absolute flex items-center justify-center w-64 h-64 rounded-full ease-out"
                   style={{ 
                       transform: `scale(${totalScale})`,
                       opacity: isMaxZoom || hasSignal ? 1 : 0.6,
                       transition: 'transform 0.2s ease-out, opacity 0.5s ease-out'
                   }}
              >
                   {/* Layer 2: Rotating Sweep (The Radar Trail) - KEPT ACTIVE */}
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
           prevProps.getUserLocation === nextProps.getUserLocation &&
           prevProps.flyToLocation === nextProps.flyToLocation; 
});

export default ChatMap;