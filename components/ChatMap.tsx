import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION, AVATAR_ICONS } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer from './HeatmapLayer';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
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
  flyToLocation: { lat: number; lng: number; timestamp: number, bounds?: [number, number, number, number] } | null; 
  focusedMessage: ChatMessage | null;
  onOpenThread: (msg: ChatMessage) => void;
  onClosePopup: () => void;
  hiddenIds: Set<string>;
  getUserLocation: () => Promise<{lat: number, lng: number}>;
  userLocation: { lat: number, lng: number } | null;
  scannerStatus?: string | null;
  scannerCity?: string | null;
}

// Määritellään maailman rajat estämään Leafletin "3x" maailman toisto ja tyhjät alueet
const WORLD_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));

const isNewsPost = (msg: ChatMessage) => msg.postType === 'GLOBAL_EVENT' || msg.postType === 'SCAN_RESULT';

const getMarkerIcon = (msg: ChatMessage) => {
    const isMasked = msg.isMasked || false;
    const isNews = isNewsPost(msg);
    const containerSize = isNews ? 50 : 40; 

    // DEFAULT COLORS (Fallback)
    let color = isNews ? '#ef4444' : '#22d3ee';
    
    // OVERRIDE WITH USER COLOR IF SET
    if (msg.userColor) {
        color = msg.userColor;
    }

    const glow = isNews ? 'rgba(239,68,68,0.8)' : `${color}E6`; // Hex alpha for glow

    // ICON SELECTION
    let svgPath = `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`; // Default Bolt
    let viewBox = "0 0 24 24";
    let strokeWidth = "2";
    let fill = isMasked && !isNews ? 'none' : 'currentColor';

    if (isNews) {
        // Alert Triangle
        svgPath = `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    } else if (msg.userAvatar && AVATAR_ICONS[msg.userAvatar]) {
        // USER AVATAR
        svgPath = `<path d="${AVATAR_ICONS[msg.userAvatar]}" />`;
        fill = "none"; // Avatars are line-art usually
        strokeWidth = "2.5";
    }

    const html = `
        <div class="relative w-full h-full flex items-center justify-center">
            <div class="absolute inset-0 rounded-full animate-ping opacity-20" style="background-color: ${color}"></div>
            <div class="relative z-10 transition-all duration-300 flex items-center justify-center" style="color: ${color}; filter: drop-shadow(0 0 8px ${glow})">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${viewBox}" fill="${fill}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
                    ${svgPath}
                </svg>
            </div>
        </div>
    `;

    return L.divIcon({
        className: 'bg-transparent border-none',
        html,
        iconSize: [containerSize, containerSize],
        iconAnchor: [containerSize / 2, containerSize / 2],
        popupAnchor: [0, -10]
    });
};

const getClusterIcon = (count: number) => {
    const size = 35 + Math.min(count / 10, 25);
    return L.divIcon({
        html: `<div class="kaiku-cluster" style="width: ${size}px; height: ${size}px; line-height: ${size}px;">${count}</div>`,
        className: '', 
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
};

interface MessageMarkerProps {
    msg: ChatMessage;
    position: [number, number];
    isHidden: boolean;
    onOpenThread: (msg: ChatMessage) => void;
    mapInstance: L.Map | null;
}

const MessageMarker: React.FC<MessageMarkerProps> = ({ msg, position, isHidden, onOpenThread, mapInstance }) => {
    const { t } = useTranslation();
    const isNews = isNewsPost(msg);
    // Include userAvatar/Color in dependency array to refresh markers on profile update
    const icon = useMemo(() => getMarkerIcon(msg), [msg.id, msg.isMasked, msg.postType, msg.userAvatar, msg.userColor]);

    const displayName = msg.userDisplayName || (isNews ? 'SYSTEM' : 'ANONYMOUS');

    return (
        <Marker position={position} icon={icon} zIndexOffset={isNews ? 2000 : 0}>
            <Popup className="kaiku-custom-popup" closeButton={false} offset={[0, -10]}>
                <div className="p-3">
                    <div className="flex justify-between items-center mb-2">
                         <span 
                            className="text-[10px] font-mono font-bold uppercase tracking-wider" 
                            style={{ color: isNews ? '#ef4444' : (msg.userColor || '#22d3ee') }}
                        >
                            {isNews ? 'SYSTEM ALERT' : displayName}
                         </span>
                    </div>
                    <p className="text-xs text-gray-200 mb-3 line-clamp-3 leading-relaxed">
                        {isHidden ? t('map.content_hidden') : msg.text.split('\n\n')[0]}
                    </p>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onOpenThread(msg); mapInstance?.closePopup(); }}
                        className={`w-full py-2 rounded text-[10px] font-black tracking-widest text-black`}
                        style={{ backgroundColor: isNews ? '#ef4444' : (msg.userColor || '#06b6d4') }}
                    >
                        {t('map.open_channel')}
                    </button>
                </div>
            </Popup>
        </Marker>
    );
};

const MapController: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    setZoom: (z: number) => void,
    setBounds: (b: [number, number, number, number] | null) => void,
    onMapClick: () => void,
    flyToLocation: any,
    focusedMessage: any
}> = ({ onViewportChange, setZoom, setBounds, onMapClick, flyToLocation, focusedMessage }) => {
  const map = useMap();
  
  useEffect(() => {
    const fix = () => map.invalidateSize();
    fix();
    const t1 = setTimeout(fix, 100);
    const t2 = setTimeout(fix, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);

  const handleUpdate = useCallback(() => {
      const b = map.getBounds();
      const center = map.getCenter();
      onViewportChange({
          north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest(),
          zoom: map.getZoom(), center: { lat: center.lat, lng: center.lng }, sectorCenter: { lat: center.lat, lng: center.lng }
      });
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
  }, [map, onViewportChange, setZoom, setBounds]);

  useMapEvents({
    moveend: handleUpdate,
    zoomend: handleUpdate,
    click: onMapClick
  });

  useEffect(() => {
    if (flyToLocation) {
        if (flyToLocation.bounds) {
             const [s, n, w, e] = flyToLocation.bounds;
             map.fitBounds([[s, w], [n, e]], { padding: [50, 50], animate: true });
        } else {
             map.flyTo([flyToLocation.lat, flyToLocation.lng], 13, { animate: true });
        }
    }
  }, [flyToLocation?.timestamp, map]);

  useEffect(() => {
    if (focusedMessage) {
        map.flyTo([focusedMessage.location.lat, focusedMessage.location.lng], 16, { animate: true });
    }
  }, [focusedMessage?.id, map]);

  return null;
};

const ChatMap: React.FC<ChatMapProps> = (props) => {
  const { messages, signals, onViewportChange, onMapClick, hasSignal, initialCenter, flyToLocation, focusedMessage, onOpenThread, hiddenIds, userLocation, scannerStatus, scannerCity } = props;
  
  const [zoom, setZoom] = useState(3);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // SPLIT LOGIC: News (Pins) vs Chats (Heatmap/Clusters)
  const newsMessages = useMemo(() => messages.filter(m => isNewsPost(m)), [messages]);
  const chatMessages = useMemo(() => messages.filter(m => !isNewsPost(m)), [messages]);

  // Points for Supercluster
  const points = useMemo(() => {
      const p: any[] = [];
      
      // 1. News always included in cluster logic (so they form clusters at low zoom)
      newsMessages.forEach(msg => {
          p.push({
              type: 'Feature', 
              properties: { cluster: false, messageId: msg.id, message: msg, isNews: true },
              geometry: { type: 'Point', coordinates: [msg.location.lng, msg.location.lat] }
          });
      });

      // 2. Chats only included if Zoom < 13 (Cluster View)
      // At Zoom 13+, they become "Fog" via HeatmapLayer
      if (zoom < 13) {
          chatMessages.forEach(msg => {
              p.push({
                  type: 'Feature', 
                  properties: { cluster: false, messageId: msg.id, message: msg, isNews: false },
                  geometry: { type: 'Point', coordinates: [msg.location.lng, msg.location.lat] }
              });
          });
      }

      return p;
  }, [newsMessages, chatMessages, zoom]);

  const { clusters, supercluster } = useSupercluster({
    points, bounds: bounds || [-180, -90, 180, 90], zoom, options: { radius: 60, maxZoom: 20 } 
  });

  // Heatmap Data: Chats only, and only when zoomed in (Zoom >= 13)
  const heatmapMessages = zoom >= 13 ? chatMessages : [];

  const isMaxZoom = zoom >= 17;
  const radarScale = isMaxZoom ? 1.0 : (zoom <= 7 ? 0.4 : 0.4 + ((zoom - 7) / (13 - 7)) * 0.6);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#0a0a12] overflow-hidden">
      <MapContainer
        center={initialCenter ? [initialCenter.lat, initialCenter.lng] : [20.0, 0.0]} 
        zoom={3}
        minZoom={2}
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
        scrollWheelZoom={true} 
        zoomControl={false} 
        attributionControl={false}
        className="w-full h-full absolute inset-0"
        style={{ background: '#0a0a12' }} 
        ref={mapRef}
      >
        <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} noWrap={true} bounds={WORLD_BOUNDS} />
        
        <MapController 
            onViewportChange={onViewportChange} 
            setZoom={setZoom} 
            setBounds={setBounds} 
            onMapClick={onMapClick} 
            flyToLocation={flyToLocation}
            focusedMessage={focusedMessage}
        />
        
        {/* Render Clusters & Markers */}
        {clusters.map((cluster: any) => {
            const [longitude, latitude] = cluster.geometry.coordinates;
            const { cluster: isCluster, point_count: pointCount } = cluster.properties;
            
            if (isCluster) {
                return (
                    <Marker 
                        key={`cluster-${cluster.id}`} 
                        position={[latitude, longitude]} 
                        icon={getClusterIcon(pointCount)} 
                        eventHandlers={{ click: () => { 
                            const expansionZoom = supercluster.getClusterExpansionZoom(cluster.id);
                            mapRef.current?.setView([latitude, longitude], expansionZoom);
                        }}} 
                    />
                );
            }

            // Single Marker (Leaf)
            const msg = cluster.properties.message;
            // Check visibility again just in case, though point array logic handles it mostly
            return <MessageMarker key={msg.id} msg={msg} position={[latitude, longitude]} isHidden={hiddenIds.has(msg.id)} onOpenThread={onOpenThread} mapInstance={mapRef.current} />;
        })}

        {userLocation && (
            <Marker position={[userLocation.lat, userLocation.lng]} zIndexOffset={5000} icon={L.divIcon({
                className: 'bg-transparent border-none',
                html: `<div class="w-4 h-4 bg-white rounded-full border-2 border-[#0a0a12] shadow-[0_0_10px_white] animate-pulse"></div>`,
                iconSize: [16, 16], iconAnchor: [8, 8]
            })} />
        )}
        
        <ArcLayer messages={signals} />
        
        {/* HEATMAP LAYER (Signal Fog) - Only visible when Zoom >= 13 */}
        <HeatmapLayer messages={heatmapMessages} />

      </MapContainer>

      {/* SWEEP RADAR HUD */}
      <div className="pointer-events-none absolute inset-0 z-[9999] flex items-center justify-center">
          <div className="relative w-72 h-72 flex items-center justify-center">
              <div className="absolute inset-0 transition-transform duration-500 ease-out" style={{ transform: `scale(${radarScale})` }}>
                  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-[spin_4s_linear_infinite]">
                      <defs>
                          <linearGradient id="sweep" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor={isMaxZoom ? "#ef4444" : "#22d3ee"} stopOpacity="0" />
                              <stop offset="100%" stopColor={isMaxZoom ? "#ef4444" : "#22d3ee"} stopOpacity="0.4" />
                          </linearGradient>
                      </defs>
                      <path d="M50 50 L50 0 A50 50 0 0 1 100 50 Z" fill="url(#sweep)"/>
                  </svg>
                  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full opacity-20">
                      <circle cx="50" cy="50" r="49" fill="none" stroke={isMaxZoom ? "#ef4444" : "#22d3ee"} strokeWidth="0.5" strokeDasharray="4 4"/>
                  </svg>
              </div>

              <div className={`transition-all duration-300 z-10 ${isMaxZoom ? 'text-red-500 scale-125' : (hasSignal ? 'text-white' : 'text-cyan-400')}`}>
                  {isMaxZoom ? <ShieldAlert size={36} /> : (hasSignal ? <Lock size={32} /> : <Crosshair size={32} />)}
              </div>
              
              <AnimatePresence>
                {scannerStatus && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute -bottom-16 flex flex-col items-center whitespace-nowrap">
                        <span className="font-mono text-[10px] font-bold tracking-[0.3em] uppercase text-white drop-shadow-lg bg-[#0a0a12]/80 px-4 py-1 rounded-full border border-white/10">
                            {scannerStatus} {scannerCity && <span className="text-cyan-400 ml-2">[{scannerCity}]</span>}
                        </span>
                    </motion.div>
                )}
              </AnimatePresence>
          </div>
      </div>
    </div>
  );
};

export default ChatMap;