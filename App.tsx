import React, { useState, useEffect } from 'react';
import { Plus, Radio } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, getRandomLocation, castVote } from './services/storageService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence } from 'framer-motion';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(true);
  const [activeThread, setActiveThread] = useState<ChatMessage | null>(null);
  const [currentBounds, setCurrentBounds] = useState<ViewportBounds | null>(null);
  
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
    loadData();

    const sub = subscribeToMessages((msg) => {
      if (msg.parentId) return;

      setMessages(prev => {
        const exists = prev.findIndex(p => p.id === msg.id);
        if (exists !== -1) {
            const updated = [...prev];
            updated[exists] = msg;
            return updated;
        }
        return [msg, ...prev];
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
      const pos = await new Promise<GeolocationPosition>((res, rej) => 
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch (e) {
      const r = getRandomLocation();
      lat = r.lat;
      lng = r.lng;
    }

    const newMsg = await saveMessage(text, lat, lng);
    setMessages(prev => [newMsg, ...prev]);
    setRateLimit(await getRateLimitStatus());
  };

  const handleReply = async (text: string, parentId: string) => {
    let lat = 0, lng = 0;
    try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => 
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
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
    <div className="relative w-full h-screen bg-[#0a0a12] overflow-hidden">
      
      <ChatMap 
        messages={messages} 
        onViewportChange={handleViewportChange}
        onMessageClick={(msg) => setActiveThread(msg)}
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
