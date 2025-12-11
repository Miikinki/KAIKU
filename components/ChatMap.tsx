
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap, Tooltip } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION, THEME_COLOR } from '../constants';
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

// --- H3 HEXAGON LAYER ---

const HexagonHeatmapLayer: React.FC<{ 
  messages: ChatMessage[]; 
  onHexClick?: (msgs: ChatMessage[]) => void; 
  lastNewMessage: ChatMessage | null;
}> = ({ messages, onHexClick, lastNewMessage }) => {
  
  // 1. Aggregate Messages into Hexagons
  const hexagons = useMemo(() => {
    return aggregateMessagesByHexagon(messages);
  }, [messages]);

  // 2. Pulse Logic (Neon Border Glow)
  const [flashingHex, setFlashingHex] = useState<string | null>(null);

  useEffect(() => {
    if (lastNewMessage) {
      const h3Index = getHexagonForLocation(lastNewMessage.location.lat, lastNewMessage.location.lng);
      setFlashingHex(h3Index);
      
      // We trigger a very short active state. 
      // When this state clears, the CSS transition handles the slow fade out (decay).
      const timer = setTimeout(() => {
        setFlashingHex(null);
      }, 100); // 100ms active flash

      return () => clearTimeout(timer);
    }
  }, [lastNewMessage]);

  // 3. Render Polygons
  return (
    <>
      {hexagons.map(hex => {
        // Calculate Heatmap Intensity
        // Cap opacity at 0.8 for high density. Base opacity 0.2.
        const density = Math.min(hex.count / 10, 1); 
        const baseOpacity = 0.2 + (density * 0.5);
        
        const isFlashing = hex.h3Index === flashingHex;
        
        // Visual Styles
        // Stroke: Neon Cyan (#00FFFF) when flashing, Theme Color (Cyan-500) normally
        // Weight: 3px when flashing, 1px normally
        // Fill: ALWAYS THEME_COLOR, Opacity ALWAYS based on density (do not flash fill)
        
        const strokeColor = isFlashing ? '#00FFFF' : THEME_COLOR;
        const weight = isFlashing ? 3 : 1;
        const opacity = isFlashing ? 1 : 0.6; // Border opacity
        
        // CSS Transition:
        // isFlashing (true) -> duration-0 (Instant on)
        // isFlashing (false) -> duration-1500 (Slow fade off)
        const transitionClass = isFlashing ? 'transition-all duration-0 ease-out' : 'transition-all duration-[1500ms] ease-out';

        return (
          <Polygon
            key={hex.h3Index}
            positions={hex.boundary}
            pathOptions={{
              color: strokeColor,
              weight: weight,
              opacity: opacity,
              fillColor: THEME_COLOR,
              fillOpacity: baseOpacity,
              className: transitionClass 
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.preventDefault(e.originalEvent);
                L.DomEvent.stopPropagation(e.originalEvent);
                if (onHexClick) onHexClick(hex.messages);
              }
            }}
          >
            {/* Optional Tooltip for count on hover */}
            <Tooltip direction="center" permanent={false} className="bg-transparent border-0 text-white font-bold shadow-none">
              {hex.count}
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
};

const ChatMap: React.FC<ChatMapProps> = ({ messages, onViewportChange, onClusterClick, lastNewMessage }) => {
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
        
        <HexagonHeatmapLayer 
            messages={messages} 
            onHexClick={onClusterClick} 
            lastNewMessage={lastNewMessage}
        />

      </MapContainer>
    </div>
  );
};

export default ChatMap;
