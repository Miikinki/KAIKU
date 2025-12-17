import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert, X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer, { HeatmapLayerRef } from './HeatmapLayer';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { getFlagEmoji } from '../services/storageService';
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
    const isGlobalEvent = msg.postType === 'GLOBAL_EVENT';

    const iconSize = isMasked ? 18 : 22;
    const containerSize = isGlobalEvent ? 50 : 40; 

    let svgContent = '';
    let visualClasses = '';
    let pulseHtml = '';

    if (isGlobalEvent) {
        svgContent = `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="#7f1d1d" stroke-width="1">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9a1 1 0 0 1 1 1v4a1 1 0 0 1-2 0v-4a1 1 0 0 1 1-1zm0 8a1 1 0 1 1-1-1 1 1 0 0 1 1 1z"/>
            </svg>
        `;
        visualClasses = 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,1)]';
        pulseHtml = `
            <div class="absolute inset-0 rounded-full bg-red-500/20 animate-ping"></div>
            <div class="absolute inset-2 rounded-full border border-red-500/80 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
        `;
    } else {
        svgContent = `
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
        visualClasses = isMasked 
            ? 'text-cyan-400 opacity-60' 
            : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]';
        pulseHtml = shouldPulse 
            ? `<div class="absolute inset-0 rounded-full border border-cyan-400/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>` 
            : '';
    }

    const html = `
        <div class="relative w-full h-full flex items-center justify-center">
            ${pulseHtml}
            <div class="relative z-10 ${visualClasses} transition-all duration-300">
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

const getClusterIcon = (count: number) => {
    const size = 30 + (count / 100) * 30;
    const finalSize = Math.min(size, 60);
    const isLarge = count > 10;
    return L.divIcon({
        html: `<div class="kaiku-cluster ${isLarge ? 'kaiku-cluster-large' : ''}" style="width: ${finalSize}px; height: ${finalSize}px;">${count}</div>`,
        className: 'bg-transparent border-none', 
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
            // FIX: Fly directly to the coordinates. Leaflet Popup autoPan handles the padding.
            map.flyTo([target.location.lat, target.location.lng], 18, {
                animate: true,
                duration: 1.5
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
                duration: 2.0
            });
        }
    }, [target?.timestamp, map]);
    return null;
};

const MapEventsHandler: React.FC<{ onMapClick: () => void }> = ({ onMapClick }) => {
    useMapEvents({ click: () => onMapClick() });
    return null;
};

const MapController: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    setZoom: (z: number) => void,
    setBounds: (b: [number, number, number, number] | null) => void 
}> = ({ onViewportChange, setZoom, setBounds }) => {
  const map = useMap();
  const lastUpdateRef = useRef(0);
  const handleViewportUpdate = useCallback(() => {
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
      onViewportChange({
          north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest(),
          zoom: z, center: { lat: center.lat, lng: center.lng }, sectorCenter: { lat: sectorLatLng.lat, lng: sectorLatLng.lng }
      });
  }, [map, onViewportChange]);

  const handleClusterUpdate = useCallback(() => {
      const b = map.getBounds();
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
  }, [map, setBounds, setZoom]);

  useEffect(() => {
      handleViewportUpdate(); handleClusterUpdate();
      const invalidate = () => map.invalidateSize({ animate: false });
      window.addEventListener('resize', invalidate);
      return () => window.removeEventListener('resize', invalidate);
  }, [map]);

  useMapEvents({
    move: () => {
        const now = Date.now();
        if (now - lastUpdateRef.current > 100) { 
            handleViewportUpdate(); lastUpdateRef.current = now;
        }
    },
    moveend: () => { handleViewportUpdate(); handleClusterUpdate(); lastUpdateRef.current = Date.now(); },
    zoomend: () => { handleViewportUpdate(); handleClusterUpdate(); }
  });
  return null;
};

const MessageMarker = React.memo(({ msg, position, isFocused, isHidden, onOpenThread, onClosePopup, mapInstance }: {
    msg: ChatMessage, position: [number, number], isFocused: boolean, isHidden: boolean,
    onOpenThread: (msg: ChatMessage) => void, onClosePopup: () => void, mapInstance: L.Map | null
}) => {
    const { t } = useTranslation();
    const isGlobalEvent = msg.postType === 'GLOBAL_EVENT';
    const markerRef = useRef<L.Marker>(null);
    const icon = useMemo(() => getMarkerIcon(msg), [msg.id, msg.isMasked, msg.postType, msg.timestamp]);
    const hasText = msg.text && msg.text.trim().length > 0;

    useEffect(() => {
        if (isFocused && markerRef.current && mapInstance) {
            const openPopupSafe = () => { if (markerRef.current) markerRef.current.openPopup(); };
            // @ts-ignore
            const isAnimating = mapInstance._animatingZoom || mapInstance._panAnim;
            if (isAnimating) {
                mapInstance.once('moveend', () => setTimeout(openPopupSafe, 150));
            } else {
                setTimeout(openPopupSafe, 200);
            }
        }
    }, [isFocused, mapInstance]);

    const handleOpenClick = (e: React.MouseEvent) => {
        e.stopPropagation(); e.preventDefault();
        if (!isHidden) { onOpenThread(msg); mapInstance?.closePopup(); }
    };

    return (
        <Marker position={position} icon={icon} ref={markerRef} zIndexOffset={isFocused ? 3000 : (isGlobalEvent ? 2000 : 0)}>
            <Popup 
                className="kaiku-custom-popup" closeButton={false} offset={[0, -10]}
                autoPan={true}
                autoPanPaddingTopLeft={[50, 250]} // Ensure it doesn't hide behind search bar
                autoPanPaddingBottomRight={[50, 50]}
            >
                <div className="p-3 relative">
                    <button onClick={(e) => { e.stopPropagation(); onClosePopup(); mapInstance?.closePopup(); }}
                        className="absolute top-2 right-2 p-1 text-gray-500 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors z-50">
                        <X size={14} />
                    </button>
                    <div className="group mt-1">
                        <div className="flex items-center justify-between mb-2 pr-6">
                            <span className={`text-[10px] font-mono font-bold tracking-wider flex items-center gap-1 ${isGlobalEvent ? 'text-red-500' : 'text-cyan-400'}`}>
                                {isGlobalEvent ? (
                                    <><span className="animate-pulse bg-red-500/10 px-1 rounded border border-red-500/30">SYS</span> <span className="ml-1">SYSTEM ALERT</span> {msg.country && <span className="ml-1 text-sm">{getFlagEmoji(msg.country)}</span>}</>
                                ) : (msg.isMasked ? <><Crosshair size={10} /> {t('map.masked')}</> : <><Crosshair size={10} /> {t('map.exact')}</>)}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        {isHidden ? (
                            <p className="text-sm text-gray-500 italic leading-relaxed mb-3 font-light border-l-2 border-gray-500/30 pl-2">{t('map.content_hidden')}</p>
                        ) : (
                            <div onClick={handleOpenClick} className={`mb-3 border-l-2 pl-2 transition-colors cursor-pointer ${isGlobalEvent ? 'border-red-500/50 group-hover:border-red-500' : 'border-cyan-500/30 group-hover:border-cyan-400'}`}>
                                {msg.imageUrl && <div className="mb-2 rounded overflow-hidden border border-white/10"><img src={msg.imageUrl} alt="attached" className="w-full h-16 object-cover opacity-80" /></div>}
                                <p className="text-sm text-gray-200 leading-relaxed line-clamp-4 font-light whitespace-pre-line">{hasText ? msg.text : (msg.imageUrl && <span className="flex items-center gap-2 text-cyan-400 italic font-mono text-xs"><ImageIcon size={14} /> {t('thread.image_attached')}</span>)}</p>
                            </div>
                        )}
                        {!isHidden && <button onClick={handleOpenClick} className={`w-full text-center py-1.5 rounded text-[10px] font-bold tracking-widest transition-all ${isGlobalEvent ? 'bg-red-900/30 text-red-400 hover:bg-red-500 hover:text-white' : 'bg-white/5 text-cyan-400 hover:bg-cyan-500 hover:text-black'}`}>{isGlobalEvent ? 'READ PROTOCOL' : t('map.open_channel')}</button>}
                    </div>
                </div>
            </Popup>
        </Marker>
    );
});

const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, signals, onViewportChange, onMapClick, lastNewMessage, hasSignal, initialCenter, flyToLocation, focusedMessage, onOpenThread, onClosePopup, hiddenIds, getUserLocation, userLocation }) => {
  const [zoom, setZoom] = useState(3.5);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const { t } = useTranslation();
  const mapRef = useRef<L.Map | null>(null);
  const startPosition: [number, number] = [52.0, 10.0]; 
  const isMaxZoom = zoom >= 17.5; 
  const baseScale = isMaxZoom ? 1.0 : (zoom <= 7 ? 0.4 : 0.4 + ((zoom - 7) / (13 - 7)) * 0.6);
  const totalScale = baseScale * (isMaxZoom ? 1.1 : (hasSignal ? 1.05 : 1.0));

  const points = useMemo(() => messages.map(msg => ({
      type: 'Feature', properties: { cluster: false, messageId: msg.id, ...msg },
      geometry: { type: 'Point', coordinates: [msg.location.lng, msg.location.lat] }
  })), [messages]);

  const { clusters, supercluster } = useSupercluster({
    points, bounds: bounds || [-180, -90, 180, 90], zoom: zoom, options: { radius: 60, maxZoom: 16 } 
  });

  const handleClusterClick = useCallback((id: number, lat: number, lng: number) => {
      const expansionZoom = Math.min(supercluster.getClusterExpansionZoom(id), 18);
      mapRef.current?.flyTo([lat, lng], expansionZoom, { animate: true, duration: 1 });
  }, [supercluster]);

  return (
    <div className="absolute inset-0 w-full h-full z-0 bg-[#0a0a12] overflow-hidden">
      <MapContainer
        // @ts-ignore
        center={startPosition} zoom={3.5} scrollWheelZoom={true} doubleClickZoom={false} zoomControl={false} attributionControl={false}
        className="w-full h-full outline-none" style={{ width: '100%', height: '100%', background: '#0a0a12' }} 
        minZoom={3} maxZoom={18} zoomSnap={0.5} maxBounds={[[-90, -220], [90, 220]]} preferCanvas={true} ref={mapRef}
      >
        <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} noWrap={true} opacity={0.8} keepBuffer={4} />
        <MapController onViewportChange={onViewportChange} setZoom={setZoom} setBounds={setBounds} />
        <MessageFlyTo target={focusedMessage} />
        <CoordinateFlyTo target={flyToLocation} />
        <MapEventsHandler onMapClick={onMapClick} />
        {userLocation && <UserLocationMarker position={userLocation} />}
        {clusters.map((cluster) => {
            const [longitude, latitude] = cluster.geometry.coordinates;
            const { cluster: isCluster, point_count: pointCount } = cluster.properties;
            if (isCluster) return <Marker key={`cluster-${cluster.id}`} position={[latitude, longitude]} icon={getClusterIcon(pointCount)} eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); handleClusterClick(cluster.id, latitude, longitude); } }} />;
            const msg = cluster.properties as ChatMessage;
            return <MessageMarker key={msg.id} msg={msg} position={[msg.location.lat, msg.location.lng]} isFocused={focusedMessage?.id === msg.id} isHidden={hiddenIds.has(msg.id)} onOpenThread={onOpenThread} onClosePopup={onClosePopup} mapInstance={mapRef.current} />;
        })}
        <ArcLayer messages={signals} />
        <HeatmapLayer messages={messages} />
      </MapContainer>
      <div className="pointer-events-none absolute inset-0 z-[400] flex flex-col items-center justify-center pb-48">
          <div className="relative flex items-center justify-center transition-all duration-200" style={{ transform: 'translate3d(0,0,0)', willChange: 'transform' }}>
              <div className="absolute w-64 h-64" style={{ transform: `scale(${totalScale})`, opacity: isMaxZoom || hasSignal ? 1 : 0.6, transition: 'transform 0.2s ease-out, opacity 0.5s ease-out' }}>
                  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-[spin_4s_linear_infinite]"><defs><linearGradient id="sweepGradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={isMaxZoom ? "#ef4444" : "#22d3ee"} stopOpacity="0" /><stop offset="50%" stopColor={isMaxZoom ? "#ef4444" : "#22d3ee"} stopOpacity="0.1" /><stop offset="100%" stopColor={isMaxZoom ? "#ef4444" : "#22d3ee"} stopOpacity="0.4" /></linearGradient></defs><path d="M50 50 L50 0 A50 50 0 0 1 100 50 Z" fill="url(#sweepGradient)"/></svg>
                  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full"><circle cx="50" cy="50" r="48" fill="none" stroke={isMaxZoom ? "#ef4444" : "#22d3ee"} strokeWidth="0.5" strokeOpacity="0.3" strokeDasharray="4 2"/><circle cx="50" cy="50" r="35" fill="none" stroke={isMaxZoom ? "#ef4444" : "#22d3ee"} strokeWidth="0.2" strokeOpacity="0.2"/></svg>
                  <div className={`absolute inset-[25%] rounded-full border border-dashed opacity-30 animate-[spin_10s_linear_infinite_reverse] ${isMaxZoom ? 'border-red-500' : 'border-cyan-400'}`}/>
              </div>
              <div className={`transition-all duration-300 z-10 ${isMaxZoom ? 'text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,1)] scale-125' : (hasSignal ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.9)] scale-110' : 'text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]')}`}>{isMaxZoom ? <ShieldAlert size={32} strokeWidth={2} /> : (hasSignal ? <Lock size={32} strokeWidth={2} /> : <Crosshair size={32} strokeWidth={1.5} />)}</div>
          </div>
      </div>
    </div>
  );
});

export default ChatMap;