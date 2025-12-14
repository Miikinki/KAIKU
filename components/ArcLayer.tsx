import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import { COUNTRY_COORDINATES, THEME_COLOR_GLOW } from '../constants';

interface ArcLayerProps {
  messages: ChatMessage[]; // Now receives "Signals" (replies/events) instead of root messages
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
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // 1. HANDLE NEW SIGNALS (Replies Only)
  useEffect(() => {
    const newArcs: ActiveArc[] = [];
    const now = Date.now();

    // The 'messages' prop here now represents the SIGNAL QUEUE from App.tsx
    // It contains incoming remote replies AND local echo replies.
    const newSignals = messages.filter(m => {
        // Skip if already drawn
        if (processedIds.current.has(m.id)) return false;
        
        processedIds.current.add(m.id);

        // REQUIREMENT: Must be a REPLY (parentId exists)
        if (!m.parentId) return false;

        // REQUIREMENT: Must be REMOTE (or have explicit custom origin)
        if (!m.isRemote && !m.customOrigin) return false;

        return true;
    });

    newSignals.forEach(msg => {
       let origin: [number, number] | undefined;

       // 1. PRIORITY: Custom Origin (For "My" messages - precise Porvoo -> Paris)
       if (msg.customOrigin) {
           origin = [msg.customOrigin.lat, msg.customOrigin.lng];
       } 
       // 2. FALLBACK: Country Center (For others' messages)
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

  // 2. AMBIENT REPLAY (Strictly Replies)
  useEffect(() => {
      const interval = setInterval(() => {
          if (!isMounted.current) return;

          // Only replay messages that are actually REPLIES and REMOTE
          const candidates = messages.filter(m => 
             m.parentId && 
             (m.isRemote || m.customOrigin) &&
             (m.customOrigin || (m.originCountry && COUNTRY_COORDINATES[m.originCountry]))
          );
          
          if (candidates.length > 0) {
               const randomMsg = candidates[Math.floor(Math.random() * candidates.length)];
               
               let origin: [number, number] = [0,0];
               if (randomMsg.customOrigin) {
                   origin = [randomMsg.customOrigin.lat, randomMsg.customOrigin.lng];
               } else if (randomMsg.originCountry) {
                   origin = COUNTRY_COORDINATES[randomMsg.originCountry];
               }

               const target: [number, number] = [randomMsg.location.lat, randomMsg.location.lng];
               const replayId = `${randomMsg.id}-replay-${Date.now()}`;
               
               if (activeArcs.length < 3) {
                   addArcs([{
                       id: replayId,
                       origin,
                       target,
                       startTime: Date.now()
                   }]);
               }
          }
      }, 4000); 

      return () => clearInterval(interval);
  }, [messages, activeArcs.length]); 

  const addArcs = (arcs: ActiveArc[]) => {
      setActiveArcs(prev => [...prev, ...arcs]);
      setTimeout(() => {
          if (!isMounted.current) return;
          const idsToRemove = new Set(arcs.map(a => a.id));
          setActiveArcs(prev => prev.filter(arc => !idsToRemove.has(arc.id)));
      }, 3000); 
  };

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
                         <circle 
                            cx={startPoint.x} 
                            cy={startPoint.y} 
                            r="3" 
                            fill={THEME_COLOR_GLOW}
                            className="animate-[ping_1s_cubic-bezier(0,0,0.2,1)_infinite]"
                            style={{ opacity: 0.8 }}
                         />
                        <path
                            d={d}
                            fill="none"
                            stroke="url(#arc-grad)"
                            strokeWidth="3" 
                            strokeLinecap="round"
                            strokeDasharray="2000" 
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