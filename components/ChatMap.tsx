import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert, X } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer, { HeatmapLayerRef } from './HeatmapLayer';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
// @ts-ignore
import useSupercluster from 'use-supercluster';

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
  userLocation: { lat: number, lng: number } | null;
}

// --- DYNAMIC MARKER ICON GENERATOR (Single Message) ---
const getMarkerIcon = (msg: ChatMessage) => {
    const ageMins = (Date.now() - msg.timestamp) / 60000;
    const shouldPulse = ageMins < 15;
    const isMasked = msg.isMasked || false;

    const iconSize = isMasked ? 18 : 22;
    const containerSize = 40;

    const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" 
            fill="${isMasked ? 'none' : 'currentColor'}" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round"
        >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
    `;

    const visualClasses = isMasked 
        ? 'opacity-60' 
        : 'drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]';

    const html = `
        <div class="relative w-full h-full flex items-center justify-center">
            ${shouldPulse ? `<div class="absolute w-8 h-8 bg-cyan-400/30 rounded-full animate-ping"></div>` : ''}
            <div class="relative z-10 text-cyan-400 ${visualClasses} transition-all duration-300">
                ${svgContent}
            </div>
        </div>
    `;

    return L.divIcon({
        className: 'bg-transparent border-none',
        html: html,
        iconSize: [containerSize, containerSize],
        iconAnchor: [containerSize / 2, containerSize / 2],
        popupAnchor: [0, -10]
    });
};

// --- CLUSTER ICON GENERATOR ---
const getClusterIcon = (count: number) => {
    // Size logic: min 30px, max 60px
    const size = 30 + (count / 100) * 30;
    const finalSize = Math.min(size, 60);
    const isLarge = count > 10;
    
    return L.divIcon({
        html: `<div class="kaiku-cluster ${isLarge ? 'kaiku-cluster-large' : ''}" style="width: ${finalSize}px; height: ${finalSize}px;">${count}</div>`,
        className: 'bg-transparent border-none', // Leaflet container transparent
        iconSize: [finalSize, finalSize],
        iconAnchor: [finalSize / 2, finalSize / 2]
    });
};

const UserLocationMarker = ({ position }: { position: { lat: number, lng: number } }) => {
    const icon = L.divIcon({
        className: 'bg-transparent border-none',
        html: `
            <div class="relative w-6 h-6 flex items-center justify-center">
                <div class="absolute w-6 h-6 bg-blue-500/30 rounded-full animate-ping"></div>
                <div class="relative w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-lg"></div>
            </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    return <Marker position={[position.lat, position.lng]} icon={icon} zIndexOffset={1000} />;
};

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

const CoordinateFlyTo: React.FC<{ target: { lat: number, lng: number, timestamp: number } | null }> = ({ target }) => {
    const map = useMap();
    useEffect(() => {
        if (target) {
            map.flyTo([target.lat, target.lng], 16.5, {
                animate: true,
                duration: 2.0,
                easeLinearity: 0.2
            });
        }
    }, [target?.timestamp, map]);
    return null;
};

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

