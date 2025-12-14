import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import { COUNTRY_COORDINATES, THEME_COLOR_GLOW } from '../constants';
import { getAnonymousID } from '../services/storageService';

interface ArcLayerProps {
  messages: ChatMessage[]; 
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

  useEffect(() => {
    const newArcs: ActiveArc[] = [];
    const now = Date.now();
    const mySessionId = getAnonymousID();

    const newSignals = messages.filter(m => {
        if (processedIds.current.has(m.id)) return false;
        processedIds.current.add(m.id);

        if (!m.parentId) return false;
        // Must be remote OR have precise origin info
        if (!m.isRemote && !m.customOrigin && !m.preciseOrigin) return false;

        // FILTER DUPLICATES FOR SENDER:
        // If it's MY message coming from server (sessionId match)
        // AND it doesn't have customOrigin (meaning it's the server echo, not local)
        // AND I already showed the local echo...
        // Actually, with preciseOrigin, the server echo is MORE accurate than the country fallback.
        // But to avoid a visual "double flash" if the local echo is still playing, we might filter.
        // However, if the local echo finished, we might want to show this? 
        // For simplicity: If it's me, and no customOrigin, skip it to rely on the instant local feedback only.
        if (m.sessionId === mySessionId && !m.customOrigin) return false;

        return true;
    });

    newSignals.forEach(msg => {
       let origin: [number, number] | undefined;

       // 1. Precise Origin (From hidden tags - Works for everyone)
       if (msg.preciseOrigin) {
           origin = [msg.preciseOrigin.lat, msg.preciseOrigin.lng];
       }
       // 2. Custom Origin (Local Echo - Works for sender)
       else if (msg.customOrigin) {
           origin = [msg.customOrigin.lat, msg.customOrigin.lng];
       } 
       // 3. Country Fallback (Only for very old messages without tags)
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
        setActiveArcs(prev => [...prev, ...newArcs]);
        setTimeout(() => {
            if (!isMounted.current) return;
            const idsToRemove = new Set(newArcs.map(a => a.id));
            setActiveArcs(prev => prev.filter(arc => !idsToRemove.has(arc.id)));
        }, 3000); 
    }
  }, [messages]);

  // Re-render on map move
  const [, setFrame] = useState(0);
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
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
            pointerEvents: 'none', zIndex: 550, overflow: 'visible' 
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
                
                // Skip if off-screen/invalid
                if (startPoint.x === endPoint.x && startPoint.y === endPoint.y) return null;

                const midX = (startPoint.x + endPoint.x) / 2;
                const midY = (startPoint.y + endPoint.y) / 2;
                const dist = Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2));
                
                const curvature = 0.4;
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
                        strokeDasharray="2000"
                        filter="url(#arc-glow)"
                        className="kaiku-arc-path"
                    />
                );
            } catch(e) { return null; }
        })}
    </svg>
  );
};

export default ArcLayer;