import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Zap, Volume2, VolumeX } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import WelcomeScreen from './components/WelcomeScreen';
import BootSequence from './components/BootSequence';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, deleteMessage, getLocalMessages, calculateDistance, subscribeToPresence, getHiddenIds, toggleHiddenMessage } from './services/storageService';
import { getCityName } from './services/moderationService';
import { SoundService } from './services/soundService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence, motion } from 'framer-motion';
import { triggerHaptic } from './services/hapticService';

// Radius of the visual ring in pixels.
// Visual ring is w-64 (256px) -> 128px radius.
// We set scan radius slightly larger to include edge signals comfortably.
const SCAN_RADIUS_PX = 150; 

type AppState = 'welcome' | 'boot' | 'app';

function App() {
  // APP FLOW STATE
  // 'welcome' -> Waiting for user to click Initialize
  // 'boot' -> Playing terminal animation
  // 'app' -> Main interface
  const [appState, setAppState] = useState<AppState>('welcome');

  const [messages, setMessages] = useState<ChatMessage[]>(() => getLocalMessages(true));
  const [signals, setSignals] = useState<ChatMessage[]>([]);
  
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [lastNewMessage, setLastNewMessage] = useState<ChatMessage | null>(null);
  
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false); 
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [focusedMessage, setFocusedMessage] = useState<ChatMessage | null>(null);

  const [currentBounds, setCurrentBounds] = useState<ViewportBounds | null>(null);
  
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(SoundService.getMuteStatus());
  const [targetLocation, setTargetLocation] = useState<{lat: number, lng: number, name: string} | null>(null);
  
  // Use a ref for location to ensure we always have the absolute latest coords without re-renders
  const locationCache = useRef<{lat: number, lng: number} | null>(null);

  // VISIBILITY FILTER STATE (Hidden Messages)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenIds());

  const [rateLimit, setRateLimit] = useState<{ isLimited: boolean; cooldownUntil: number | null }>({
    isLimited: false,
    cooldownUntil: null
  });

  // TYPING INDICATOR STATE
  const [nearbyTypingCount, setNearbyTypingCount] = useState(0);
  const presenceActions = useRef<{ setTyping: (t: boolean, l?: {lat: number, lng: number}) => void } | null>(null);

  // START HANDLER (Triggered from WelcomeScreen)
  const handleStart = (startLoc: { lat: number, lng: number }) => {
      // 1. Initialize location cache immediately with the fresh GPS data
      locationCache.current = startLoc;
      
      // Save initial start location as "Last Known" to help next boot be faster
      localStorage.setItem('kaiku_last_loc', JSON.stringify(startLoc));
      
      // 2. Play startup sound (now allowed because of user interaction)
      SoundService.playScan();
      
      // 3. Move to Boot Sequence
      setAppState('boot');
  };

  const handleBootComplete = () => {
      if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('kaiku_booted', 'true');
      }
      setAppState('app');
  };

  // Derived state for background processes
  // We want to start fetching data/tracking GPS as soon as we leave the welcome screen (during boot)
  const isRunning = appState !== 'welcome';

  const loadData = async () => {
      const data = await fetchMessages(true);
      setMessages(data);
      setRateLimit(await getRateLimitStatus());
  };

  // CONTINUOUS GPS TRACKING (Only activates after start)
  useEffect(() => {
    if (!isRunning) return; 

    let watchId: number;
    let timerId: any;

    // DELAYED START to prevent "Double Permission Prompt" or Race Conditions.
    // We already got a fresh location from WelcomeScreen, so we can afford to wait.
    timerId = setTimeout(() => {
        if ('geolocation' in navigator) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    if (pos.coords.latitude !== 0 || pos.coords.longitude !== 0) {
                        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        locationCache.current = newLoc;
                        // Persist reliable location for next app start (Fast Resume)
                        localStorage.setItem('kaiku_last_loc', JSON.stringify(newLoc));
                    }
                },
                (err) => {
                    // Suppress timeout errors in background tracking to avoid console spam
                    if (err.code !== 3) {
                         console.warn("Background GPS tracking warning:", err.code, err.message);
                    }
                },
                { 
                    enableHighAccuracy: true, 
                    maximumAge: 30000, // Use cached locations up to 30s old to save battery/resources
                    timeout: 20000 
                }
            );
        }
    }, 2000); // 2 second delay

    return () => {
      clearTimeout(timerId);
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isRunning]);

  // SUPABASE REALTIME (Presence & Messages)
  useEffect(() => {
    if (!isRunning) return;
    loadData();
    
    // 1. MESSAGE LISTENER
    const subMessages = subscribeToMessages(({ type, message, id }) => {
      
      // --- AUDIO SPAM PREVENTION LOGIC ---
      // Check distance before playing sound.
      // 140km range. Linear volume dropoff.
      if (type === 'INSERT' && message && locationCache.current) {
          const userLoc = locationCache.current;
          const msgLoc = message.location;
          const distKm = calculateDistance(userLoc.lat, userLoc.lng, msgLoc.lat, msgLoc.lng);
          const MAX_AUDIBLE_RANGE = 140;

          if (distKm < MAX_AUDIBLE_RANGE) {
              const volume = 1 - (distKm / MAX_AUDIBLE_RANGE);
              SoundService.playScan(volume);
          }
      }

      // UPDATE HEATMAP DATA (MESSAGES)
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
                     // Sound handled above in Audio Logic block
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

      // TRIGGER ARC ANIMATION (SIGNALS) via NETWORK BROADCAST
      if (message && message.parentId) {
           setSignals(prevSignals => {
               // Deduplicate based on ID to ensure clean animation
               if (prevSignals.some(s => s.id === message.id)) return prevSignals;
               return [...prevSignals.slice(-10), message];
           });
      }
    });

    // 2. PRESENCE LISTENER (Typing Indicator)
    // We only count people typing within 150km radius
    const presenceHelper = subscribeToPresence(locationCache.current, (others) => {
        if (!locationCache.current) return;
        
        let nearbyCount = 0;
        const myLat = locationCache.current.lat;
        const myLng = locationCache.current.lng;

        others.forEach(user => {
             const dist = calculateDistance(myLat, myLng, user.lat, user.lng);
             if (dist < 150) {
                 nearbyCount++;
             }
        });
        setNearbyTypingCount(nearbyCount);
    });

    presenceActions.current = presenceHelper;

    return () => { 
        if (subMessages) subMessages.unsubscribe();
        if (presenceHelper) presenceHelper.unsubscribe();
    };
  }, [isRunning]);

  useEffect(() => {
    if (!currentBounds) return;
    
    const now = Date.now();
    // Removed old 'cutoff' based logic which filtered out boosted messages inadvertently.

    const centerLat = currentBounds.sectorCenter ? currentBounds.sectorCenter.lat : currentBounds.center.lat;
    const centerLng = currentBounds.sectorCenter ? currentBounds.sectorCenter.lng : currentBounds.center.lng;

    const metersPerPx = 156543.03 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, currentBounds.zoom);
    const radiusKm = (metersPerPx * SCAN_RADIUS_PX) / 1000;

    let visible = messages.filter(m => {
      // FIX: Use expiresAt check instead of creation timestamp.
      // This ensures messages extended by boosts are still visible.
      // Fallback to timestamp + lifespan if expiresAt is missing (backward compat).
      const expiry = m.expiresAt || (m.timestamp + MESSAGE_LIFESPAN_MS);
      if (expiry <= now || m.score <= SCORE_THRESHOLD_HIDE) return false;

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
    if (isFeedOpen) {
        SoundService.playClick();
        setIsFeedOpen(false);
    } else {
        SoundService.playClick();
    }
  };

  const handleMessageClick = (msg: ChatMessage) => {
      SoundService.playClick();
      triggerHaptic('light'); // Tactile confirm for jump
      setFocusedMessage(msg); // 1. Trigger Map FlyTo & Marker
      setIsFeedOpen(false);   // 2. Collapse panel (Mobile UX)
  };

  const handleOpenThread = (msg: ChatMessage) => {
      SoundService.playClick();
      setSelectedMessage(msg);
  };

  const handleTagClick = (tag: string) => {
      SoundService.playClick();
      setActiveTag(tag);
      setIsFeedOpen(true);
      setSelectedMessage(null);
  };

  // Wrapped in useCallback to provide stable reference for ChatMap
  const getLocation = useCallback(async (): Promise<{lat: number, lng: number}> => {
     if (locationCache.current) return locationCache.current;
     
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
  }, []);

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

  const handleSaveMessage = async (text: string, imageUrl?: string) => {
    if (!targetLocation) return;
    const userLoc = await getLocation(); 
    await saveMessage(
        text, 
        targetLocation.lat, 
        targetLocation.lng, 
        userLoc.lat, 
        userLoc.lng,
        undefined, // parentId
        imageUrl
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

          await saveMessage(text, targetLat, targetLng, userLoc.lat, userLoc.lng, parentId);
          await loadData();
      } catch (e) {
          alert("GPS Signal Lost. Cannot send reply.");
      }
  };

  const handleTypingChange = async (isTyping: boolean) => {
      if (presenceActions.current) {
           const loc = await getLocation();
           presenceActions.current.setTyping(isTyping, loc);
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
    if (focusedMessage?.id === msgId) setFocusedMessage(null);
    await deleteMessage(msgId);
  };

  // TOGGLE HIDDEN STATUS (VISIBILITY)
  const handleToggleHidden = (msgId: string) => {
      const newSet = toggleHiddenMessage(msgId);
      setHiddenIds(newSet);
      triggerHaptic('light'); // Subtle feedback for local toggle
  };
  
  const toggleMute = () => {
      const newState = SoundService.toggleMute();
      setIsMuted(newState);
      if (!newState) SoundService.playClick();
  };

  const hasSignal = visibleMessages.length > 0;

  return (
    <>
        <AnimatePresence mode="wait">
            {appState === 'boot' && (
                <motion.div
                    key="boot"
                    className="fixed inset-0 z-[10000] bg-[#0a0a12] flex items-center justify-center"
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                >
                    <BootSequence onComplete={handleBootComplete} />
                </motion.div>
            )}
        </AnimatePresence>

        {appState === 'welcome' && (
            <WelcomeScreen onStart={handleStart} />
        )}
        
        {appState === 'app' && (
            <div className="fixed inset-0 bg-[#0a0a12] overflow-hidden">
            
            <ChatMap 
                messages={messages} 
                signals={signals}
                onViewportChange={handleViewportChange}
                onMapClick={handleMapClick}
                lastNewMessage={lastNewMessage}
                hasSignal={hasSignal}
                initialCenter={locationCache.current || undefined}
                focusedMessage={focusedMessage}
                onOpenThread={handleOpenThread}
                onClosePopup={() => { SoundService.playClick(); setFocusedMessage(null); }}
                hiddenIds={hiddenIds}
                getUserLocation={getLocation}
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
                onMessageClick={handleMessageClick} 
                isOpen={isFeedOpen}
                toggleOpen={() => { SoundService.playClick(); setIsFeedOpen(!isFeedOpen); }}
                onVote={handleVote}
                onDelete={handleDelete}
                onRefresh={() => { SoundService.playClick(); loadData(); }}
                zoomLevel={currentBounds?.zoom}
                activeTag={activeTag}
                onTagClick={handleTagClick}
                onClearTag={() => { SoundService.playClick(); setActiveTag(null); }}
                nearbyTypingCount={nearbyTypingCount}
                hiddenIds={hiddenIds}
                onToggleHidden={handleToggleHidden}
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
                onTypingStateChange={handleTypingChange}
            />

            {selectedMessage && (
                <ThreadView 
                    parentMessage={selectedMessage}
                    onClose={() => { SoundService.playClick(); setSelectedMessage(null); }}
                    onReply={handleReplyMessage}
                    onVote={handleVote}
                    onDelete={handleDelete}
                    onTagClick={handleTagClick}
                    hiddenIds={hiddenIds}
                    onToggleHidden={handleToggleHidden}
                />
            )}

            </div>
        )}
    </>
  );
}

export default App;