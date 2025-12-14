import React, { useState, useEffect, useRef } from 'react';
import { Plus, Radio, Zap } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, deleteMessage, getLocalMessages, calculateDistance } from './services/storageService';
import { getCityName } from './services/moderationService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence, motion } from 'framer-motion';

// Radius of the visual ring in pixels (w-64 = 256px diam => 128px radius)
const SCAN_RADIUS_PX = 140; 

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => getLocalMessages(true));
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [lastNewMessage, setLastNewMessage] = useState<ChatMessage | null>(null);
  
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false); 
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [currentBounds, setCurrentBounds] = useState<ViewportBounds | null>(null);
  
  // New state to show user where they are posting
  const [targetLocation, setTargetLocation] = useState<{lat: number, lng: number, name: string} | null>(null);
  
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
      (pos) => { 
          if (pos.coords.latitude !== 0 || pos.coords.longitude !== 0) {
            locationCache.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; 
          }
      },
      (err) => console.warn("GPS Warm-up failed", err),
      { timeout: 20000, maximumAge: 60000, enableHighAccuracy: true }
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
             if (exists !== -1) {
                 next[exists] = { ...next[exists], ...message };
             } else {
                 next = [message, ...prev];
                 // Trigger Shockwave for truly new messages
                 setLastNewMessage(message); 
             }
        }
        return next;
      });
    });
    return () => { if (sub) sub.unsubscribe(); };
  }, []);

  // Filter Messages based on SECTOR SCAN (Distance from Center)
  useEffect(() => {
    if (!currentBounds) return;
    
    const now = Date.now();
    const cutoff = now - MESSAGE_LIFESPAN_MS;

    // Calculate Dynamic Scan Radius in KM based on Zoom Level
    // Formula: (MetersPerPixel * PxRadius) / 1000
    // MetersPerPx approx = 156543 * cos(lat) / 2^zoom
    const metersPerPx = 156543.03 * Math.cos(currentBounds.center.lat * Math.PI / 180) / Math.pow(2, currentBounds.zoom);
    const radiusKm = (metersPerPx * SCAN_RADIUS_PX) / 1000;

    let visible = messages.filter(m => {
      // 1. Basic Age/Score Filter
      if (m.timestamp <= cutoff || m.score <= SCORE_THRESHOLD_HIDE) return false;

      // 2. Distance Filter (Sector Scan)
      const dist = calculateDistance(
          currentBounds.center.lat, 
          currentBounds.center.lng, 
          m.location.lat, 
          m.location.lng
      );
      
      return dist <= radiusKm;
    });

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
            (pos) => {
                if (pos.coords.latitude === 0 && pos.coords.longitude === 0) {
                    const fallback = { lat: 60.1699, lng: 24.9384 };
                    resolve(fallback);
                    return;
                }
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                locationCache.current = loc; 
                resolve(loc);
            },
            () => {
                const fallback = { lat: 60.1699, lng: 24.9384 };
                resolve(fallback);
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
     });
  };

  const handleOpenInput = async () => {
      setIsInputOpen(true);
      setTargetLocation(null); 

      const userLoc = await getLocation();
      const lat = userLoc.lat;
      const lng = userLoc.lng;

      const nameData = await getCityName(lat, lng);
      setTargetLocation({ lat, lng, name: nameData.city });
  };

  const handleSaveMessage = async (text: string) => {
    if (!targetLocation) return;
    const userLoc = await getLocation(); 
    await saveMessage(
        text, 
        targetLocation.lat, 
        targetLocation.lng, 
        userLoc.lat, 
        userLoc.lng
    );
    await loadData();
  };
  
  const handleReplyMessage = async (text: string, parentId: string) => {
      const userLoc = await getLocation(); 
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
    if (selectedMessage?.id === msgId) setSelectedMessage(null);
    await deleteMessage(msgId);
  };

  const hasSignal = visibleMessages.length > 0;

  return (
    <div className="fixed inset-0 bg-[#0a0a12] overflow-hidden">
      
      <ChatMap 
        messages={messages} 
        onViewportChange={handleViewportChange}
        onMapClick={handleMapClick}
        lastNewMessage={lastNewMessage}
        hasSignal={hasSignal}
      />

      {/* HEADER LOGO (Top Left) */}
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

      {/* BROADCAST BUTTON - TOP RIGHT */}
      <AnimatePresence>
        {!isFeedOpen && !isInputOpen && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="fixed top-5 right-5 z-[500] pointer-events-none"
            >
                <button
                    onClick={handleOpenInput}
                    className="pointer-events-auto group relative flex items-center justify-center w-14 h-14 bg-[#0f0f18] rounded-full border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-95 transition-all overflow-hidden"
                >
                    <div className="absolute inset-0 rounded-full border border-cyan-500/30 animate-[ping_2s_infinite]" />
                    <div className="absolute inset-0 bg-cyan-500/10 group-hover:bg-cyan-500/20 transition-colors" />
                    <Zap size={24} className="text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,1)]" />
                </button>
            </motion.div>
        )}
      </AnimatePresence>

      <ChatInputModal 
        isOpen={isInputOpen}
        onClose={() => setIsInputOpen(false)}
        onSave={handleSaveMessage}
        cooldownUntil={rateLimit.cooldownUntil}
        targetLocationName={targetLocation?.name}
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