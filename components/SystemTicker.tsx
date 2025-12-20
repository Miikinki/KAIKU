import React, { useEffect, useState, useRef } from 'react';
import { ChatMessage } from '../types';
import { supabase } from '../services/supabaseClient';
import { fetchLocalWeather } from '../services/weatherService';
import { getAnonymousID } from '../services/storageService';

interface SystemTickerProps {
  latestMessage: ChatMessage | null;
  totalMessages: number;
  userLocation: { lat: number; lng: number } | null;
}

export const SystemTicker: React.FC<SystemTickerProps> = ({ latestMessage, totalMessages, userLocation }) => {
  const [weatherString, setWeatherString] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [items, setItems] = useState<string[]>([]);
  
  // 1. WEATHER EFFECT
  useEffect(() => {
      if (userLocation) {
          fetchLocalWeather(userLocation.lat, userLocation.lng).then(data => {
              if (data) setWeatherString(data);
          });
      }
  }, [userLocation?.lat, userLocation?.lng]); // Only re-run if location changes significantly

  // 2. SUPABASE PRESENCE (Active Agents)
  useEffect(() => {
      const myId = getAnonymousID();
      const channel = supabase.channel('kaiku_global_presence');

      // Track presence
      channel
          .on('presence', { event: 'sync' }, () => {
              const state = channel.presenceState();
              // Iterate through state values (which are arrays of presence objects)
              // to count total connected clients
              let total = 0;
              for (const key in state) {
                  total += state[key].length;
              }
              // Ensure we count ourselves even if sync is delayed
              setOnlineCount(Math.max(1, total));
          })
          .on('presence', { event: 'join' }, ({ newPresences }) => {
              setOnlineCount(prev => prev + newPresences.length);
          })
          .on('presence', { event: 'leave' }, ({ leftPresences }) => {
              setOnlineCount(prev => Math.max(1, prev - leftPresences.length));
          })
          .subscribe(async (status) => {
              if (status === 'SUBSCRIBED') {
                  try {
                      await channel.track({ 
                          online_at: new Date().toISOString(),
                          user_id: myId
                      });
                  } catch(e) {
                      // Silently fail if Realtime quotas exceeded or not enabled
                  }
              }
          });

      return () => {
          supabase.removeChannel(channel);
      };
  }, []);

  // 3. BUILD TICKER CONTENT
  useEffect(() => {
      const parts = [
          "SYSTEM: ONLINE", 
          "ENCRYPTION: AES-256",
      ];

      // Real User Count
      parts.push(`👥 ACTIVE AGENTS: ${onlineCount}`);

      // Real Weather
      if (weatherString) {
          parts.push(weatherString);
      }

      // Latest Intel
      if (latestMessage) {
          const loc = latestMessage.city || "UNKNOWN SECTOR";
          const snippet = latestMessage.text.slice(0, 40).replace(/\n/g, ' ');
          parts.push(`📡 LATEST INTEL: ${snippet.toUpperCase()} [${loc.toUpperCase()}]`);
      } else {
          parts.push("SCANNING FREQUENCIES...");
      }

      // Filler to ensure smooth loop
      parts.push(`GRID ACTIVITY: ${totalMessages} SIGNALS`);

      setItems(parts);
  }, [latestMessage, totalMessages, onlineCount, weatherString]);

  return (
    <div className="fixed top-0 left-0 right-0 h-6 bg-black border-b border-white/10 z-[1000] flex items-center overflow-hidden pointer-events-none select-none">
      {/* 
          CSS ANIMATION FIX:
          - Use 'linear' easing for constant speed (no sickness/bouncing).
          - 'will-change-transform' triggers GPU acceleration.
          - Duplicate content logic: We render the list twice.
            The animation moves from 0% to -100% of the *first* list's width.
            Because the lists are identical, it snaps back instantly and invisibly.
      */}
      <style>{`
        @keyframes marquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-100%, 0, 0); }
        }
        .ticker-track {
          display: flex;
          white-space: nowrap;
          will-change: transform;
          animation: marquee 45s linear infinite; 
        }
        /* Pause on hover for readability (optional, disabled for now to keep flow) */
        /* .ticker-wrapper:hover .ticker-track { animation-play-state: paused; } */
      `}</style>
      
      <div className="ticker-wrapper w-full overflow-hidden flex">
          <div className="ticker-track">
              {/* Original List */}
              {items.map((item, i) => (
                  <TickerItem key={`a-${i}`} text={item} />
              ))}
          </div>
          <div className="ticker-track">
              {/* Duplicate List for seamless loop */}
              {items.map((item, i) => (
                  <TickerItem key={`b-${i}`} text={item} />
              ))}
          </div>
      </div>
      
      {/* Vignette effect on sides */}
      <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black to-transparent z-10" />
    </div>
  );
};

const TickerItem: React.FC<{ text: string }> = ({ text }) => (
    <div className="flex items-center px-4">
        <span className="text-[10px] font-mono font-bold text-cyan-500/90 tracking-widest uppercase shadow-cyan-500/20 drop-shadow-[0_0_2px_rgba(6,182,212,0.3)] whitespace-nowrap">
            {text}
        </span>
        <span className="ml-8 text-[8px] text-cyan-900 opacity-50">///</span>
    </div>
);