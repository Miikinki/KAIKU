import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap, Marker } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import { aggregateMessagesByCity, aggregateMessagesByDistrict, HubData } from '../services/h3Helpers';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMessageClick: (msg: ChatMessage) => void;
  onClusterClick?: (messages: ChatMessage[]) => void;
  lastNewMessage: ChatMessage | null;
}

// ----------------------------------------------------------------------
// LAYER 1: CITY HUBS (Zoom < 10)
// Large, pulsing orbs aggregating entire cities.
// ----------------------------------------------------------------------
const CityHubLayer: React.FC<{ 
  hubs: HubData[]; 
  onClusterClick?: (messages: ChatMessage[]) => void 
}> = ({ hubs, onClusterClick }) => {
  return (
    <>
      {hubs.map((hub) => {
        const size = Math.min(100, Math.max(40, 40 + Math.log(hub.count) * 10));
        
        const hubIcon = L.divIcon({
            className: 'kaiku-city-hub-marker',
            html: `
              <div class="kaiku-hub-pulse"></div>
              <div class="kaiku-hub-core"></div>
              <div class="kaiku-hub-label">
                <span class="city-name">${hub.name}</span>
                <span class="count">${hub.count}</span>
              </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });

        return (
           <Marker 
             key={`city-${hub.id}`}
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
// LAYER 2: DISTRICT BEACONS (Zoom >= 10)
// Tech-Halo style. Fixed grid points.
// ----------------------------------------------------------------------
const DistrictBeaconLayer: React.FC<{ 
  beacons: HubData[]; 
  onClusterClick?: (messages: ChatMessage[]) => void 
}> = ({ beacons, onClusterClick }) => {
  return (
    <>
      {beacons.map((beacon) => {
        // Fixed visual size for the "Radar" zone representation
        // It creates a "territory" feel around the snap point
        const size = 120; 
        
        const beaconIcon = L.divIcon({
            className: 'kaiku-beacon-marker',
            html: `
              <div class="beacon-radar"></div>
              <div class="beacon-core"></div>
              <div class="beacon-label">${beacon.count}</div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });

        return (
           <Marker 
             key={`beacon-${beacon.id}`}
             position={[beacon.center.lat, beacon.center.lng]}
             icon={beaconIcon}
             eventHandlers={{
                click: (e) => {
                    L.DomEvent.stopPropagation(e);
                    if(onClusterClick) onClusterClick(beacon.messages);
                }
             }}
           />
        );
      })}
    </>
  );
};

// ----------------------------------------------------------------------
// MAP LOGIC
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
  
  // Calculate Aggregations
  // 1. City Level (Zoom Out)
  const cityHubs = useMemo(() => aggregateMessagesByCity(messages), [messages]);
  // 2. District Level (Zoom In) - Snapped Grid
  const districtBeacons = useMemo(() => aggregateMessagesByDistrict(messages), [messages]);

  // Threshold for switching views
  const ZOOM_THRESHOLD = 10;
  const isCityView = zoom < ZOOM_THRESHOLD;

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

        {isCityView ? (
             <CityHubLayer 
                hubs={cityHubs} 
                onClusterClick={onClusterClick}
            />
        ) : (
            <DistrictBeaconLayer 
                beacons={districtBeacons}
                onClusterClick={onClusterClick}
            />
        )}
        
      </MapContainer>
    </div>
  );
};

export default ChatMap;