import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import { COUNTRY_COORDINATES, THEME_COLOR_GLOW } from '../constants';

interface ArcLayerProps {
  messages: ChatMessage[];
}

interface ActiveArc {
  id: string; // Message ID (or pseudo-ID for replays)
  origin: [number, number];
  target: [number, number];
  startTime: number;
}

const ArcLayer: React.FC<ArcLayerProps> = ({ messages }) => {
  const map = useMap();
  const [activeArcs, setActiveArcs] = useState<ActiveArc[]>([]);
  const processedIds = useRef<Set<string>>(new Set());
  
  // Ref for cleanup to avoid setting state on unmounted component
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // 1. HANDLE NEW INCOMING MESSAGES
  useEffect(() => {
    const newArcs: ActiveArc[] = [];
    const now = Date.now();

    // Filter for RECENT remote messages that we haven't animated yet
    const newRemoteMessages = messages.filter(m => {
        if (processedIds.current.has(m.id)) return false;
        
        // Mark as processed immediately so we don't animate again in this block
        processedIds.current.add(m.id);

        // Strict validation: Must be remote, have origin country and known coordinates
        return m.isRemote && m.originCountry && COUNTRY_COORDINATES[m.originCountry];
    });

    // Limit initial burst to avoids chaos on page load
    const batch = newRemoteMessages.slice(0, 5);

    batch.forEach(msg => {
       const origin = COUNTRY_COORDINATES[msg.originCountry!];
       const target: [number, number] = [msg.location.lat, msg.location.lng];
       
       newArcs.push({
           id: msg.id,
           origin,
           target,
           startTime: now
       });
    });

    if (newArcs.length > 0) {
        addArcs(newArcs);
    }
  }, [messages]);

  // 2. AMBIENT REPLAY LOOP (Strictly Real Data)
  useEffect(() => {
      // Run periodically to keep the map feeling alive with valid data
      const interval = setInterval(() => {
          if (!isMounted.current) return;

          const candidates = messages.filter(m => 
            m.isRemote && m.originCountry && COUNTRY_COORDINATES[m.originCountry]
          );
          
          if (candidates.length > 0) {
               // Pick a random REAL message to replay
               const randomMsg = candidates[Math.floor(Math.random() * candidates.length)];
               const origin = COUNTRY_COORDINATES[randomMsg.originCountry!];
               const target: [number, number] = [randomMsg.location.lat, randomMsg.location.lng];
               
               // Unique ID for this replay instance
               const replayId = `${randomMsg.id}-replay-${Date.now()}`;
               
               addArcs([{
                   id: replayId,
                   origin,
                   target,
                   startTime: Date.now()
               }]);
          }
          // NOTE: Simulation/Random mode removed to ensure accuracy.
          // Only actual message paths are visualized.

      }, 2500); // Frequency: Every 2.5 seconds

      return () => clearInterval(interval);
  }, [messages, activeArcs.length]); 

  const addArcs = (arcs: ActiveArc[]) => {
      setActiveArcs(prev => [...prev, ...arcs]);

      // Schedule removal matching CSS animation time
      setTimeout(() => {
          if (!isMounted.current) return;
          const idsToRemove = new Set(arcs.map(a => a.id));
          setActiveArcs(prev => prev.filter(arc => !idsToRemove.has(arc.id)));
      }, 3000); 
  };

  // Re-render trigger for map moves
  const [frame, setFrame] = useState(0);
  useEffect(() => {
      const handler = () => setFrame(f => f + 1);
      map.on('move', handler);
      map.on('zoom', handler);
      return () => {
          map.off('move', handler);
          map.off('zoom', handler);
      };
  }, [map]);

  if (activeArcs.length === 0) return null;

  return (
    <svg 
        className="leaflet-zoom-hide"
        style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%', 
            pointerEvents: 'none', 
            zIndex: 550, // High Z-Index to stay on top
            overflow: 'visible' // Allow arcs to curve outside viewport
        }}
    >
        <defs>
            <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: THEME_COLOR_GLOW, stopOpacity: 0 }} />
                <stop offset="50%" style={{ stopColor: '#ffffff', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: THEME_COLOR_GLOW, stopOpacity: 0 }} />
            </linearGradient>
             <filter id="arc-glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        </defs>
        {activeArcs.map(arc => {
            try {
                const startPoint = map.latLngToContainerPoint(arc.origin);
                const endPoint = map.latLngToContainerPoint(arc.target);

                if (startPoint.x === endPoint.x && startPoint.y === endPoint.y) return null;

                const midX = (startPoint.x + endPoint.x) / 2;
                const midY = (startPoint.y + endPoint.y) / 2;
                
                const dist = Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2));
                
                // Consistent curvature
                const curvature = 0.4;
                
                // Arc always bows "up" relative to screen Y
                const cpX = midX;
                const cpY = midY - (dist * curvature);

                const d = `M ${startPoint.x},${startPoint.y} Q ${cpX},${cpY} ${endPoint.x},${endPoint.y}`;

                return (
                    <path
                        key={arc.id}
                        d={d}
                        fill="none"
                        stroke="url(#arc-grad)"
                        strokeWidth="3" 
                        strokeLinecap="round"
                        filter="url(#arc-glow)"
                        className="kaiku-arc-path"
                    />
                );
            } catch(e) {
                return null;
            }
        })}
    </svg>
  );
};

export default ArcLayer;