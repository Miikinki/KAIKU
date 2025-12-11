import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Circle, useMapEvents, useMap, Marker } from 'react-leaflet';
import * as L from 'leaflet';
import { ChatMessage, ViewportBounds } from '../types';
import { MAP_TILE_URL, MAP_ATTRIBUTION } from '../constants';
import { aggregateMessagesByHexagon, getHexagonForLocation, HexagonData, getH3Resolution } from '../services/h3Helpers';

interface ChatMapProps {
  messages: ChatMessage[];
  onViewportChange: (bounds: ViewportBounds) => void;
  onMessageClick: (msg: ChatMessage) => void;
  onClusterClick?: (messages: ChatMessage[]) => void;
  lastNewMessage: ChatMessage | null;
}

// ----------------------------------------------------------------------
// 0. MAP DEFS (SVG Gradients)
// ----------------------------------------------------------------------
const MapDefs: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const svg = map.getPanes().overlayPane.querySelector('svg');
    if (!svg || svg.querySelector('#kaiku-defs')) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.id = 'kaiku-defs';

    // Helper: Radial Gradient for Aura
    const createRadial = (id: string, color: string, stop1: number, stop2: number) => {
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      grad.setAttribute('id', id);
      grad.setAttribute('cx', '50%');
      grad.setAttribute('cy', '50%');
      grad.setAttribute('r', '50%');
      const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s1.setAttribute('offset', '0%');
      s1.setAttribute('stop-color', '#fff'); // Hot core
      s1.setAttribute('stop-opacity', stop1.toString());
      const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s2.setAttribute('offset', '100%');
      s2.setAttribute('stop-color', color);
      s2.setAttribute('stop-opacity', stop2.toString());
      grad.appendChild(s1);
      grad.appendChild(s2);
      return grad;
    };

    defs.appendChild(createRadial('aura-grad-1', '#00C8D6', 0.4, 0.0));
    defs.appendChild(createRadial('aura-grad-2', '#00C8D6', 0.6, 0.1));
    defs.appendChild(createRadial('aura-grad-3', '#00FFFF', 0.8, 0.2));
    defs.appendChild(createRadial('aura-grad-4', '#00FFFF', 1.0, 0.3));

    svg.prepend(defs);
  }, [map]);
  return null;
};

// ----------------------------------------------------------------------
// 1. LAYER: HEAT CLOUD (Atmosphere)
// ----------------------------------------------------------------------
const HeatCloudLayer: React.FC<{ hexagons: HexagonData[]; zoom: number }> = ({ hexagons, zoom }) => {
  if (zoom < 4) return null; // Hide at global view for performance

  // Adjust radius based on zoom/res to prevent overlapping blobs being too huge
  let baseRadius = 8000;
  if (zoom > 11) baseRadius = 250;
  else if (zoom >= 8) baseRadius = 2000;

  return (
    <>
      {hexagons.map(hex => {
        // Only significant clusters get atmosphere
        if (hex.count < 3) return null;
        
        const radius = hex.count > 20 ? baseRadius * 1.5 : baseRadius; 

        return (
          <Circle
            key={`cloud-${hex.h3Index}`}
            center={hex.center}
            radius={radius}
            pathOptions={{
              stroke: false,
              fillColor: '#00FFFF',
              fillOpacity: 0.15,
              className: 'kaiku-cloud-blob' // Heavy blur applied via CSS
            }}
          />
        );
      })}
    </>
  );
};

// ----------------------------------------------------------------------
// 2. LAYER: AURA (Visuals & Animations)
// ----------------------------------------------------------------------
const AuraLayer: React.FC<{ 
  hexagons: HexagonData[]; 
  zoom: number; 
  lastNewMessage: ChatMessage | null;
  resolution: number;
}> = ({ hexagons, zoom, lastNewMessage, resolution }) => {
  
  const [flashingHex, setFlashingHex] = useState<string | null>(null);

  useEffect(() => {
    if (!lastNewMessage) return;
    const hexId = getHexagonForLocation(lastNewMessage.location.lat, lastNewMessage.location.lng, resolution);
    setFlashingHex(hexId);
    const timer = setTimeout(() => setFlashingHex(null), 500); // 500ms flash
    return () => clearTimeout(timer);
  }, [lastNewMessage, resolution]);

  if (zoom < 6) return null; // Simplified view at low zoom

  const getLevel = (count: number) => {
    if (count >= 25) return 4;
    if (count >= 10) return 3;
    if (count >= 3) return 2;
    return 1;
  };

  return (
    <>
      {hexagons.map(hex => {
        const level = getLevel(hex.count);
        const isFlashing = hex.h3Index === flashingHex;
        
        // Construct CSS classes
        let classes = `kaiku-aura aura-level-${level}`;
        if (isFlashing) classes += ' aura-flash-active';

        return (
          <Polygon
            key={`aura-${hex.h3Index}`}
            positions={hex.boundary}
            pathOptions={{
              stroke: false,
              fillColor: `url(#aura-grad-${level})`, // Use SVG Gradient
              fillOpacity: 1, // Controlled by gradient
              className: classes,
            }}
          />
        );
      })}
    </>
  );
};

