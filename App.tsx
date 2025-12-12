import React, { useState, useEffect, useRef } from 'react';
import { Plus, Radio } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, getAnonymousID, deleteMessage, calculateDistance } from './services/storageService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence } from 'framer-motion';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  // Used when a specific cluster/hub is clicked
  const [filteredClusterMessages, setFilteredClusterMessages] = useState<ChatMessage[] | null>(null);
  
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false); 
  const [activeThread, setActiveThread] = useState<ChatMessage | null>(null);
  const [currentBounds, setCurrentBounds] = useState<ViewportBounds | null>(null);
  
  const [lastNewMessage, setLastNewMessage] = useState<ChatMessage | null>(null);
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

  useEffect(() => {
    if (isInputOpen) {
      console.log("KAIKU: Warming up GPS...");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          locationCache.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        },
        (err) => console.warn("KAIKU: GPS Warm-up failed", err),
        { timeout: 20000, maximumAge: 60000, enableHighAccuracy: true }
      );
    }
  }, [isInputOpen]);

  useEffect(() => {
    loadData();

    const sub = subscribeToMessages(({ type, message, id }) => {
      setMessages(prev => {
        if (type === 'DELETE') {
            return prev.filter(m => m.id !== id);
        }
        if (!message) return prev;
        if (message.parentId) {
            if (message.sessionId === getAnonymousID()) return prev;
            return prev.map(m => {
                if (m.id === message.parentId) {
                    return { ...m, replyCount: (m.replyCount || 0) + 1 };
                }
                return m;
            });
        }
        const exists = prev.findIndex(p => p.id === message.id);
        if (exists !== -1) {
            const updated = [...prev];
            updated[exists] = { ...updated[exists], ...message };
            return updated;
        }
        if (type === 'INSERT') {
          setLastNewMessage(message);
        }
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
    // If we have a cluster selected, showing that overrides the viewport bounds
    if (filteredClusterMessages) {
        setVisibleMessages(filteredClusterMessages);
        return;
    }

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
  }, [messages, currentBounds, filteredClusterMessages]);

  const handleViewportChange = (bounds: ViewportBounds) => {
    setCurrentBounds(bounds);
    // If user moves map significantly, maybe we should clear the cluster selection?
    // For now, let's keep it until they manually close it or select another.
    // Actually, panning away implies leaving the "hub". 
    // Let's clear it if the user zooms out significantly, but slight pans are ok.
    // For simplicity: dragging the map clears the cluster filter to resume "Exploring".
    setFilteredClusterMessages(null);
  };

  const handleClusterClick = (clusterMessages: ChatMessage[]) => {
      setFilteredClusterMessages(clusterMessages);
      setIsFeedOpen(true);
  };

  const handleClearCluster = () => {
      setFilteredClusterMessages(null);
  };

  const handleSave = async (text: string) => {
    let lat = 0, lng = 0;
    try {
      if (locationCache.current) {
        lat = locationCache.current.lat;
        lng = locationCache.current.lng;
      } else {
        const pos = await new Promise<GeolocationPosition>((res, rej) => 
          navigator.geolocation.getCurrentPosition(res, rej, { 
            timeout: 20000, maximumAge: 60000, enableHighAccuracy: true 
          })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        locationCache.current = { lat, lng };
      }
    } catch (e) {
      throw new Error("Location is required to place your broadcast on the map. Please enable location services.");
    }

    // Determine if remote: Distance between Real GPS (lat/lng) and Target Location
    const targetLat = lat; 
    const targetLng = lng; 
    
    const dist = calculateDistance(lat, lng, targetLat, targetLng);
    const isRemote = dist > 25; 

    const newMsg = await saveMessage(text, targetLat, targetLng, undefined, isRemote);
    setMessages(prev => [newMsg, ...prev]);
    setLastNewMessage(newMsg);
    setRateLimit(await getRateLimitStatus());
  };

  const handleReply = async (text: string, parentId: string) => {
    let lat = 0, lng = 0;
    try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => 
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 60000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
    } catch (e) {
        throw new Error("Location is required to reply. Please enable location services.");
    }

    let isRemote = false;
    const parent = activeThread?.id === parentId ? activeThread : messages.find(m => m.id === parentId);
    
    if (parent) {
      const dist = calculateDistance(lat, lng, parent.location.lat, parent.location.lng);
      isRemote = dist > 25;
    }

    await saveMessage(text, lat, lng, parentId, isRemote);
    
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

  const handleDelete = async (msgId: string, parentId?: string | null) => {
    if (parentId) {
        setMessages(prev => prev.map(m => {
            if (m.id === parentId) {
                return { ...m, replyCount: Math.max(0, (m.replyCount || 0) - 1) };
            }
            return m;
        }));
    } else {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        
        if (filteredClusterMessages) {
             setFilteredClusterMessages(prev => prev ? prev.filter(m => m.id !== msgId) : null);
        }
    }
    const success = await deleteMessage(msgId);
    if (!success) {
        alert("Could not delete message.");
        loadData();
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a12] overflow-hidden">
      
      <ChatMap 
        messages={messages} 
        onViewportChange={handleViewportChange}
        onMessageClick={(msg) => setActiveThread(msg)}
        onClusterClick={handleClusterClick}
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
        isFilteredByCluster={!!filteredClusterMessages}
        onClearFilter={handleClearCluster}
        onMessageClick={(msg) => setActiveThread(msg)} 
        isOpen={isFeedOpen}
        toggleOpen={() => setIsFeedOpen(!isFeedOpen)}
        onVote={handleVote}
        onDelete={handleDelete}
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
                onDelete={handleDelete}
            />
        )}
      </AnimatePresence>

    </div>
  );
}

export default App;