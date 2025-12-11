
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, Circle } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION, THEME_COLOR } from '../constants';
import WebGLPulseLayer from './WebGLPulseLayer';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMessageClick: (msg: ChatMessage) => void;
  onClusterClick?: (messages: ChatMessage[]) => void;
  lastNewMessage: ChatMessage | null;
}

// ZOOMED OUT ICON: Small Dot
const createZoneDotIcon = (count: number) => {
  if (!L || !L.divIcon) return undefined;

  const baseSize = 10; 
  const scale = Math.min(1 + Math.log(count) * 0.2, 1.5); 
  const size = baseSize * scale;

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="zone-dot" style="width: ${size}px; height: ${size}px;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// ZOOMED IN ICON: Cluster Bubble with Count
const createClusterIcon = (count: number) => {
  if (!L || !L.divIcon) return undefined;

  const size = 28;

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div class="cluster-marker" style="width: ${size}px; height: ${size}px;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

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

// Component to render Hybrid Markers / Clusters
const ActivityZones: React.FC<{ 
  messages: ChatMessage[]; 
  onClusterClick?: (msgs: ChatMessage[]) => void; 
}> = ({ messages, onClusterClick }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
    }
  });

  const zones = useMemo(() => {
    // PRIVACY & CLUSTERING LOGIC:
    // Group messages by snapped coordinates (approx 1.1km grid).
    // This acts as both the "Hub" and the Privacy filter.
    
    const groups: Record<string, { lat: number, lng: number, messages: ChatMessage[], id: string }> = {};

    messages.forEach(msg => {
      // Round to 2 decimal places (approx 1.11km precision at equator)
      const snappedLat = Math.round(msg.location.lat * 100) / 100;
      const snappedLng = Math.round(msg.location.lng * 100) / 100;
      
      const key = `${snappedLat.toFixed(2)},${snappedLng.toFixed(2)}`;
      
      if (!groups[key]) {
        groups[key] = { 
            lat: snappedLat, 
            lng: snappedLng, 
            messages: [], 
            id: key 
        };
      }
      
      groups[key].messages.push(msg);
    });

    return Object.values(groups).map(g => ({
      id: g.id,
      position: [g.lat, g.lng] as [number, number],
      messages: g.messages,
      count: g.messages.length
    }));
  }, [messages]);

  // Hybrid Rendering Strategy
  const RENDER_THRESHOLD = 11;
  
  // Huge radius (2.5km) to cover entire districts/neighborhoods for privacy
  const PRIVACY_RADIUS_METERS = 2500; 

  return (
    <>
      {zones.map(zone => {
        if (zoom < RENDER_THRESHOLD) {
          // ZOOMED OUT: Render simple dots
          return (
            <Marker 
              key={`dot-${zone.id}`}
              position={zone.position}
              icon={createZoneDotIcon(zone.count)}
              interactive={true} 
              eventHandlers={{
                click: (e) => {
                   L.DomEvent.stopPropagation(e);
                   if (onClusterClick) onClusterClick(zone.messages);
                }
              }}
            />
          );
        } else {
          // ZOOMED IN: Render Hubs (Privacy Circle + Count Badge)
          return (
             <React.Fragment key={`hub-${zone.id}`}>
               {/* Privacy Circle Area */}
               <Circle 
                  center={zone.position}
                  radius={PRIVACY_RADIUS_METERS}
                  pathOptions={{
                     color: THEME_COLOR,
                     weight: 1,
                     fillColor: THEME_COLOR,
                     fillOpacity: 0.15,
                     dashArray: '4 8'
                  }}
                  interactive={true}
                  eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      if (onClusterClick) onClusterClick(zone.messages);
                    }
                  }}
               />
               
               {/* Center Count Badge */}
               <Marker 
                 position={zone.position}
                 icon={createClusterIcon(zone.count)}
                 interactive={true}
                 eventHandlers={{
                    click: (e) => {
                      L.DomEvent.stopPropagation(e);
                      if (onClusterClick) onClusterClick(zone.messages);
                    }
                  }}
               />
             </React.Fragment>
          );
        }
      })}
    </>
  );
};

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onMessageClick, onClusterClick, lastNewMessage }) => {
  const maxBounds = new L.LatLngBounds(
    new L.LatLng(-85, -Infinity), 
    new L.LatLng(85, Infinity)    
  );

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[20, 0]} 
        zoom={2.5} 
        minZoom={2.5}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }}
        maxBounds={maxBounds}
        maxBoundsViscosity={1.0}
        worldCopyJump={true} 
      >
        <TileLayer 
            url={MAP_TILE_URL} 
            attribution={MAP_ATTRIBUTION} 
            noWrap={false} 
        />
        
        <MapEvents onViewportChange={onViewportChange} />
        <MapResizeHandler onViewportChange={onViewportChange} />
        <ActivityZones messages={messages} onClusterClick={onClusterClick} />
        <WebGLPulseLayer lastNewMessage={lastNewMessage} />

      </MapContainer>
    </div>
  );
};

export default ChatMap;
