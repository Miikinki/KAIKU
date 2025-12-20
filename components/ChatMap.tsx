import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker } from 'react-leaflet'; // Removed CircleMarker
import { Crosshair, Zap } from 'lucide-react';
import { ChatMessage, ViewportBounds, LootDrop } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer from './HeatmapLayer';
import L from 'leaflet';
// @ts-ignore
import useSupercluster from 'use-supercluster';
import { fetchLootDrops } from '../services/storageService';
import { DeployLootModal, ClaimLootModal } from './LootModals';

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
  isGameMasterMode?: boolean;
}

const WORLD_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));

// --- ICONS ---

const getLootIcon = () => {
    return L.divIcon({
        className: 'bg-transparent border-none',
        html: `<div class="relative w-10 h-10 flex items-center justify-center">
                 <div class="absolute inset-0 bg-amber-500/30 rounded-full animate-ping"></div>
                 <div class="relative z-10 bg-amber-900/80 border border-amber-500 rounded p-1.5 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                 </div>
               </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });
};

// Custom Icons for Map Items
const chatIcon = L.divIcon({
    className: 'bg-transparent border-none',
    html: `<div class="w-3 h-3 bg-cyan-400 rounded-full border border-white/50 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

const newsIcon = L.divIcon({
    className: 'bg-transparent border-none',
    html: `<div class="w-10 h-10 bg-red-600 border-2 border-white text-white font-bold rounded-full flex items-center justify-center shadow-lg animate-pulse text-xl"><span>!</span></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
});

const createClusterIcon = (count: number, isSystem: boolean) => {
  const size = 30 + Math.min(count, 20); 
  const cssClass = isSystem ? 'kaiku-cluster-system' : 'kaiku-cluster-user';
  return L.divIcon({
    html: `<div class="kaiku-cluster ${cssClass}" style="width: ${size}px; height: ${size}px;">${count}</div>`,
    className: 'bg-transparent border-none', 
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const MapController: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    setZoom: (z: number) => void,
    setBounds: (b: [number, number, number, number] | null) => void,
    onMapClick: (e: L.LeafletMouseEvent) => void,
    flyToLocation: any,
    focusedMessage: any
}> = ({ onViewportChange, setZoom, setBounds, onMapClick, flyToLocation, focusedMessage }) => {
  const map = useMap();
  
  useEffect(() => {
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
    click: (e) => onMapClick(e) 
  });

  useEffect(() => { 
      if (flyToLocation) {
          map.flyTo([flyToLocation.lat, flyToLocation.lng], 14, { duration: 2 });
      }
  }, [flyToLocation, map]);

  useEffect(() => { 
      if (focusedMessage) {
          map.flyTo([focusedMessage.location.lat, focusedMessage.location.lng], 16); 
      }
  }, [focusedMessage, map]);

  return null;
};

const ChatMap: React.FC<ChatMapProps> = (props) => {
  const { messages, signals, onViewportChange, onMapClick, hasSignal, initialCenter, flyToLocation, focusedMessage, onOpenThread, hiddenIds, userLocation, scannerStatus, scannerCity, onTeleport, isTeleporting, isGameMasterMode } = props;
  
  const [zoom, setZoom] = useState(3);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  
  // Loot State
  const [lootDrops, setLootDrops] = useState<LootDrop[]>([]);
  const [deployLocation, setDeployLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<LootDrop | null>(null);

  // Dynamic Radar Size Logic
  const radarSize = useMemo(() => {
      const base = 40; 
      const multiplier = 18;
      const size = base + (zoom * multiplier);
      const maxDim = typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) * 0.75 : 300;
      return Math.min(size, maxDim);
  }, [zoom]);

  useEffect(() => {
      fetchLootDrops().then(setLootDrops);
      const interval = setInterval(() => {
          fetchLootDrops().then(setLootDrops);
      }, 30000);
      return () => clearInterval(interval);
  }, []);

  const handleMapClickInternal = (e: L.LeafletMouseEvent) => {
      if (isGameMasterMode) {
          setDeployLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else {
          onMapClick();
      }
  };

  const handleDeployClose = () => {
      setDeployLocation(null);
      fetchLootDrops().then(setLootDrops);
  };

  const handleDropClick = (drop: LootDrop) => {
      setSelectedDrop(drop);
  };

  // --- SUPERCLUSTER LOGIC ---
  const points = useMemo(() => messages
    .filter(m => !hiddenIds.has(m.id))
    .map(msg => ({
      type: 'Feature',
      properties: { 
          cluster: false, 
          msgId: msg.id, 
          category: 'message', 
          isSystem: msg.postType === 'GLOBAL_EVENT',
          ...msg 
      },
      geometry: {
        type: 'Point',
        coordinates: [msg.location.lng, msg.location.lat]
      }
    })), 
  [messages, hiddenIds]);

  const { clusters, supercluster } = useSupercluster({
    points,
    bounds: bounds ? [bounds[0], bounds[1], bounds[2], bounds[3]] : undefined,
    zoom,
    options: { radius: 75, maxZoom: 16 }
  });

  return (
    <div className="fixed inset-0 w-full h-full bg-[#0a0a12] overflow-hidden">
      <MapContainer
        center={initialCenter ? [initialCenter.lat, initialCenter.lng] : [20.0, 0.0]} 
        zoom={3}
        minZoom={2}
        maxBounds={WORLD_BOUNDS}
        zoomControl={false} 
        attributionControl={false}
        className="w-full h-full absolute inset-0"
        style={{ background: '#0a0a12' }} 
        ref={mapRef}
      >
        <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} noWrap={true} bounds={WORLD_BOUNDS} />
        
        {/* HEATMAP provides the visual "Fog" when zoomed in */}
        <HeatmapLayer messages={messages} />
        <ArcLayer messages={signals} />

        <MapController 
            onViewportChange={onViewportChange} 
            setZoom={setZoom} 
            setBounds={setBounds} 
            onMapClick={handleMapClickInternal} 
            flyToLocation={flyToLocation}
            focusedMessage={focusedMessage}
        />
        
        {/* RENDER CLUSTERS & MARKERS */}
        {clusters.map((cluster: any) => {
          const [longitude, latitude] = cluster.geometry.coordinates;
          const { cluster: isCluster, point_count: pointCount, isSystem } = cluster.properties;

          if (isCluster) {
            return (
              <Marker
                key={`cluster-${cluster.id}`}
                position={[latitude, longitude]}
                icon={createClusterIcon(pointCount, isSystem)} 
                eventHandlers={{
                  click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    const expansionZoom = Math.min(
                      supercluster.getClusterExpansionZoom(cluster.id),
                      17
                    );
                    mapRef.current?.setView([latitude, longitude], expansionZoom, {
                      animate: true,
                    });
                  },
                }}
              />
            );
          }

          // INDIVIDUAL MESSAGE (The "Leaf")
          const isNews = isSystem; // Based on properties passed to supercluster
          const markerIcon = isNews ? newsIcon : chatIcon;
          const zIndex = isNews ? 1000 : 100; // Force news to sit on top of chat

          return (
             <Marker 
               key={`msg-${cluster.properties.msgId}`}
               position={[latitude, longitude]}
               icon={markerIcon}
               zIndexOffset={zIndex}
               eventHandlers={{ 
                   click: (e) => {
                       L.DomEvent.stopPropagation(e);
                       onOpenThread(cluster.properties);
                   }
               }}
             />
          );
        })}

        {/* RENDER LOOT DROPS */}
        {lootDrops.map(drop => (
            <Marker 
                key={drop.id}
                position={[drop.lat, drop.lng]}
                icon={getLootIcon()}
                eventHandlers={{ click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    handleDropClick(drop);
                }}}
            />
        ))}
      </MapContainer>

      {/* LOOT UI OVERLAYS */}
      <DeployLootModal 
          isOpen={!!deployLocation} 
          onClose={handleDeployClose} 
          location={deployLocation} 
      />
      
      <ClaimLootModal 
          drop={selectedDrop} 
          onClose={() => setSelectedDrop(null)} 
          userLocation={userLocation}
      />

      {/* --- RADAR HUD (THE SWEEPER) --- */}
      <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center overflow-hidden">
          
          {/* DYNAMIC SIZED HUD RING */}
          <div 
            className="relative rounded-full border border-cyan-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.05)] transition-all duration-300 ease-out"
            style={{ width: `${radarSize}px`, height: `${radarSize}px` }}
          >
              
              {/* 1. THE SWEEPER (Radar Beam) */}
              <div 
                  className="absolute inset-0 rounded-full animate-[spin_4s_linear_infinite]"
                  style={{ background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(6, 182, 212, 0.15) 360deg)' }}
              />

              {/* 2. Static Rings (Cleaner) */}
              <div className="absolute inset-[35%] rounded-full border border-cyan-500/10" />

              {/* 3. Crosshairs */}
              <div className="absolute top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-cyan-500/20 to-transparent" />
              <div className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

              {/* 4. Center Target */}
              <div className="relative z-10 text-cyan-500/70">
                  <Crosshair size={20} strokeWidth={1.5} />
              </div>

              {/* 5. Scanning Status Text */}
              <div className="absolute -bottom-10 flex flex-col items-center gap-1">
                  <div className="text-[10px] font-mono text-cyan-500/50 tracking-[0.2em] font-bold animate-pulse flex items-center gap-2">
                      <Zap size={10} />
                      SCANNING
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default React.memo(ChatMap);