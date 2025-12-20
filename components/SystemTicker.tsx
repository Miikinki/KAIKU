import React, { useEffect, useState } from 'react';
import { ChatMessage } from '../types';

interface SystemTickerProps {
  latestMessage: ChatMessage | null;
  totalMessages: number;
}

const STATIC_MESSAGES = [
  "SYSTEM ONLINE",
  "ENCRYPTION: AES-256",
  "GHOST PROTOCOL: ACTIVE",
  "SCANNING FREQUENCIES...",
  "UPLINK ESTABLISHED",
  "DATA STREAM: STABLE",
  "SOLAR WIND: NORMAL",
  "SECTOR SCAN: AUTOMATED",
  "LATENCY: 12ms",
  "MEMORY INTEGRITY: 100%"
];

export const SystemTicker: React.FC<SystemTickerProps> = ({ latestMessage, totalMessages }) => {
  const [items, setItems] = useState<string[]>(STATIC_MESSAGES);

  useEffect(() => {
    const dynamic = [...STATIC_MESSAGES];
    
    if (totalMessages > 0) {
      dynamic.splice(2, 0, `GRID ACTIVITY: ${totalMessages} SIGNALS`);
    }
    
    if (latestMessage) {
      const loc = latestMessage.city || "UNKNOWN SECTOR";
      dynamic.splice(5, 0, `📡 LATEST INTERCEPT: ${loc.toUpperCase()}`);
    }

    setItems(dynamic);
  }, [latestMessage, totalMessages]);

  return (
    <div className="fixed top-0 left-0 right-0 h-6 bg-black border-b border-white/10 z-[1000] flex items-center overflow-hidden pointer-events-none select-none">
      {/* Inline styles for marquee animation */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee-infinite {
          animation: marquee 60s linear infinite;
          width: max-content;
        }
      `}</style>
      
      <div className="flex whitespace-nowrap animate-marquee-infinite">
        {/* Render 4x to ensure seamless loop on wide screens */}
        {[...items, ...items, ...items, ...items].map((item, i) => (
          <div key={i} className="flex items-center mx-4">
            <span className="text-[10px] font-mono font-bold text-cyan-500/80 tracking-widest uppercase shadow-cyan-500/20 drop-shadow-[0_0_2px_rgba(6,182,212,0.3)]">
              {item}
            </span>
            <span className="ml-8 text-[8px] text-cyan-900 opacity-50">///</span>
          </div>
        ))}
      </div>
      
      {/* Vignette effect on sides */}
      <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black to-transparent z-10" />
    </div>
  );
};
