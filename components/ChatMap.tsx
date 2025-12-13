import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, Marker, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION, MESSAGE_LIFESPAN_MS } from '../constants';
import ArcLayer from './ArcLayer';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMapClick: () => void;
  lastNewMessage: ChatMessage | null;
}

// --- OPTIMIZED POST MARKER COMPONENT ---
const PostMarker = React.memo(({ msg, onClick }: { msg: ChatMessage, onClick: () => void }) => {
    
    const icon = useMemo(() => {
        const now = Date.now();
        const age = now - msg.timestamp;
        const lifeRatio = 1 - (age / MESSAGE_LIFESPAN_MS);
        const opacity = Math.max(0.3, lifeRatio).toFixed(2); 
        
        let size = 8;
        if (msg.score > 5) size = 12;
        if (msg.score > 20) size = 18;
        if (msg.score < 0) size = 6;

        const isNew = age < 60000;
        const pulseClass = isNew ? 'kaiku-pulse-intense' : 'kaiku-pulse-steady';
        const color = msg.score < 0 ? '#64748b' : '#06b6d4';
        const glowColor = msg.score < 0 ? '#64748b' : '#22d3ee';

        const html = `
            <div class="marker-container ${pulseClass}" style="width: ${size}px; height: ${size}px; opacity: ${opacity};">
                <div class="marker-core" style="
                    width: ${size}px; 
                    height: ${size}px; 
                    background-color: ${color};
                    box-shadow: 0 0 ${size}px ${glowColor};
                "></div>
            </div>
        `;

        return L.divIcon({
            className: 'leaflet-div-icon',
            html: html,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2] 
        });
    }, [msg.score, msg.timestamp, msg.id]); 

    return (
        <Marker 
            position={[msg.location.lat, msg.location.lng]}
            icon={icon}
            eventHandlers={{ click: onClick }}
        />
    );
});

// --- MAP CONTROLLER ---
const MapController: React.FC<{ 
    onViewportChange: (b: ViewportBounds) => void, 
    onMapClick: () => void,
    setZoom: (z: number) => void,
    selectedLocation: { lat: number, lng: number } | null
}> = ({ onViewportChange, onMapClick, setZoom, selectedLocation }) => {
  
  const map = useMap();

  useEffect(() => {
      if (selectedLocation) {
          map.flyTo([selectedLocation.lat, selectedLocation.lng], 10, {
              animate: true,
              duration: 1.5
          });
      }
  }, [selectedLocation, map]);

  // FIX: Force a resize calculation after mount. 
  // This solves the "gray map" or "partial map" issue in production/Vercel
  // where the container size isn't immediately available to Leaflet.
  useEffect(() => {
      setTimeout(() => {
          map.invalidateSize();
      }, 250);
  }, [map]);

  useMapEvents({
    click: () => onMapClick(),
    moveend: () => {
        const bounds = map.getBounds();
        const z = map.getZoom();
        setZoom(z); 
        onViewportChange({
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
            zoom: z
        });
    },
    zoomend: () => {
        setZoom(map.getZoom());
    }
  });

  return null;
};

// --- MAIN CHAT MAP ---
const ChatMap: React.FC<ChatMapProps> = React.memo(({ messages, onViewportChange, onMapClick, lastNewMessage }) => {
  const [zoom, setZoom] = useState(5);
  const [flyToTarget, setFlyToTarget] = useState<{lat: number, lng: number} | null>(null);

  const handleMarkerClick = (msg: ChatMessage) => {
      setFlyToTarget({ lat: msg.location.lat, lng: msg.location.lng });
      setTimeout(() => setFlyToTarget(null), 1000);
      onMapClick(); 
  };

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[25, 0]} 
        zoom={3}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }}
        minZoom={2} 
        // FIX: Relaxed bounds to -90/90. 
        // The previous -85 limit caused tile clipping on some production renderers.
        maxBounds={[[-90, -180], [90, 180]]} 
        maxBoundsViscosity={1.0} 
        preferCanvas={true}
        worldCopyJump={false} 
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={true} // Keep this to prevent horizontal repeating
          opacity={0.8}
        />

        <MapController 
            onMapClick={onMapClick} 
            onViewportChange={onViewportChange}
            setZoom={setZoom}
            selectedLocation={flyToTarget}
        />

        <ArcLayer messages={messages} />

        {messages.map(msg => (
            <PostMarker 
                key={msg.id}
                msg={msg}
                onClick={() => handleMarkerClick(msg)}
            />
        ))}
        
      </MapContainer>
    </div>
  );
}, (prevProps, nextProps) => {
    return prevProps.messages === nextProps.messages && 
           prevProps.lastNewMessage === nextProps.lastNewMessage;
});

export default ChatMap;