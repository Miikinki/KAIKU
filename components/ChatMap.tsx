import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker, Popup } from 'react-leaflet';
import { Crosshair, Lock, ShieldAlert, Satellite, Package } from 'lucide-react';
import { ChatMessage, ViewportBounds, LootDrop } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import ArcLayer from './ArcLayer';
import HeatmapLayer from './HeatmapLayer';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore
import useSupercluster from 'use-supercluster';
import { getUserProfile, fetchLootDrops } from '../services/storageService';
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
  
  // NEW PROPS
  isGameMasterMode?: boolean;
}

// ... (Existing constants and Icon functions) ...
const WORLD_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));
const CLUSTER_ZOOM_THRESHOLD = 14; 

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

const MapController: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    setZoom: (z: number) => void,
    setBounds: (b: [number, number, number, number] | null) => void,
    onMapClick: (e: L.LeafletMouseEvent) => void, // Changed signature
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

  // ... (Existing flyTo logic) ...
  useEffect(() => { if (focusedMessage) map.flyTo([focusedMessage.location.lat, focusedMessage.location.lng], 16); }, [focusedMessage, map]);

  return null;
};

const ChatMap: React.FC<ChatMapProps> = (props) => {
  const { messages, signals, onViewportChange, onMapClick, hasSignal, initialCenter, flyToLocation, focusedMessage, onOpenThread, hiddenIds, userLocation, scannerStatus, scannerCity, onTeleport, isTeleporting, isGameMasterMode } = props;
  const { t } = useTranslation();
  
  const [zoom, setZoom] = useState(3);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const profile = getUserProfile();
  
  // Loot State
  const [lootDrops, setLootDrops] = useState<LootDrop[]>([]);
  const [deployLocation, setDeployLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedDrop, setSelectedDrop] = useState<LootDrop | null>(null);

  // Fetch drops periodically or on load
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
      fetchLootDrops().then(setLootDrops); // Refresh
  };

  const handleDropClick = (drop: LootDrop) => {
      setSelectedDrop(drop);
  };

  // ... (Existing Cluster logic with Loot integration) ...
  // Note: For simplicity, I'm rendering Loot Drops as standard Markers OUTSIDE the Supercluster for now
  // so they don't get swallowed by message clusters.

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
        
        <MapController 
            onViewportChange={onViewportChange} 
            setZoom={setZoom} 
            setBounds={setBounds} 
            onMapClick={handleMapClickInternal} 
            flyToLocation={flyToLocation}
            focusedMessage={focusedMessage}
        />
        
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

        {/* ... (Existing Clusters/Layers) ... */}
        {/* Simplified for response: assume standard markers here */}
        
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

      {/* ... (Existing Radar HUD) ... */}
      <div className="pointer-events-none absolute inset-0 z-[999] flex items-center justify-center">
          {/* Visuals omitted for brevity */}
      </div>
    </div>
  );
};

export default React.memo(ChatMap);