// ----------------------------------------------------------------------
// 3. LAYER: ACTIVE HEXAGON GRID (Top Layer)
// ----------------------------------------------------------------------
const ActiveHexagonLayer: React.FC<{ 
  hexagons: HexagonData[]; 
  zoom: number;
  onHexClick: (messages: ChatMessage[]) => void 
}> = ({ hexagons, zoom, onHexClick }) => {
  
  const now = Date.now();
  const isBeaconMode = zoom < 8; // Switch to Beacon Dots if zoomed out

  return (
    <>
      {hexagons.map(hex => {
        // Dynamic Styles based on Count
        let color = '#06b6d4'; // Cyan (Low)
        let fillOpacity = 0.1;
        let weight = 1;
        let className = 'kaiku-interactive'; // Base class for hover effects

        if (hex.count > 20) {
          color = '#ec4899'; // Pink/White (High)
          fillOpacity = 0.3;
          weight = 2;
        } else if (hex.count > 5) {
          color = '#22d3ee'; // Bright Cyan (Med)
          fillOpacity = 0.2;
          weight = 1.5;
        }

        // Live Logic (Last 60 seconds) or Hotspot
        const isFresh = (now - hex.latestTimestamp) < 60000;
        const isHot = hex.count > 10;
        const showShockwave = isFresh || isHot;

        // Shockwave Marker
        const shockwaveIcon = L.divIcon({
            className: '', // Inner HTML handles the class
            html: `<div style="width: 100%; height: 100%;" class="kaiku-shockwave-marker"></div>`,
            iconSize: [60, 60], 
            iconAnchor: [30, 30] 
        });

        if (isBeaconMode) {
             // BEACON MODE (Zoom < 8): Glowing Dots
             const beaconIcon = L.divIcon({
                className: '',
                html: `<div class="kaiku-beacon-dot"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
             });

             return (
                <React.Fragment key={`beacon-${hex.h3Index}`}>
                   {/* Optional: Show shockwave behind beacon if active */}
                   {showShockwave && (
                     <Marker position={hex.center} icon={shockwaveIcon} zIndexOffset={-100} interactive={false} />
                   )}
                   
                   {/* The Beacon Dot */}
                   <Marker 
                     position={hex.center}
                     icon={beaconIcon}
                     eventHandlers={{
                         click: (e) => {
                             L.DomEvent.stopPropagation(e);
                             onHexClick(hex.messages);
                         }
                     }}
                   />
                </React.Fragment>
             );

        } else {
            // HEXAGON MODE (Zoom >= 8): Polygons + Numbers
            
            // Label Icon (Reactor Core)
            const icon = L.divIcon({
                className: 'kaiku-hex-label-container',
                html: `<div class="kaiku-hex-label" style="text-shadow: 0 0 5px ${color};">${hex.count}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15] // Center over center point
            });

            return (
              <React.Fragment key={`active-hex-${hex.h3Index}`}>
                 {/* Shockwave for activity */}
                 {showShockwave && (
                     <Marker position={hex.center} icon={shockwaveIcon} zIndexOffset={-100} interactive={false} />
                 )}

                 {/* The Hexagon Shape */}
                 <Polygon
                    positions={hex.boundary}
                    pathOptions={{
                      color: color,
                      weight: weight,
                      opacity: 0.8,
                      fillColor: color,
                      fillOpacity: fillOpacity,
                      className: className
                    }}
                    eventHandlers={{
                      click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        onHexClick(hex.messages);
                      }
                    }}
                 />
                 
                 {/* The Count Marker (Label) */}
                 <Marker 
                    position={hex.center} 
                    icon={icon}
                    eventHandlers={{
                        click: (e) => {
                            L.DomEvent.stopPropagation(e);
                            onHexClick(hex.messages);
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
  
  // Calculate Dynamic Resolution
  const resolution = useMemo(() => getH3Resolution(zoom), [zoom]);
  
  // Re-aggregate messages when messages OR zoom level (resolution) changes
  const hexagons = useMemo(() => aggregateMessagesByHexagon(messages, resolution), [messages, resolution]);

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

        <MapDefs />
        <MapController onZoomChange={setZoom} />
        <MapResizeHandler onViewportChange={onViewportChange} />

        {/* LAYER 1: ATMOSPHERE (Scaled by Zoom) */}
        <HeatCloudLayer hexagons={hexagons} zoom={zoom} />

        {/* LAYER 2: AURA & ANIMATIONS - Only active in Hexagon mode or selectively in Beacon mode */}
        {! (zoom < 8) && (
            <AuraLayer hexagons={hexagons} zoom={zoom} lastNewMessage={lastNewMessage} resolution={resolution} />
        )}

        {/* LAYER 3: ACTIVE DATA REACTORS (Grid + Labels OR Beacons) */}
        <ActiveHexagonLayer hexagons={hexagons} zoom={zoom} onHexClick={(msgs) => onClusterClick && onClusterClick(msgs)} />
        
      </MapContainer>
    </div>
  );
};

export default ChatMap;