import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import { COUNTRY_COORDINATES, THEME_COLOR_GLOW } from '../constants';
import { getAnonymousID } from '../services/storageService';

interface ArcLayerProps {
  messages: ChatMessage[]; // Represents the Signal Queue
}

interface ActiveArc {
  id: string; 
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

  // 1. HANDLE NEW SIGNALS ONLY
  // Strictly visualizes new events exactly once.
  useEffect(() => {
    const newArcs: ActiveArc[] = [];
    const now = Date.now();
    const mySessionId = getAnonymousID();

    const newSignals = messages.filter(m => {
        // Prevent re-animating the same signal ID
        if (processedIds.current.has(m.id)) return false;
        
        processedIds.current.add(m.id);

        // Strict validation: 
        // 1. Must be a reply (parentId exists)
        // 2. Must be remote OR have a custom/precise origin
        if (!m.parentId) return false;
        if (!m.isRemote && !m.customOrigin && !m.preciseOrigin) return false;

        // DUPLICATE PREVENTION:
        // If this is a server message (has ID, no customOrigin) from ME,
        // we ignore it because the Local Echo (tempSignal) already handled the visual.
        // This prevents double-arcs for the sender.
        if (m.sessionId === mySessionId && !m.customOrigin) return false;

        return true;
    });

    newSignals.forEach(msg => {
       let origin: [number, number] | undefined;

       // PRIORITY 1: User's own reply (Precise Local Echo)
       if (msg.customOrigin) {
           origin = [msg.customOrigin.lat, msg.customOrigin.lng];
       } 
       // PRIORITY 2: Metadata Origin (Precise Remote Arc for Everyone)
       else if (msg.preciseOrigin) {
           origin = [msg.preciseOrigin.lat, msg.preciseOrigin.lng];
       }
       // PRIORITY 3: Country Fallback (Legacy)
       else if (msg.originCountry && COUNTRY_COORDINATES[msg.originCountry]) {
           origin = COUNTRY_COORDINATES[msg.originCountry];
       }

       if (!origin) return;

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

  const addArcs = (arcs: ActiveArc[]) => {
      setActiveArcs(prev => [...prev, ...arcs]);

      // Remove the arc strictly after animation finishes (2.5s CSS animation + buffer)
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
            zIndex: 550, 
            overflow: 'visible' 
        }}
    >
        <defs>
            <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: THEME_COLOR_GLOW, stopOpacity: 0 }} />
                <stop offset="50%" style={{ stopColor: '#ffffff', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: THEME_COLOR_GLOW, stopOpacity: 0 }} />
            </linearGradient>
             <filter id="arc-glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
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
                
                const curvature = 0.4;
                const cpX = midX;
                const cpY = midY - (dist * curvature);

                const d = `M ${startPoint.x},${startPoint.y} Q ${cpX},${cpY} ${endPoint.x},${endPoint.y}`;

                return (
                    <g key={arc.id}>
                        {/* Clean Line Only - No Circles */}
                        <path
                            d={d}
                            fill="none"
                            stroke="url(#arc-grad)"
                            strokeWidth="3" 
                            strokeLinecap="round"
                            strokeDasharray="2000" // Long dasharray to support animation
                            filter="url(#arc-glow)"
                            className="kaiku-arc-path"
                        />
                    </g>
                );
            } catch(e) {
                return null;
            }
        })}
    </svg>
  );
};

export default ArcLayer;