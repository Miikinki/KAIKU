
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMessageClick: (msg: ChatMessage) => void;
  lastNewMessage: ChatMessage | null;
}

// Function to create Activity Zone Aura Icon
const createActivityZoneIcon = (count: number) => {
  if (!L || !L.divIcon) return undefined;

  // Scale size based on count (logarithmic scale)
  const baseSize = 60;
  const scale = Math.min(1 + Math.log(count) * 0.5, 4); // Max 4x size
  const size = baseSize * scale;

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="activity-zone" style="width: ${size}px; height: ${size}px;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const pulseIcon = L.divIcon({
  className: 'pulse-ring-marker',
  html: '<div class="pulse-ring"></div>',
  iconSize: [20, 20], // Base size, visual size handled by CSS
  iconAnchor: [10, 10], // Center it
});

// Component to handle Map Resizing logic using ResizeObserver
const MapResizeHandler: React.FC<{ onViewportChange: (b: ViewportBounds) => void }> = ({ onViewportChange }) => {
  const map = useMap();
  const mapContainerRef = useRef<HTMLElement | null>(map.getContainer());

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
      const bounds = map.getBounds();
      onViewportChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom()
      });
    };

    // 1. Initial invalidation (timeout fallback)
    setTimeout(handleResize, 100);
    setTimeout(handleResize, 500); // Secondary safety check
    setTimeout(handleResize, 2000); // Late check for slow loads

    // 2. ResizeObserver for robust detection of container changes (e.g. iframe resize)
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [map, onViewportChange]);

  return null;
};

const MapEvents: React.FC<{ onViewportChange: (b: ViewportBounds) => void }> = ({ onViewportChange }) => {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onViewportChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom()
      });
    },
    zoomend: () => {
       const bounds = map.getBounds();
       onViewportChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom()
      });
    }
  });

  return null;
};

// Component to render aggregated zones
const ActivityZones: React.FC<{ messages: ChatMessage[] }> = ({ messages }) => {
  
  const zones = useMemo(() => {
    // Group messages by city/context to form "Activity Zones"
    const groups: Record<string, { latSum: number, lngSum: number, count: number, id: string }> = {};

    messages.forEach(msg => {
      // Use city as the grouping key. If unknown, maybe group by integer lat/lng grid
      const key = msg.city && msg.city !== 'Unknown Sector' ? msg.city : `${Math.round(msg.location.lat)},${Math.round(msg.location.lng)}`;
      
      if (!groups[key]) {
        groups[key] = { latSum: 0, lngSum: 0, count: 0, id: key };
      }
      
      groups[key].latSum += msg.location.lat;
      groups[key].lngSum += msg.location.lng;
      groups[key].count += 1;
    });

    // Calculate center and return markers
    return Object.values(groups).map(g => ({
      id: g.id,
      position: [g.latSum / g.count, g.lngSum / g.count] as [number, number],
      count: g.count
    }));
  }, [messages]);

  return (
    <>
      {zones.map(zone => (
        <Marker 
          key={zone.id}
          position={zone.position}
          icon={createActivityZoneIcon(zone.count)}
          interactive={false} // Zones are visual indicators only
        />
      ))}
    </>
  );
};

// Component to handle new message pulses
const PulseLayer: React.FC<{ lastNewMessage: ChatMessage | null }> = ({ lastNewMessage }) => {
  const [pulses, setPulses] = useState<{ id: string, pos: [number, number] }[]>([]);

  useEffect(() => {
    if (lastNewMessage) {
      const pulseId = `${lastNewMessage.id}-${Date.now()}`;
      setPulses(prev => [...prev, { 
        id: pulseId, 
        pos: [lastNewMessage.location.lat, lastNewMessage.location.lng] 
      }]);

      // Auto-remove pulse after animation duration (1.5s)
      setTimeout(() => {
        setPulses(prev => prev.filter(p => p.id !== pulseId));
      }, 1500);
    }
  }, [lastNewMessage]);

  return (
    <>
      {pulses.map(p => (
        <Marker 
          key={p.id}
          position={p.pos}
          icon={pulseIcon}
          zIndexOffset={1000} // Ensure it appears on top
          interactive={false}
        />
      ))}
    </>
  );
};

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onMessageClick, lastNewMessage }) => {
  // Lock the map to the "real" world coordinates to prevent scrolling into the void vertically,
  // BUT allow horizontal scrolling (Infinity) to prevent blue bars on wide screens.
  const maxBounds = new L.LatLngBounds(
    new L.LatLng(-85, -Infinity), // South West
    new L.LatLng(85, Infinity)    // North East
  );

  return (
    // Fixed positioning here guarantees the map container fills the window
    <div className="absolute inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[60.16, 24.93]} // Center on Helsinki initially
        zoom={10}
        minZoom={2.5}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }}
        maxBounds={maxBounds}
        maxBoundsViscosity={1.0}
        worldCopyJump={true} // Ensures markers wrap around the world correctly
      >
        <TileLayer 
            url={MAP_TILE_URL} 
            attribution={MAP_ATTRIBUTION} 
            noWrap={false} // Allow tiles to wrap horizontally to fill wide screens
        />
        
        <MapEvents onViewportChange={onViewportChange} />
        <MapResizeHandler onViewportChange={onViewportChange} />
        <ActivityZones messages={messages} />
        <PulseLayer lastNewMessage={lastNewMessage} />

      </MapContainer>
    </div>
  );
};

export default ChatMap;