const MapController: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    setZoom: (z: number) => void,
    setBounds: (b: [number, number, number, number] | null) => void // Format: [W, S, E, N]
}> = ({ onViewportChange, setZoom, setBounds }) => {
  
  const map = useMap();
  const lastUpdateRef = useRef(0);

  const updateBounds = useCallback(() => {
      const b = map.getBounds();
      // Leaflet: West, South, East, North
      // Supercluster: [West, South, East, North]
      setBounds([
          b.getWest(),
          b.getSouth(),
          b.getEast(),
          b.getNorth()
      ]);
  }, [map, setBounds]);

  // Initial Sync
  useEffect(() => {
      updateBounds();
  }, []);

  useEffect(() => {
      const invalidate = () => {
          map.invalidateSize({ animate: false });
      };
      
      invalidate();
      
      const timer = setTimeout(invalidate, 300);
      window.addEventListener('resize', invalidate);

      const container = map.getContainer();
      const resizeObserver = new ResizeObserver(() => {
          invalidate();
      });
      resizeObserver.observe(container);

      return () => {
          clearTimeout(timer);
          window.removeEventListener('resize', invalidate);
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
      updateBounds();
      
      onViewportChange({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
          zoom: z,
          center: { lat: center.lat, lng: center.lng },
          sectorCenter: { lat: sectorLatLng.lat, lng: sectorLatLng.lng }
      });
  }, [map, onViewportChange, setZoom, updateBounds]);

  useMapEvents({
    move: () => {
        const now = Date.now();
        if (now - lastUpdateRef.current > 100) { 
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
const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, signals, onViewportChange, onMapClick, lastNewMessage, hasSignal, initialCenter, flyToLocation, focusedMessage, onOpenThread, onClosePopup, hiddenIds, getUserLocation, userLocation }) => {
  const [zoom, setZoom] = useState(3.5);
  // Bounds for Supercluster: [West, South, East, North]
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  
  const { t } = useTranslation();
  const mapRef = useRef<L.Map | null>(null);
  const heatmapRef = useRef<HeatmapLayerRef>(null);

  const startPosition: [number, number] = [52.0, 10.0]; 
  const startZoom = 3.5; 

  const isMaxZoom = zoom >= 12;

  const getRadarScale = (currentZoom: number) => {
    if (currentZoom >= 13) return 1.0;
    if (currentZoom <= 7) return 0.4;
    return 0.4 + ((currentZoom - 7) / (13 - 7)) * (1.0 - 0.4);
  };

  const baseScale = getRadarScale(zoom);
  const pulseMultiplier = isMaxZoom ? 1.1 : (hasSignal ? 1.05 : 1.0);
  const totalScale = baseScale * pulseMultiplier;

  // 1. Prepare Points for Supercluster (GeoJSON format)
  const points = useMemo(() => {
      return messages.map(msg => ({
          type: 'Feature',
          properties: { cluster: false, messageId: msg.id, ...msg },
          geometry: {
              type: 'Point',
              coordinates: [msg.location.lng, msg.location.lat]
          }
      }));
  }, [messages]);

  // 2. Use Supercluster Hook
  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: bounds ? bounds : [-180, -90, 180, 90],
    zoom: zoom,
    options: { radius: 60, maxZoom: 14 } // Radius in pixels for clustering
  });

  // Handle clicking a cluster to expand
  const handleClusterClick = useCallback((id: number, lat: number, lng: number) => {
      const expansionZoom = Math.min(
          supercluster.getClusterExpansionZoom(id),
          16
      );
      mapRef.current?.flyTo([lat, lng], expansionZoom, {
          animate: true,
          duration: 1
      });
  }, [supercluster]);

  return (
    // FORCE FULL-SCREEN CSS for KAIKU BACKGROUND LAYER
    <div className="absolute inset-0 w-full h-full z-0 bg-[#0a0a12] overflow-hidden">
      <MapContainer
        // @ts-ignore
        center={startPosition} 
        zoom={startZoom}
        scrollWheelZoom={true}
        doubleClickZoom={false} 
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full outline-none"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }} 
        minZoom={3}
        maxZoom={16} // Allow deeper zoom for clusters to break
        zoomSnap={0.5} 
        maxBounds={[[-90, -220], [90, 220]]} 
        preferCanvas={true}
        worldCopyJump={false} 
        ref={mapRef}
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={true}
          opacity={0.8}
          keepBuffer={4}
        />

        <MapController 
            onViewportChange={onViewportChange}
            setZoom={setZoom}
            setBounds={setBounds}
        />

        <MessageFlyTo target={focusedMessage} />
        <CoordinateFlyTo target={flyToLocation} />
        
        <MapEventsHandler onMapClick={onMapClick} />

        {userLocation && <UserLocationMarker position={userLocation} />}
        
        {/* RENDER CLUSTERS & MARKERS */}
        {clusters.map((cluster) => {
            const [longitude, latitude] = cluster.geometry.coordinates;
            const { cluster: isCluster, point_count: pointCount } = cluster.properties;

            // CASE 1: IT IS A CLUSTER (Group of points)
            if (isCluster) {
                return (
                    <Marker
                        key={`cluster-${cluster.id}`}
                        position={[latitude, longitude]}
                        icon={getClusterIcon(pointCount)}
                        eventHandlers={{
                            click: (e) => {
                                e.originalEvent.stopPropagation();
                                handleClusterClick(cluster.id, latitude, longitude);
                            }
                        }}
                    />
                );
            }

            // CASE 2: IT IS A SINGLE MESSAGE MARKER
            // Extract the original message data we stashed in 'properties'
            const msg = cluster.properties as ChatMessage;

            return (
                <Marker 
                    key={msg.id}
                    position={[msg.location.lat, msg.location.lng]} 
                    icon={getMarkerIcon(msg)}
                    ref={(ref) => {
                        if (ref && focusedMessage?.id === msg.id) {
                            setTimeout(() => ref.openPopup(), 600); 
                        }
                    }}
                >
                    <Popup className="kaiku-custom-popup" closeButton={false} offset={[0, -4]}>
                        <div className="p-3 relative">
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
            );
        })}

        <ArcLayer messages={signals} />
        <HeatmapLayer ref={heatmapRef} messages={messages} />
        
      </MapContainer>

      {/* OVERLAY CONTAINER - RADAR */}
      <div className="pointer-events-none absolute inset-0 z-[400] flex flex-col items-center justify-center pb-48">
          
          <div 
            className="relative flex items-center justify-center transition-all duration-200" 
            style={{ 
                transform: 'translate3d(0,0,0)', 
                willChange: 'transform'
            }}
          >
              
              {/* REPLACED CSS RADAR WITH SVG RADAR (Retained from previous fix) */}
              <div 
                   className="absolute w-64 h-64"
                   style={{ 
                       transform: `scale(${totalScale})`,
                       opacity: isMaxZoom || hasSignal ? 1 : 0.6,
                       transition: 'transform 0.2s ease-out, opacity 0.5s ease-out'
                   }}
              >
                  {/* SVG Sweep - Replaces Conic Gradient */}
                  <svg 
                    viewBox="0 0 100 100" 
                    className="absolute inset-0 w-full h-full animate-[spin_4s_linear_infinite]"
                  >
                    <defs>
                        <linearGradient id="sweepGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={isMaxZoom ? "#ef4444" : "#22d3ee"} stopOpacity="0" />
                            <stop offset="50%" stopColor={isMaxZoom ? "#ef4444" : "#22d3ee"} stopOpacity="0.1" />
                            <stop offset="100%" stopColor={isMaxZoom ? "#ef4444" : "#22d3ee"} stopOpacity="0.4" />
                        </linearGradient>
                    </defs>
                    {/* A wedge shape for the radar sweep */}
                    <path 
                        d="M50 50 L50 0 A50 50 0 0 1 100 50 Z" 
                        fill="url(#sweepGradient)"
                    />
                  </svg>
                  
                  {/* Outer Rings (SVG) */}
                  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
                      <circle cx="50" cy="50" r="48" 
                          fill="none" 
                          stroke={isMaxZoom ? "#ef4444" : "#22d3ee"} 
                          strokeWidth="0.5" 
                          strokeOpacity="0.3"
                          strokeDasharray="4 2"
                      />
                      <circle cx="50" cy="50" r="35" 
                          fill="none" 
                          stroke={isMaxZoom ? "#ef4444" : "#22d3ee"} 
                          strokeWidth="0.2" 
                          strokeOpacity="0.2"
                      />
                  </svg>

                  {/* Decorative Inner Ring */}
                  <div 
                    className={`absolute inset-[25%] rounded-full border border-dashed opacity-30 animate-[spin_10s_linear_infinite_reverse] ${isMaxZoom ? 'border-red-500' : 'border-cyan-400'}`}
                  />
              </div>

              {/* Icon Center - Independent of Scale */}
              <div className={`transition-all duration-300 z-10 
                  ${isMaxZoom 
                      ? 'text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,1)] scale-125' 
                      : (hasSignal ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.9)] scale-110' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]')
                  }`}>
                  {isMaxZoom ? <ShieldAlert size={32} strokeWidth={2} /> : (hasSignal ? <Lock size={32} strokeWidth={2} /> : <Crosshair size={32} strokeWidth={1.5} />)}
              </div>
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
           prevProps.userLocation === nextProps.userLocation &&
           prevProps.flyToLocation === nextProps.flyToLocation; 
});

export default ChatMap;