import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMessageClick: (msg: ChatMessage) => void;
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

  // Initial load
  useEffect(() => {
    map.invalidateSize();
    const bounds = map.getBounds();
    onViewportChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom()
    });
  }, [map, onViewportChange]);

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

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onMessageClick }) => {
  // Lock the map to the "real" world coordinates to prevent scrolling into the void.
  // Latitude is capped at +/- 85 because Web Mercator projection distorts infinitely at the poles.
  const maxBounds = new L.LatLngBounds(
    new L.LatLng(-85, -180), // South West
    new L.LatLng(85, 180)    // North East
  );

  return (
    <div className="fixed inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[20, 0]}
        zoom={3}
        minZoom={2.5}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ background: '#0a0a12' }}
        maxBounds={maxBounds}
        maxBoundsViscosity={1.0} // Creates a "hard wall" effect
      >
        <TileLayer 
            url={MAP_TILE_URL} 
            attribution={MAP_ATTRIBUTION} 
            noWrap={true} // Prevents the map from repeating horizontally
        />
        
        <MapEvents onViewportChange={onViewportChange} />

        <ActivityZones messages={messages} />

      </MapContainer>
    </div>
  );
};

export default ChatMap;