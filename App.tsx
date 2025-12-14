import React, { useState, useEffect, useRef } from 'react';
import { Radio, Zap, Volume2, VolumeX } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import WelcomeScreen from './components/WelcomeScreen';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, deleteMessage, getLocalMessages, calculateDistance } from './services/storageService';
import { getCityName } from './services/moderationService';
import { SoundService } from './services/soundService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence, motion } from 'framer-motion';

// Radius of the visual ring in pixels.
const SCAN_RADIUS_PX = 142; 

function App() {
  const [hasStarted, setHasStarted] = useState(false); // New state for Welcome Screen
  const [messages, setMessages] = useState<ChatMessage[]>(() => getLocalMessages(true));
  const [signals, setSignals] = useState<ChatMessage[]>([]);
  
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [lastNewMessage, setLastNewMessage] = useState<ChatMessage | null>(null);
  
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false); 
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [currentBounds, setCurrentBounds] = useState<ViewportBounds | null>(null);
  
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(SoundService.getMuteStatus());
  const [targetLocation, setTargetLocation] = useState<{lat: number, lng: number, name: string} | null>(null);
  
  // Use a ref for location to ensure we always have the absolute latest coords without re-renders
  const locationCache = useRef<{lat: number, lng: number} | null>(null);

  const [rateLimit, setRateLimit] = useState<{ isLimited: boolean; cooldownUntil: number | null }>({
    isLimited: false,
    cooldownUntil: null
  });

  // START HANDLER
  const handleStart = (startLoc: { lat: number, lng: number }) => {
      // 1. Initialize location cache immediately with the fresh GPS data
      locationCache.current = startLoc;
      
      // 2. Play startup sound (now allowed because of user interaction)
      SoundService.playScan();
      
      // 3. Mount the app
      setHasStarted(true);
  };

  const loadData = async () => {
      const data = await fetchMessages(true);
      setMessages(data);
      setRateLimit(await getRateLimitStatus());
  };

  // CONTINUOUS GPS TRACKING (Only activates after start)
  useEffect(() => {
    if (!hasStarted) return; // Don't track until started

    let watchId: number;

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (pos.coords.latitude !== 0 || pos.coords.longitude !== 0) {
             locationCache.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          }
        },
        (err) => {
          console.warn("GPS tracking error", err);
        },
        { 
          enableHighAccuracy: true, 
          maximumAge: 5000, 
          timeout: 20000 
        }
      );
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;
    loadData();
    
    const sub = subscribeToMessages(({ type, message, id }) => {
      // 1. UPDATE HEATMAP DATA (MESSAGES)
      setMessages(prev => {
        let next = [...prev];
        if (type === 'DELETE') {
            next = prev.filter(m => m.id !== id);
        } else if (message) {
             const exists = prev.findIndex(p => p.id === message.id);
             if (exists !== -1) {
                 next[exists] = { ...next[exists], ...message };
             } else {
                 if (!message.parentId) {
                     next = [message, ...prev];
                     setLastNewMessage(message); 
                     SoundService.playScan();
                 } else {
                     const parentIndex = prev.findIndex(p => p.id === message.parentId);
                     if (parentIndex !== -1) {
                         const parent = next[parentIndex];
                         next[parentIndex] = {
                             ...parent,
                             replyCount: (parent.replyCount || 0) + 1
                         };
                     }
                 }
             }
        }
        return next;
      });

      // 2. TRIGGER ARC ANIMATION (SIGNALS)
      // Moved outside the setMessages to ensure independent execution.
      // We RELAXED the condition: Any reply is a candidate signal. 
      // We let ArcLayer decide if it has enough data (coordinates) to draw it.
      if (message && message.parentId) {
           setSignals(prevSignals => {
               // Prevent duplicates in the signal queue if possible, though ArcLayer also checks
               if (prevSignals.some(s => s.id === message.id)) return prevSignals;
               return [...prevSignals.slice(-10), message];
           });
           SoundService.playScan();
      }
    });
    return () => { if (sub) sub.unsubscribe(); };
  }, [hasStarted]);

  useEffect(() => {
    if (!currentBounds) return;
    
    const now = Date.now();
    const cutoff = now - MESSAGE_LIFESPAN_MS;

    const centerLat = currentBounds.sectorCenter ? currentBounds.sectorCenter.lat : currentBounds.center.lat;
    const centerLng = currentBounds.sectorCenter ? currentBounds.sectorCenter.lng : currentBounds.center.lng;

    const metersPerPx = 156543.03 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, currentBounds.zoom);
    const radiusKm = (metersPerPx * SCAN_RADIUS_PX) / 1000;

    let visible = messages.filter(m => {
      if (m.timestamp <= cutoff || m.score <= SCORE_THRESHOLD_HIDE) return false;

      const dist = calculateDistance(
          centerLat, 
          centerLng, 
          m.location.lat, 
          m.location.lng
      );
      
      return dist <= radiusKm;
    });

    if (currentBounds.zoom < 10) {
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
    SoundService.playClick();
    setIsFeedOpen(true);
  };

  const handleTagClick = (tag: string) => {
      SoundService.playClick();
      setActiveTag(tag);
      setIsFeedOpen(true);
      setSelectedMessage(null);
  };

  const getLocation = async (): Promise<{lat: number, lng: number}> => {
     if (locationCache.current) return locationCache.current;
     
     // Fallback if cache is empty (unlikely with WelcomeScreen)
     return new Promise((resolve, reject) => {
         if (!navigator.geolocation) {
             reject(new Error("Geolocation not supported"));
             return;
         }
         navigator.geolocation.getCurrentPosition(
             (pos) => {
                 const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                 locationCache.current = loc;
                 resolve(loc);
             }, 
             (err) => reject(new Error("GPS signal required.")), 
             { timeout: 10000, enableHighAccuracy: true }
         );
     });
  };

  const handleOpenInput = async () => {
      SoundService.playClick();
      setTargetLocation(null); 

      try {
          const userLoc = await getLocation();
          const lat = userLoc.lat;
          const lng = userLoc.lng;

          const nameData = await getCityName(lat, lng);
          setTargetLocation({ lat, lng, name: nameData.city });
          setIsInputOpen(true);
      } catch (e) {
          alert("GPS Signal Lost. Cannot broadcast.");
      }
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
      try {
          const userLoc = await getLocation(); 
          
          let targetLat = userLoc.lat;
          let targetLng = userLoc.lng;

          if (selectedMessage) {
              targetLat = selectedMessage.location.lat;
              targetLng = selectedMessage.location.lng;
          }

          // Save to DB
          await saveMessage(text, targetLat, targetLng, userLoc.lat, userLoc.lng, parentId);
          
          // ALWAYS TRIGGER LOCAL ECHO for replies
          // The WelcomeScreen ensures userLoc is valid, so this will draw a line immediately.
          const tempSignal: ChatMessage = {
              id: `local-echo-${Date.now()}`,
              text: text,
              timestamp: Date.now(),
              location: { lat: targetLat, lng: targetLng },
              city: "Target",
              sessionId: "me", 
              score: 0,
              parentId: parentId,
              isRemote: true, // Force true for local echo effect
              originCountry: "ME",
              customOrigin: { lat: userLoc.lat, lng: userLoc.lng } 
          };
          
          setSignals(prev => [...prev, tempSignal]);

          await loadData();
      } catch (e) {
          alert("GPS Signal Lost. Cannot send reply.");
      }
  };

  const handleVote = async (msgId: string, direction: 'up' | 'down') => {
    SoundService.playClick();
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
  
  const toggleMute = () => {
      const newState = SoundService.toggleMute();
      setIsMuted(newState);
      if (!newState) SoundService.playClick();
  };

  const hasSignal = visibleMessages.length > 0;

  // --- RENDER ---

  if (!hasStarted) {
      return <WelcomeScreen onStart={handleStart} />;
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a12] overflow-hidden">
      
      <ChatMap 
        messages={messages} 
        signals={signals}
        onViewportChange={handleViewportChange}
        onMapClick={handleMapClick}
        lastNewMessage={lastNewMessage}
        hasSignal={hasSignal}
        initialCenter={locationCache.current || undefined}
      />

      <div className="absolute top-0 left-0 right-0 z-[400] p-4 pointer-events-none flex justify-between items-start">
         <div className="flex items-center gap-2 pointer-events-auto">
             <div className="flex items-center gap-3 bg-[#0a0a12]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
                <Radio size={18} style={{ color: THEME_COLOR }} className="animate-pulse" />
                <h1 className="text-sm font-bold tracking-widest text-white">KAIKU</h1>
             </div>
             
             <button 
                onClick={toggleMute}
                className="w-10 h-10 flex items-center justify-center bg-[#0a0a12]/80 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-colors shadow-lg"
             >
                 {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
             </button>
         </div>
      </div>

      <FeedPanel 
        visibleMessages={visibleMessages}
        onMessageClick={(msg) => { SoundService.playClick(); setSelectedMessage(msg); }} 
        isOpen={isFeedOpen}
        toggleOpen={() => { SoundService.playClick(); setIsFeedOpen(!isFeedOpen); }}
        onVote={handleVote}
        onDelete={handleDelete}
        onRefresh={() => { SoundService.playClick(); loadData(); }}
        zoomLevel={currentBounds?.zoom}
        activeTag={activeTag}
        onTagClick={handleTagClick}
        onClearTag={() => { SoundService.playClick(); setActiveTag(null); }}
      />

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
        onClose={() => { SoundService.playClick(); setIsInputOpen(false); }}
        onSave={handleSaveMessage}
        cooldownUntil={rateLimit.cooldownUntil}
        targetLocationName={targetLocation?.name}
      />

      {selectedMessage && (
          <ThreadView 
            parentMessage={selectedMessage}
            onClose={() => { SoundService.playClick(); setSelectedMessage(null); }}
            onReply={handleReplyMessage}
            onVote={handleVote}
            onDelete={handleDelete}
            onTagClick={handleTagClick}
          />
      )}

    </div>
  );
}

export default App;