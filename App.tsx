import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, Volume2, VolumeX, Plus, Locate } from 'lucide-react';
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

const SCAN_RADIUS_PX = 150; 

type AppState = 'welcome' | 'boot' | 'app';

function App() {
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
  
  // Location Management
  const locationCache = useRef<{lat: number, lng: number} | null>(null);
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);
  // Timestamp added to ensure every click triggers effect, even if coords are same
  const [flyToLocation, setFlyToLocation] = useState<{lat: number, lng: number, timestamp: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenIds());

  const [rateLimit, setRateLimit] = useState<{ isLimited: boolean; cooldownUntil: number | null }>({
    isLimited: false,
    cooldownUntil: null
  });

  const [nearbyTypingCount, setNearbyTypingCount] = useState(0);
  const presenceActions = useRef<{ setTyping: (t: boolean, l?: {lat: number, lng: number}) => void } | null>(null);

  // START HANDLER
  const handleStart = (startLoc: { lat: number, lng: number }, isFallback: boolean) => {
      locationCache.current = startLoc;
      setIsFallbackLocation(isFallback);
      
      // Save location
      localStorage.setItem('kaiku_last_loc', JSON.stringify(startLoc));
      
      SoundService.playScan();
      setAppState('boot');
  };

  const handleBootComplete = () => {
      if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('kaiku_booted', 'true');
      }
      setAppState('app');
  };

  const isRunning = appState !== 'welcome';

  const loadData = async () => {
      const data = await fetchMessages(true);
      setMessages(data);
      setRateLimit(await getRateLimitStatus());
  };

  // CONTINUOUS GPS TRACKING & AUTO-CORRECTION
  useEffect(() => {
    if (!isRunning) return; 

    let watchId: number;
    let timerId: any;

    timerId = setTimeout(() => {
        if ('geolocation' in navigator) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    if (pos.coords.latitude !== 0 || pos.coords.longitude !== 0) {
                        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        
                        // AUTO-CORRECTION LOGIC:
                        // If we started in Fallback Mode (e.g. IP Location = Helsinki),
                        // and now we got a real GPS fix, we should fly the map to the real location.
                        if (isFallbackLocation && locationCache.current) {
                            const dist = calculateDistance(
                                locationCache.current.lat, locationCache.current.lng,
                                newLoc.lat, newLoc.lng
                            );
                            // If distance > 2km, assume meaningful correction
                            if (dist > 2) {
                                console.log("KAIKU: Auto-correcting location from fallback to GPS");
                                setFlyToLocation({ ...newLoc, timestamp: Date.now() }); // Force update with timestamp
                                setIsFallbackLocation(false); // We are no longer in fallback mode
                            }
                        }

                        locationCache.current = newLoc;
                        localStorage.setItem('kaiku_last_loc', JSON.stringify(newLoc));
                    }
                },
                (err) => {
                    // Ignore simple timeouts in background tracking to avoid log spam
                    if (err.code !== 3) {
                         console.warn("Background GPS tracking warning:", err.code, err.message);
                    }
                },
                { 
                    // Use Standard Accuracy for background tracking to avoid timeout loops and battery drain
                    enableHighAccuracy: false, 
                    maximumAge: 30000, 
                    timeout: 30000 
                }
            );
        }
    }, 2000); 

    return () => {
      clearTimeout(timerId);
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isRunning, isFallbackLocation]);

  // SUPABASE REALTIME
  useEffect(() => {
    if (!isRunning) return;
    loadData();
    
    const subMessages = subscribeToMessages(({ type, message, id }) => {
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

      if (message && message.parentId) {
           setSignals(prevSignals => {
               if (prevSignals.some(s => s.id === message.id)) return prevSignals;
               return [...prevSignals.slice(-10), message];
           });
      }
    });

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
    const centerLat = currentBounds.sectorCenter ? currentBounds.sectorCenter.lat : currentBounds.center.lat;
    const centerLng = currentBounds.sectorCenter ? currentBounds.sectorCenter.lng : currentBounds.center.lng;

    const metersPerPx = 156543.03 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, currentBounds.zoom);
    const radiusKm = (metersPerPx * SCAN_RADIUS_PX) / 1000;

    let visible = messages.filter(m => {
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
      triggerHaptic('light'); 
      setFocusedMessage(msg); 
      setIsFeedOpen(false);   
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

  // UPDATED: Robust getLocation with failover chain
  const getLocation = useCallback(async (forceRefresh = false): Promise<{lat: number, lng: number}> => {
     // 1. FAST PATH: Return cache if allowed and available
     if (locationCache.current && !forceRefresh) return locationCache.current;
     
     const getPos = (opts: PositionOptions): Promise<GeolocationPosition> => 
        new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));

     try {
         // 2. ATTEMPT HIGH ACCURACY (Only if forced, e.g. "Locate Me")
         if (forceRefresh) {
             const pos = await getPos({ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
             const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
             locationCache.current = loc;
             return loc;
         }
         throw new Error("Skipping High Accuracy (Not Forced)");
     } catch (e) {
         // 3. FALLBACK: STANDARD ACCURACY
         // If high accuracy fails or is skipped, try standard.
         // This handles the "Timeout expired" error from high accuracy attempts.
         console.warn("Switching to standard accuracy...");
         try {
             const pos = await getPos({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
             const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
             locationCache.current = loc;
             return loc;
         } catch (e2) {
             // 4. LAST RESORT: INTERNAL CACHE
             if (locationCache.current) {
                 console.warn("GPS failed, falling back to last known location.");
                 return locationCache.current;
             }
             // 5. FAIL
             throw new Error("Unable to retrieve location. Please check GPS settings.");
         }
     }
  }, []);

  const handleLocateMe = async () => {
      setIsLocating(true);
      SoundService.playClick();
      triggerHaptic('light');
      
      try {
          // Force fresh GPS data
          const loc = await getLocation(true); 
          // Use timestamp to ensure unique state update every time, triggering map flyTo
          setFlyToLocation({ ...loc, timestamp: Date.now() }); 
      } catch (e) {
          console.warn("Locate failed", e);
      } finally {
          setIsLocating(false);
      }
  };

  const handleOpenInput = async () => {
      SoundService.playClick();
      setTargetLocation(null); 
      
      // OPTIMIZATION: Use cached location immediately (false).
      // This ensures the modal opens INSTANTLY.
      try {
          const userLoc = await getLocation(false); 
          const lat = userLoc.lat;
          const lng = userLoc.lng;

          getCityName(lat, lng).then(nameData => {
             setTargetLocation(prev => prev ? { ...prev, name: nameData.city } : { lat, lng, name: nameData.city });
          });
          
          setTargetLocation({ lat, lng, name: "Locating..." });
          setIsInputOpen(true);
      } catch (e) {
          alert("GPS Signal Lost. Cannot broadcast.");
      }
  };

  const handleSaveMessage = async (text: string, imageUrl?: string, isMasked: boolean = false) => {
    if (!targetLocation) return;
    
    let finalLat = targetLocation.lat;
    let finalLng = targetLocation.lng;
    
    // Attempt precision refresh before send, but don't block on it if it fails
    if (!isMasked) {
        try {
            const freshLoc = await getLocation(true);
            finalLat = freshLoc.lat;
            finalLng = freshLoc.lng;
        } catch (e) {
            // Silent fallback to modal-open location
        }
    }
    
    const userLoc = await getLocation(false).catch(() => ({ lat: finalLat, lng: finalLng })); 
    
    await saveMessage(
        text, 
        finalLat, 
        finalLng, 
        userLoc.lat, 
        userLoc.lng,
        undefined, 
        imageUrl,
        isMasked 
    );
    await loadData();
  };
  
  const handleReplyMessage = async (text: string, parentId: string) => {
      try {
          const userLoc = await getLocation(false); 
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
           const loc = locationCache.current || { lat: 0, lng: 0 };
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

  const handleToggleHidden = (msgId: string) => {
      const newSet = toggleHiddenMessage(msgId);
      setHiddenIds(newSet);
      triggerHaptic('light'); 
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
                flyToLocation={flyToLocation}
                focusedMessage={focusedMessage}
                onOpenThread={handleOpenThread}
                onClosePopup={() => { SoundService.playClick(); setFocusedMessage(null); }}
                hiddenIds={hiddenIds}
                getUserLocation={getLocation}
            />

            {/* TOP HEADER CONTROLS */}
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

                {/* LOCATE ME - Top Right */}
                <button
                    onClick={handleLocateMe}
                    className={`
                        pointer-events-auto flex items-center justify-center w-10 h-10 
                        bg-[#0a0a12]/80 backdrop-blur-md border border-cyan-500/30 
                        rounded-full shadow-lg text-cyan-400 hover:bg-cyan-950/80 hover:text-white 
                        transition-all active:scale-95 group
                        ${isLocating ? 'animate-pulse' : ''}
                    `}
                    title="Locate Me"
                >
                    <Locate size={18} className="group-hover:rotate-45 transition-transform duration-500" />
                </button>
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
                onCompose={handleOpenInput}
            />

            {/* FLOATING ACTION BUTTON - HIDDEN WHEN FEED IS OPEN (hasSignal) */}
            <div 
                className={`fixed bottom-24 right-5 z-[500] transition-all duration-300 ${(isInputOpen || isFeedOpen || hasSignal) ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0 pointer-events-auto'}`}
            >
                <button
                    onClick={handleOpenInput}
                    className="flex items-center gap-2 px-5 py-3 bg-[#0a0a12]/80 backdrop-blur-md border border-cyan-500/40 rounded-lg text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:bg-cyan-950/80 hover:text-white hover:border-cyan-400 transition-all active:scale-95 group"
                >
                        <Plus size={18} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-300" />
                        <span className="font-mono font-bold tracking-widest text-xs uppercase">SIGNAL</span>
                </button>
            </div>

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