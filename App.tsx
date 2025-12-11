import React, { useState, useEffect, useRef } from 'react';
import { Plus, Radio } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, getRandomLocation, castVote, getAnonymousID } from './services/storageService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence } from 'framer-motion';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false); // Default to CLOSED
  const [activeThread, setActiveThread] = useState<ChatMessage | null>(null);
  const [currentBounds, setCurrentBounds] = useState<ViewportBounds | null>(null);
  
  // Track the most recent incoming message for map pulse animation
  const [lastNewMessage, setLastNewMessage] = useState<ChatMessage | null>(null);
  
  // Cache for GPS location to solve "Cold Start" issues on mobile
  const locationCache = useRef<{lat: number, lng: number} | null>(null);

  const [rateLimit, setRateLimit] = useState<{ isLimited: boolean; cooldownUntil: number | null }>({
    isLimited: false,
    cooldownUntil: null
  });

  const loadData = async () => {
      const data = await fetchMessages(true);
      setMessages(data);
      setRateLimit(await getRateLimitStatus());
  };

  // GPS Warm-up Effect: Triggers immediately when Input Modal opens
  useEffect(() => {
    if (isInputOpen) {
      console.log("KAIKU: Warming up GPS...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log("KAIKU: GPS Locked via Warm-up", pos.coords);
          locationCache.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        },
        (err) => {
          console.warn("KAIKU: GPS Warm-up failed (will try again on send)", err);
        },
        { 
          timeout: 20000, 
          maximumAge: 60000, // Accept cached locations up to 1 minute old
          enableHighAccuracy: true 
        }
      );
    }
  }, [isInputOpen]);

  useEffect(() => {
    loadData();

    // Subscribe and handle different event types (INSERT, UPDATE, DELETE)
    const sub = subscribeToMessages(({ type, message, id }) => {
      setMessages(prev => {
        // CASE 1: DELETE Event (e.g. score hits -5)
        if (type === 'DELETE') {
            return prev.filter(m => m.id !== id);
        }

        // Check if message is valid for other types
        if (!message) return prev;

        // CASE 2: Reply Handling
        if (message.parentId) {
            // We do NOT add replies to the main message list, 
            // but we MUST update the parent's replyCount.
            
            // Prevent double-counting if I just sent it (optimistic update in handleReply)
            if (message.sessionId === getAnonymousID()) {
                return prev;
            }

            return prev.map(m => {
                if (m.id === message.parentId) {
                    return { ...m, replyCount: (m.replyCount || 0) + 1 };
                }
                return m;
            });
        }

        // CASE 3: INSERT or UPDATE for Root Post
        const exists = prev.findIndex(p => p.id === message.id);
        if (exists !== -1) {
            // Update existing (e.g. score change)
            const updated = [...prev];
            updated[exists] = { ...updated[exists], ...message };
            return updated;
        }
        
        // NEW MESSAGE INSERTED
        if (type === 'INSERT') {
          setLastNewMessage(message);
        }
        
        // Insert new
        return [message, ...prev];
      });
    });
    return () => { if (sub) sub.unsubscribe(); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessages(currentMessages => {
        const now = Date.now();
        const cutoff = now - MESSAGE_LIFESPAN_MS;
        
        const validMessages = currentMessages.filter(m => 
          m.timestamp > cutoff && 
          m.score > SCORE_THRESHOLD_HIDE
        );

        if (validMessages.length !== currentMessages.length) {
          return validMessages;
        }
        return currentMessages;
      });
    }, 60000); 

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!currentBounds) return;
    
    const now = Date.now();
    const cutoff = now - MESSAGE_LIFESPAN_MS;

    const visible = messages.filter(m => 
      m.location.lat <= currentBounds.north &&
      m.location.lat >= currentBounds.south &&
      m.location.lng <= currentBounds.east &&
      m.location.lng >= currentBounds.west &&
      m.score > SCORE_THRESHOLD_HIDE &&
      m.timestamp > cutoff
    );
    setVisibleMessages(visible);
  }, [messages, currentBounds]);

  const handleViewportChange = (bounds: ViewportBounds) => {
    setCurrentBounds(bounds);
  };

  const handleSave = async (text: string) => {
    let lat = 0, lng = 0;
    
    try {
      // 1. Try to use warmed-up cache first
      if (locationCache.current) {
        lat = locationCache.current.lat;
        lng = locationCache.current.lng;
      } else {
        // 2. Fallback to fresh fetch if cache is empty
        const pos = await new Promise<GeolocationPosition>((res, rej) => 
          navigator.geolocation.getCurrentPosition(res, rej, { 
            timeout: 20000, // Increased timeout for mobile cold start
            maximumAge: 60000, 
            enableHighAccuracy: true 
          })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        // Update cache for next time
        locationCache.current = { lat, lng };
      }
    } catch (e) {
      console.warn("GPS Failed, falling back to random location");
      const r = getRandomLocation();
      lat = r.lat;
      lng = r.lng;
    }

    const newMsg = await saveMessage(text, lat, lng);
    setMessages(prev => [newMsg, ...prev]);
    // Also trigger pulse for self
    setLastNewMessage(newMsg);
    setRateLimit(await getRateLimitStatus());
  };

  const handleReply = async (text: string, parentId: string) => {
    let lat = 0, lng = 0;
    try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => 
          navigator.geolocation.getCurrentPosition(res, rej, { 
              timeout: 10000, 
              maximumAge: 60000 
          })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (e) {
        if (activeThread) {
            lat = activeThread.location.lat;
            lng = activeThread.location.lng;
        } else {
            const r = getRandomLocation();
            lat = r.lat; lng = r.lng;
        }
      }

    await saveMessage(text, lat, lng, parentId);
    
    // Optimistic update for reply count
    setMessages(prev => prev.map(m => {
        if (m.id === parentId) {
            return { ...m, replyCount: (m.replyCount || 0) + 1 };
        }
        return m;
    }));
  };

  const handleVote = async (msgId: string, direction: 'up' | 'down') => {
    setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
            const delta = direction === 'up' ? 1 : -1; 
            return { ...m, score: m.score + delta };
        }
        return m;
    }));

    const updatedMsg = await castVote(msgId, direction);

    if (updatedMsg) {
        setMessages(prev => prev.map(m => m.id === msgId ? updatedMsg! : m));
    }
  };

  return (
    // FIXED INSET-0 forces the app to fill the iframe/viewport completely
    <div className="fixed inset-0 bg-[#0a0a12] overflow-hidden">
      
      <ChatMap 
        messages={messages} 
        onViewportChange={handleViewportChange}
        onMessageClick={(msg) => setActiveThread(msg)}
        lastNewMessage={lastNewMessage}
      />

      <div className="absolute top-0 left-0 right-0 z-[400] p-4 pointer-events-none">
         <div className="flex items-center gap-3 bg-[#0a0a12]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 w-fit pointer-events-auto">
            <Radio size={18} style={{ color: THEME_COLOR }} className="animate-pulse" />
            <h1 className="text-sm font-bold tracking-widest text-white">KAIKU</h1>
         </div>
      </div>

      <FeedPanel 
        visibleMessages={visibleMessages}
        onMessageClick={(msg) => setActiveThread(msg)} 
        isOpen={isFeedOpen}
        toggleOpen={() => setIsFeedOpen(!isFeedOpen)}
        onVote={handleVote}
        onRefresh={loadData}
      />

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[400]">
        <button
          onClick={() => setIsInputOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-bold shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:scale-105 transition-transform"
        >
          <Plus size={20} />
          <span>BROADCAST</span>
        </button>
      </div>

      <ChatInputModal 
        isOpen={isInputOpen}
        onClose={() => setIsInputOpen(false)}
        onSave={handleSave}
        cooldownUntil={rateLimit.cooldownUntil}
      />

      <AnimatePresence>
        {activeThread && (
            <ThreadView 
                parentMessage={activeThread}
                onClose={() => setActiveThread(null)}
                onReply={handleReply}
                onVote={handleVote}
            />
        )}
      </AnimatePresence>

    </div>
  );
}

export default App;