import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert, Satellite } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION, AVATAR_ICONS } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer from './HeatmapLayer';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore
import useSupercluster from 'use-supercluster';
import { getUserProfile } from '../services/storageService';

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
  onTeleport?: (lat: number, lng: number) => void;
  isTeleporting?: boolean;
}

const WORLD_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));
const CLUSTER_ZOOM_THRESHOLD = 14; 

const isNewsPost = (msg: ChatMessage) => msg.postType === 'GLOBAL_EVENT' || msg.postType === 'SCAN_RESULT';

const getMarkerIcon = (msg: ChatMessage) => {
    const isNews = isNewsPost(msg);
    const containerSize = isNews ? 50 : 30; 
    let color = '#ef4444';
    
    let svgPath = `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    let viewBox = "0 0 24 24";

    const html = `
        <div class="relative w-full h-full flex items-center justify-center">
            <div class="absolute inset-0 rounded-full animate-ping opacity-20" style="background-color: ${color}"></div>
            <div class="relative z-10 transition-all duration-300 flex items-center justify-center" style="color: ${color}; filter: drop-shadow(0 0 8px ${color}E6)">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

const getUserDotIcon = () => {
    return L.divIcon({
        html: `<div class="kaiku-user-dot" style="width: 8px; height: 8px;"></div>`,
        className: 'bg-transparent',
        iconSize: [8, 8],
        iconAnchor: [4, 4]
    });
}

const getClusterIcon = (count: number, isSystem: boolean) => {
    const size = 35 + Math.min(count / 10, 25);
    const className = isSystem ? 'kaiku-cluster kaiku-cluster-system' : 'kaiku-cluster kaiku-cluster-user';
    return L.divIcon({
        html: `<div class="${className}" style="width: ${size}px; height: ${size}px; line-height: ${size}px;">${count}</div>`,
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
    isSystem: boolean;
}

// Memoize individual markers to prevent DOM thrashing
const MessageMarker: React.FC<MessageMarkerProps> = React.memo(({ msg, position, isHidden, onOpenThread, mapInstance, isSystem }) => {
    const { t } = useTranslation();
    
    if (!isSystem) {
        return <Marker position={position} icon={getUserDotIcon()} interactive={false} />;
    }

    const icon = useMemo(() => getMarkerIcon(msg), [msg.id, isSystem]);

    return (
        <Marker position={position} icon={icon} zIndexOffset={2000}>
            <Popup className="kaiku-custom-popup" closeButton={false} offset={[0, -10]}>
                <div className="p-3">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-500">
                            SYSTEM ALERT
                        </span>
                    </div>
                    <p className="text-xs text-gray-200 mb-3 line-clamp-3 leading-relaxed">
                        {isHidden ? t('map.content_hidden') : msg.text.split('\n\n')[0]}
                    </p>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onOpenThread(msg); mapInstance?.closePopup(); }}
                        className={`w-full py-2 rounded text-[10px] font-black tracking-widest text-black bg-red-500`}
                    >
                        {t('map.open_channel')}
                    </button>
                </div>
            </Popup>
        </Marker>
    );
});

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
    // Only invalidate size ONCE on mount to fix mobile rendering
    map.invalidateSize();
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
  const { messages, signals, onViewportChange, onMapClick, hasSignal, initialCenter, flyToLocation, focusedMessage, onOpenThread, hiddenIds, userLocation, scannerStatus, scannerCity, onTeleport, isTeleporting } = props;
  const { t } = useTranslation();
  
  const [zoom, setZoom] = useState(3);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const profile = getUserProfile();
  
  const isZoomedIn = zoom >= CLUSTER_ZOOM_THRESHOLD;

  // Optimize filtering: Only re-run if messages array length or ID changes
  const newsMessages = useMemo(() => messages.filter(m => isNewsPost(m)), [messages]);
  const chatMessages = useMemo(() => messages.filter(m => !isNewsPost(m)), [messages]);

  const points = useMemo(() => {
      const p: any[] = [];
      newsMessages.forEach(msg => {
          p.push({
              type: 'Feature', 
              properties: { cluster: false, messageId: msg.id, message: msg, isNews: 1 },
              geometry: { type: 'Point', coordinates: [msg.location.lng, msg.location.lat] }
          });
      });

      if (!isZoomedIn) {
          chatMessages.forEach(msg => {
              p.push({
                  type: 'Feature', 
                  properties: { cluster: false, messageId: msg.id, message: msg, isNews: 0 },
                  geometry: { type: 'Point', coordinates: [msg.location.lng, msg.location.lat] }
              });
          });
      }
      return p;
  }, [newsMessages, chatMessages, isZoomedIn]);

  const { clusters, supercluster } = useSupercluster({
    points, 
    bounds: bounds || [-180, -90, 180, 90], 
    zoom, 
    options: { 
        radius: 60, 
        maxZoom: 16,
        map: (props: any) => ({ newsCount: props.isNews }),
        reduce: (acc: any, props: any) => { acc.newsCount += props.newsCount; }
    } 
  });

  const heatmapMessages = isZoomedIn ? chatMessages : [];
  const isMaxZoom = zoom >= 17;
  const radarScale = isMaxZoom ? 1.0 : (zoom <= 7 ? 0.4 : 0.4 + ((zoom - 7) / (13 - 7)) * 0.6);

  const handleTeleport = () => {
      if (onTeleport && mapRef.current) {
          const center = mapRef.current.getCenter();
          onTeleport(center.lat, center.lng);
      }
  };

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
        
        {clusters.map((cluster: any) => {
            const [longitude, latitude] = cluster.geometry.coordinates;
            const { cluster: isCluster, point_count: pointCount, newsCount } = cluster.properties;
            
            if (isCluster) {
                const isSystemCluster = newsCount > 0;
                return (
                    <Marker 
                        key={`cluster-${cluster.id}`} 
                        position={[latitude, longitude]} 
                        icon={getClusterIcon(pointCount, isSystemCluster)} 
                        eventHandlers={{ click: () => { 
                            const expansionZoom = supercluster.getClusterExpansionZoom(cluster.id);
                            mapRef.current?.setView([latitude, longitude], expansionZoom);
                        }}} 
                    />
                );
            }

            const msg = cluster.properties.message;
            const isSystemLeaf = !!cluster.properties.isNews;

            return <MessageMarker 
                key={msg.id} 
                msg={msg} 
                position={[latitude, longitude]} 
                isHidden={hiddenIds.has(msg.id)} 
                onOpenThread={onOpenThread} 
                mapInstance={mapRef.current}
                isSystem={isSystemLeaf}
            />;
        })}

        <ArcLayer messages={signals} />
        <HeatmapLayer messages={heatmapMessages} />

      </MapContainer>

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

                {profile.isPrime && !scannerStatus && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.5 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        className="absolute -top-24 pointer-events-auto"
                    >
                        <button 
                            onClick={handleTeleport}
                            className={`flex flex-col items-center gap-1 group ${isTeleporting ? 'text-yellow-400' : 'text-gray-400 hover:text-yellow-400'}`}
                        >
                            <div className="p-2 rounded-full bg-black/60 border border-current shadow-lg backdrop-blur-md transition-all group-active:scale-95">
                                <Satellite size={20} />
                            </div>
                            <span className="text-[9px] font-black tracking-widest uppercase bg-black/60 px-2 rounded">
                                {isTeleporting ? t('map.teleport_active') : t('map.teleport')}
                            </span>
                        </button>
                    </motion.div>
                )}
              </AnimatePresence>
          </div>
      </div>
    </div>
  );
};

// CRITICAL FIX: Wrap component in React.memo to prevent re-renders when parent (App.tsx) updates state that doesn't affect map
export default React.memo(ChatMap);