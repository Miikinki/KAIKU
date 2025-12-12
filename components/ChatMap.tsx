import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import { aggregateMessagesByCity, CityHubData } from '../services/h3Helpers';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMessageClick: (msg: ChatMessage) => void;
  onClusterClick?: (messages: ChatMessage[]) => void;
  lastNewMessage: ChatMessage | null;
}

// ----------------------------------------------------------------------
// CITY HUB LAYER (Glowing Markers)
// ----------------------------------------------------------------------
const CityHubLayer: React.FC<{ 
  hubs: CityHubData[]; 
  onClusterClick?: (messages: ChatMessage[]) => void 
}> = ({ hubs, onClusterClick }) => {
  
  return (
    <>
      {hubs.map((hub) => {
        // Base size on count (min 40px, max 100px)
        const size = Math.min(100, Math.max(40, 40 + Math.log(hub.count) * 10));
        
        const hubIcon = L.divIcon({
            className: 'kaiku-city-hub-marker',
            html: `
              <div class="kaiku-hub-pulse"></div>
              <div class="kaiku-hub-core"></div>
              <div class="kaiku-hub-label">
                <span class="city-name">${hub.name}</span>
                <span class="count">${hub.count} SGNL</span>
              </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });

        return (
           <Marker 
             key={`hub-${hub.id}`}
             position={[hub.center.lat, hub.center.lng]}
             icon={hubIcon}
             eventHandlers={{
                click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    if(onClusterClick) onClusterClick(hub.messages);
                }
             }}
           />
        );
      })}
    </>
  );
};

// ----------------------------------------------------------------------
// MAP COMPONENT
// ----------------------------------------------------------------------

const MapController: React.FC<{ onZoomChange: (z: number) => void }> = ({ onZoomChange }) => {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom())
  });
  return null;
};

const MapResizeHandler: React.FC<{ onViewportChange: (b: ViewportBounds) => void }> = ({ onViewportChange }) => {
  const map = useMap();
  const mapContainerRef = useRef<HTMLElement | null>(map.getContainer());

  useEffect(() => {
    const handleUpdate = () => {
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
    
    // Initial warmup
    setTimeout(handleUpdate, 100);
    setTimeout(handleUpdate, 500);

    const resizeObserver = new ResizeObserver(() => handleUpdate());
    if (mapContainerRef.current) resizeObserver.observe(mapContainerRef.current);
    
    map.on('moveend', handleUpdate);
    map.on('zoomend', handleUpdate);

    return () => {
      resizeObserver.disconnect();
      map.off('moveend', handleUpdate);
      map.off('zoomend', handleUpdate);
    };
  }, [map, onViewportChange]);
  
  return null;
};

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onClusterClick, lastNewMessage }) => {
  const [zoom, setZoom] = useState(2.5);
  
  // Aggregate messages by City (independent of zoom now)
  const hubs = useMemo(() => aggregateMessagesByCity(messages), [messages]);

  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[20, 0]}
        zoom={2.5}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100vw', height: '100vh', background: '#0a0a12' }}
        minZoom={2}
        worldCopyJump={true}
        maxBounds={[[-85, -Infinity], [85, Infinity]]}
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={false}
        />

        <MapController onZoomChange={setZoom} />
        <MapResizeHandler onViewportChange={onViewportChange} />

        <CityHubLayer 
            hubs={hubs} 
            onClusterClick={onClusterClick}
        />
        
      </MapContainer>
    </div>
  );
};

export default ChatMap;