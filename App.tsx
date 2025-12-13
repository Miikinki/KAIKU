import React, { useState, useEffect, useRef } from 'react';
import { Plus, Radio } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, deleteMessage, getLocalMessages, getRandomLocation } from './services/storageService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => getLocalMessages(true));
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false); 
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [currentBounds, setCurrentBounds] = useState<ViewportBounds | null>(null);
  
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
    // Location warm-up
    navigator.geolocation.getCurrentPosition(
      (pos) => { locationCache.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      (err) => console.warn("GPS Warm-up failed", err),
      { timeout: 20000, maximumAge: 60000, enableHighAccuracy: false }
    );
  }, []);

  useEffect(() => {
    loadData();
    const sub = subscribeToMessages(({ type, message, id }) => {
      setMessages(prev => {
        let next = [...prev];
        if (type === 'DELETE') {
            next = prev.filter(m => m.id !== id);
        } else if (message) {
             const exists = prev.findIndex(p => p.id === message.id);
             if (exists !== -1) next[exists] = { ...next[exists], ...message };
             else next = [message, ...prev];
        }
        return next;
      });
    });
    return () => { if (sub) sub.unsubscribe(); };
  }, []);

  // Filter and Sort Messages based on Viewport and Zoom
  useEffect(() => {
    if (!currentBounds) return;
    
    const now = Date.now();
    const cutoff = now - MESSAGE_LIFESPAN_MS;

    let visible = messages.filter(m => 
      m.location.lat <= currentBounds.north &&
      m.location.lat >= currentBounds.south &&
      m.location.lng <= currentBounds.east &&
      m.location.lng >= currentBounds.west &&
      m.score > SCORE_THRESHOLD_HIDE &&
      m.timestamp > cutoff
    );

    // Sort: High zoom = Latest, Low zoom = Top Rated
    if (currentBounds.zoom < 9) {
        visible = visible.sort((a, b) => b.score - a.score);
    } else {
        visible = visible.sort((a, b) => b.timestamp - a.timestamp);
    }

    setVisibleMessages(visible);
  }, [messages, currentBounds]);

  const handleViewportChange = (bounds: ViewportBounds) => {
    setCurrentBounds(bounds);
  };

  const handleMapClick = () => {
    setIsFeedOpen(true);
  };

  const getLocation = async (): Promise<{lat: number, lng: number}> => {
     if (locationCache.current) return locationCache.current;
     return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => {
                // If GPS fails, give a random location for testing/privacy
                const rnd = getRandomLocation();
                resolve(rnd);
            },
            { timeout: 5000 }
        );
     });
  };

  const handleSaveMessage = async (text: string) => {
    const userLoc = await getLocation(); // ACTUAL GPS
    
    // TARGET: Where the map is currently looking
    // If we have bounds, use the center of the bounds. 
    // If not, fall back to userLoc.
    let targetLat = userLoc.lat;
    let targetLng = userLoc.lng;

    if (currentBounds) {
        targetLat = (currentBounds.north + currentBounds.south) / 2;
        targetLng = (currentBounds.east + currentBounds.west) / 2;
    }

    // Pass (Text, Target, User) to saveMessage to calculate "Remote" status
    await saveMessage(text, targetLat, targetLng, userLoc.lat, userLoc.lng);
    await loadData();
  };
  
  const handleReplyMessage = async (text: string, parentId: string) => {
      const userLoc = await getLocation(); // ACTUAL GPS
      
      // TARGET: The location of the original message we are replying to.
      // We can grab this from the selectedMessage state which should populate the ThreadView
      let targetLat = userLoc.lat;
      let targetLng = userLoc.lng;

      if (selectedMessage) {
          targetLat = selectedMessage.location.lat;
          targetLng = selectedMessage.location.lng;
      }

      await saveMessage(text, targetLat, targetLng, userLoc.lat, userLoc.lng, parentId);
      await loadData();
  };

  const handleVote = async (msgId: string, direction: 'up' | 'down') => {
    setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
            const delta = direction === 'up' ? 1 : -1; 
            return { ...m, score: m.score + delta };
        }
        return m;
    }));
    await castVote(msgId, direction);
  };

  const handleDelete = async (msgId: string, parentId?: string | null) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    
    if (selectedMessage?.id === msgId) {
        setSelectedMessage(null);
    }
    await deleteMessage(msgId);
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a12] overflow-hidden">
      
      <ChatMap 
        messages={messages} 
        onViewportChange={handleViewportChange}
        onMapClick={handleMapClick}
        lastNewMessage={null}
      />

      <div className="absolute top-0 left-0 right-0 z-[400] p-4 pointer-events-none">
         <div className="flex items-center gap-3 bg-[#0a0a12]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 w-fit pointer-events-auto shadow-lg">
            <Radio size={18} style={{ color: THEME_COLOR }} className="animate-pulse" />
            <h1 className="text-sm font-bold tracking-widest text-white">KAIKU</h1>
         </div>
      </div>

      <FeedPanel 
        visibleMessages={visibleMessages}
        onMessageClick={(msg) => setSelectedMessage(msg)} 
        isOpen={isFeedOpen}
        toggleOpen={() => setIsFeedOpen(!isFeedOpen)}
        onVote={handleVote}
        onDelete={handleDelete}
        onRefresh={loadData}
        zoomLevel={currentBounds?.zoom}
      />

      {!isFeedOpen && (
        <div className="fixed bottom-28 right-6 z-[400]">
            <button
            onClick={() => setIsInputOpen(true)}
            className="flex items-center justify-center w-14 h-14 bg-white text-black rounded-full shadow-[0_0_20px_rgba(255,255,255,0.4)] hover:scale-105 transition-transform"
            >
            <Plus size={24} />
            </button>
        </div>
      )}

      <ChatInputModal 
        isOpen={isInputOpen}
        onClose={() => setIsInputOpen(false)}
        onSave={handleSaveMessage}
        cooldownUntil={rateLimit.cooldownUntil}
      />

      {selectedMessage && (
          <ThreadView 
            parentMessage={selectedMessage}
            onClose={() => setSelectedMessage(null)}
            onReply={handleReplyMessage}
            onVote={handleVote}
            onDelete={handleDelete}
          />
      )}

    </div>
  );
}

export default App;