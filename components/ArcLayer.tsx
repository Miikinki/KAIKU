import React, { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { ChatMessage } from '../types';
import { COUNTRY_COORDINATES, THEME_COLOR_GLOW } from '../constants';

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
  
  // Ref for cleanup to avoid setting state on unmounted component
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    const newArcs: ActiveArc[] = [];
    const now = Date.now();

    // 1. Filter for RECENT remote messages
    // Only animate messages younger than 10 seconds (for real-time feel)
    // Or, on initial load, maybe allow the last 5 to animate so it's not empty.
    const recentMessages = messages.filter(m => {
        // Only process if we haven't seen this ID yet
        if (processedIds.current.has(m.id)) return false;
        
        // Mark as processed immediately
        processedIds.current.add(m.id);

        // Check conditions: Remote + Valid Country Origin
        return m.isRemote && m.originCountry && COUNTRY_COORDINATES[m.originCountry];
    });

    // 2. Limit the batch to prevent explosion on first load
    // We take the last 5 "new" ones (if bulk loaded)
    const batch = recentMessages.slice(0, 5);

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
        setActiveArcs(prev => [...prev, ...newArcs]);

        // Schedule cleanup: The animation is 2.5s long in CSS.
        // We remove them from React state after 3s to be safe.
        setTimeout(() => {
            if (!isMounted.current) return;
            
            // Remove the specific IDs we just added
            const idsToRemove = new Set(newArcs.map(a => a.id));
            setActiveArcs(prev => prev.filter(arc => !idsToRemove.has(arc.id)));
        }, 3000);
    }

  }, [messages]);

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
            zIndex: 400 
        }}
    >
        <defs>
            <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: THEME_COLOR_GLOW, stopOpacity: 0 }} />
                <stop offset="50%" style={{ stopColor: '#ffffff', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: THEME_COLOR_GLOW, stopOpacity: 0 }} />
            </linearGradient>
             <filter id="arc-glow">
                <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        </defs>
        {activeArcs.map(arc => {
            // Calculate Path Projection on every render (cheap for < 10 items)
            const startPoint = map.latLngToContainerPoint(arc.origin);
            const endPoint = map.latLngToContainerPoint(arc.target);

            const midX = (startPoint.x + endPoint.x) / 2;
            const midY = (startPoint.y + endPoint.y) / 2;
            
            const dist = Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2));
            const curvature = 0.25; 
            
            // Arc logic:
            // We want the arc to always bow "upwards" relative to the map (negative Y),
            // OR simply perpendicular. Let's do simple vertical lob for global feel.
            const cpX = midX;
            const cpY = midY - (dist * curvature);

            const d = `M ${startPoint.x},${startPoint.y} Q ${cpX},${cpY} ${endPoint.x},${endPoint.y}`;

            return (
                <path
                    key={arc.id}
                    d={d}
                    fill="none"
                    stroke="url(#arc-grad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    filter="url(#arc-glow)"
                    className="kaiku-arc-path"
                />
            );
        })}
    </svg>
  );
};

export default ArcLayer;