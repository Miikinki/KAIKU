import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import { aggregateMessagesByHexagon, getHexagonForLocation } from '../services/h3Helpers';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMessageClick: (msg: ChatMessage) => void;
  onClusterClick?: (messages: ChatMessage[]) => void;
  lastNewMessage: ChatMessage | null;
}

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

    setTimeout(handleResize, 100);
    setTimeout(handleResize, 500);

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

// H3 Hexagon Heatmap Layer
const HexagonHeatmapLayer: React.FC<{
  messages: ChatMessage[];
  onHexClick: (messages: ChatMessage[]) => void;
  lastNewMessage: ChatMessage | null;
}> = ({ messages, onHexClick, lastNewMessage }) => {
  
  const hexagons = useMemo(() => aggregateMessagesByHexagon(messages), [messages]);
  const [flashingHex, setFlashingHex] = useState<string | null>(null);

  // Pulse Logic: When a new message comes in, find its H3 cell and flash it
  useEffect(() => {
    if (!lastNewMessage) return;

    const hexId = getHexagonForLocation(lastNewMessage.location.lat, lastNewMessage.location.lng);
    setFlashingHex(hexId);

    // Instant flash ON, then fade OUT
    const timer = setTimeout(() => {
        setFlashingHex(null); // Removes the 'flash' class, triggering CSS transition decay
    }, 150); // Short duration for the "Hit"

    return () => clearTimeout(timer);
  }, [lastNewMessage]);

  return (
    <>
      {hexagons.map((hex) => {
        const isFlashing = hex.h3Index === flashingHex;
        
        // Calculate density-based fill opacity (0.1 to 0.4)
        // Cap count effect at 20 messages for visual consistency
        const density = Math.min(hex.count, 20) / 20;
        const fillOpacity = 0.1 + (density * 0.3);

        return (
          <Polygon
            key={hex.h3Index}
            positions={hex.boundary}
            pathOptions={{
              color: '#00FFFF', // Neon Cyan Stroke
              weight: 2,
              opacity: 1,
              fillColor: '#00FFFF', // Cyan Fill
              fillOpacity: fillOpacity,
              className: isFlashing ? 'neon-hex neon-hex-flash' : 'neon-hex', // CSS handles animation
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onHexClick(hex.messages);
              },
              mouseover: (e) => {
                const layer = e.target;
                layer.setStyle({ fillOpacity: 0.5 }); // Hover highlight
              },
              mouseout: (e) => {
                const layer = e.target;
                layer.setStyle({ fillOpacity: fillOpacity }); // Reset
              }
            }}
          />
        );
      })}
    </>
  );
};

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onMessageClick, onClusterClick, lastNewMessage }) => {
  return (
    <div className="absolute inset-0 z-0 bg-[#0a0a12]">
      <MapContainer
        center={[20, 0]}
        zoom={2.5}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', background: '#0a0a12' }}
        minZoom={2}
        worldCopyJump={true} // Infinite scrolling horizontally
        maxBounds={[[-85, -Infinity], [85, Infinity]]} // Restrict vertical scrolling only
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          url={MAP_TILE_URL}
          noWrap={false}
        />

        <MapResizeHandler onViewportChange={onViewportChange} />
        <MapEvents onViewportChange={onViewportChange} />

        <HexagonHeatmapLayer 
            messages={messages} 
            onHexClick={(msgs) => onClusterClick && onClusterClick(msgs)}
            lastNewMessage={lastNewMessage}
        />
        
      </MapContainer>
    </div>
  );
};

export default ChatMap;