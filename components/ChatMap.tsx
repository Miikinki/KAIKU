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
// Now accepts 'zoomTier' to render differently based on map height.
const PostMarker = React.memo(({ msg, onClick, zoomTier }: { msg: ChatMessage, onClick: () => void, zoomTier: number }) => {
    
    const icon = useMemo(() => {
        const now = Date.now();
        const age = now - msg.timestamp;
        const lifeRatio = 1 - (age / MESSAGE_LIFESPAN_MS);
        
        let opacity = Math.max(0.3, lifeRatio).toFixed(2); 
        let size = 8;
        let pulseClass = 'kaiku-pulse-steady';
        let zIndex = 100 + msg.score; // Higher score = on top

        // LEVEL OF DETAIL (LOD) LOGIC
        if (zoomTier === 0) {
            // ZOOM < 10: "Stardust Mode" (Tiny, transparent, no rings)
            size = msg.score > 20 ? 4 : 3; 
            opacity = (parseFloat(opacity) * 0.6).toFixed(2); // More transparent to allow heatmap effect
            pulseClass = 'kaiku-pulse-stardust';
            zIndex = 50;
        } 
        else if (zoomTier === 1) {
            // ZOOM 10-13: "Beacon Mode" (Medium, steady glow)
            size = msg.score > 10 ? 8 : 6;
            pulseClass = 'kaiku-pulse-steady';
        } 
        else {
            // ZOOM > 13: "Interaction Mode" (Large, intense pulse)
            size = msg.score > 5 ? 12 : 8;
            if (msg.score > 20) size = 16;
            
            // Only new messages get the intense ring at high zoom
            const isNew = age < 60000;
            pulseClass = isNew ? 'kaiku-pulse-intense' : 'kaiku-pulse-steady';
        }

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
            iconAnchor: [size / 2, size / 2],
            // Leaflet zIndexOffset helps sorting
        });
    }, [msg.score, msg.timestamp, msg.id, zoomTier]); 

    return (
        <Marker 
            position={[msg.location.lat, msg.location.lng]}
            icon={icon}
            zIndexOffset={msg.score * 10} // Native Leaflet sorting
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
          map.flyTo([selectedLocation.lat, selectedLocation.lng], 14, { // Fly deeper (14) for better UX
              animate: true,
              duration: 1.5
          });
      }
  }, [selectedLocation, map]);

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

  // Determine Zoom Tier to minimize re-renders on every fractional zoom change
  const zoomTier = useMemo(() => {
      if (zoom < 10) return 0; // Stardust
      if (zoom < 14) return 1; // Beacon
      return 2; // Interaction
  }, [zoom]);

  // Sort messages so high score ones render ON TOP of low score ones
  // This is critical for the "mössö" (clutter) problem.
  const sortedMessages = useMemo(() => {
      return [...messages].sort((a, b) => a.score - b.score);
  }, [messages]);

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
        maxBounds={[[-90, -180], [90, 180]]} 
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
            onMapClick={onMapClick} 
            onViewportChange={onViewportChange}
            setZoom={setZoom}
            selectedLocation={flyToTarget}
        />

        <ArcLayer messages={messages} />

        {sortedMessages.map(msg => (
            <PostMarker 
                key={msg.id}
                msg={msg}
                onClick={() => handleMarkerClick(msg)}
                zoomTier={zoomTier}
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