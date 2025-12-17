
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Radio, Volume2, VolumeX, Plus, Locate, Search, X, Zap, Terminal } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import WelcomeScreen from './components/WelcomeScreen';
import BootSequence from './components/BootSequence';
import DesktopLanding from './components/DesktopLanding';
import { ChatMessage, ViewportBounds } from './types';
// Add getAnonymousID to the imports from storageService
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, deleteMessage, getLocalMessages, calculateDistance, subscribeToPresence, getHiddenIds, toggleHiddenMessage, getAnonymousID } from './services/storageService';
import { scanGlobalNetwork } from './services/globalRadarService'; // NEW IMPORT
import { getCityName, searchLocations } from './services/moderationService';
import { getPreciseLocation } from './services/locationService';
import { SoundService } from './services/soundService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence, motion } from 'framer-motion';
import { triggerHaptic } from './services/hapticService';
import { useTranslation } from 'react-i18next';

// BASE SCAN RADIUS (Visual Reference)
const BASE_SCAN_RADIUS_PX = 128; 

type AppState = 'welcome' | 'boot' | 'app';

function App() {
  const { t } = useTranslation();
  const [appState, setAppState] = useState<AppState>('welcome');
  const [isDesktop, setIsDesktop] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => getLocalMessages(true));
  const [globalEvents, setGlobalEvents] = useState<ChatMessage[]>([]); 
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
  // Visual Rendering States
  const [currentUserLocation, setCurrentUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); 
  
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);
  const [flyToLocation, setFlyToLocation] = useState<{lat: number, lng: number, timestamp: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Search State (TERMINAL UI)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isScanningGlobal, setIsScanningGlobal] = useState(false); 

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenIds());

  const [rateLimit, setRateLimit] = useState<{ isLimited: boolean; cooldownUntil: number | null }>({
    isLimited: false,
    cooldownUntil: null
  });

  const [nearbyTypingCount, setNearbyTypingCount] = useState(0);
  const presenceActions = useRef<{ setTyping: (t: boolean, l?: {lat: number, lng: number}) => void } | null>(null);

  // DEVICE DETECTION LOGIC
  useEffect(() => {
    const checkDevice = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 1024; // Treat screens >= 1024px width as Desktop
      
      // Joustavampi dev-tunnistus
      const searchParams = new URLSearchParams(window.location.search);
      const hasDevFlag = searchParams.has('dev') || searchParams.get('dev') === 'true';

      if (!isMobileUA && !isSmallScreen && !hasDevFlag) {
        setIsDesktop(true);
      } else {
        setIsDesktop(false);
      }
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  // START HANDLER
  const handleStart = (startLoc: { lat: number, lng: number }, isFallback: boolean) => {
      locationCache.current = startLoc;
      setCurrentUserLocation(startLoc); // Set initial visual location
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

  // Perform Global Scan on Boot (Automatic Cache-First)
  useEffect(() => {
      if (appState === 'app') {
          performGlobalScan();
      }
  }, [appState]);

  const performGlobalScan = async (specificQuery?: string) => {
      if (isScanningGlobal) return;
      setIsScanningGlobal(true);
      
      // If targeted scan (specific query), play stronger feedback
      if (specificQuery) {
          SoundService.playScan(); 
          triggerHaptic('heavy');
      } else {
          SoundService.playScan();
          triggerHaptic('light');
      }
      
      try {
          // Fetch real news via Gemini (handles DB cache or API call)
          const events = await scanGlobalNetwork(specificQuery);
          
          if (events.length > 0) {
              setGlobalEvents(prev => {
                  // Merge new events with existing ones, avoiding duplicates
                  const map = new Map(prev.map(p => [p.id, p]));
                  events.forEach(e => map.set(e.id, e));
                  return Array.from(map.values());
              });
              SoundService.playSuccess();
          } else {
              if (specificQuery) alert("No active signals found in sector.");
          }
      } catch (e) {
          console.error("Global scan failed", e);
      } finally {
          setIsScanningGlobal(false);
      }
  };

  // CONTINUOUS GPS TRACKING - STRICT MODE
  useEffect(() => {
    if (!isRunning) return; 

    let watchId: number;

    if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;

                // STRICT: Always update if we have coordinates. 
                if (latitude !== 0 || longitude !== 0) {
                    const newLoc = { lat: latitude, lng: longitude };
                    
                    // 1. Update Logic Cache
                    locationCache.current = newLoc;
                    
                    // 2. Update Visual States
                    setCurrentUserLocation(newLoc);
                    setGpsAccuracy(accuracy); // Update accuracy
                    
                    // 3. Persist
                    localStorage.setItem('kaiku_last_loc', JSON.stringify(newLoc));

                    // Auto-correction from IP fallback to GPS
                    if (isFallbackLocation) {
                        console.log("KAIKU: GPS Lock Acquired via Watcher. Switching to Precision Mode.");
                        setFlyToLocation({ ...newLoc, timestamp: Date.now() }); 
                        setIsFallbackLocation(false); 
                    }
                }
            },
            (err) => {
                console.warn("GPS Watch Error:", err.code, err.message);
                // Do NOT set gpsAccuracy to null here immediately on minor errors, 
                // as Mobile Chrome sometimes throws transient errors in background.
            },
            { 
                // CRITICAL: High Precision Settings for Mobile Chrome
                enableHighAccuracy: true, 
                maximumAge: 0, 
                timeout: 20000 
            }
        );
    }

    return () => {
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
        const myId = getAnonymousID();
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

  // --- MERGE & DEDUPE MESSAGES ---
  const mapMessages = useMemo(() => {
      const combined = [...globalEvents, ...messages];
      const unique = new Map();
      combined.forEach(m => unique.set(m.id, m));
      return Array.from(unique.values());
  }, [globalEvents, messages]);

  useEffect(() => {
    if (!currentBounds) return;
    
    const now = Date.now();
    const centerLat = currentBounds.sectorCenter ? currentBounds.sectorCenter.lat : currentBounds.center.lat;
    const centerLng = currentBounds.sectorCenter ? currentBounds.sectorCenter.lng : currentBounds.center.lng;

    const getRadarScale = (currentZoom: number) => {
        if (currentZoom >= 13) return 1.0;
        if (currentZoom <= 7) return 0.4;
        return 0.4 + ((currentZoom - 7) / (13 - 7)) * (1.0 - 0.4);
    };

    const scale = getRadarScale(currentBounds.zoom);
    const effectiveRadiusPx = BASE_SCAN_RADIUS_PX * scale;

    const metersPerPx = 156543.03 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, currentBounds.zoom);
    const radiusKm = (metersPerPx * effectiveRadiusPx) / 1000;

    let visible = mapMessages.filter(m => {
      const expiry = m.expiresAt || (m.timestamp + MESSAGE_LIFESPAN_MS);
      if (expiry <= now || m.score <= SCORE_THRESHOLD_HIDE) return false;

      const dist = calculateDistance(
          centerLat, 
          centerLng, 
          m.location.lat, 
          m.location.lng
      );
      
      const effectiveRadius = m.postType === 'GLOBAL_EVENT' ? radiusKm * 2 : radiusKm;

      return dist <= effectiveRadius;
    });

    if (currentBounds.zoom < 10) {
        visible = visible.sort((a, b) => b.score - a.score);
    } else {
        visible = visible.sort((a, b) => b.timestamp - a.timestamp);
    }

    setVisibleMessages(visible);
  }, [mapMessages, currentBounds]); 

  const handleViewportChange = useCallback((bounds: ViewportBounds) => {
    setCurrentBounds(bounds);
  }, []);

  const handleMapClick = useCallback(() => {
    setFocusedMessage(null);
    if (isSearchOpen) setIsSearchOpen(false);
    if (isFeedOpen) {
        SoundService.playClick();
        setIsFeedOpen(false);
    } else {
        SoundService.playClick();
    }
  }, [isFeedOpen, isSearchOpen]);

  const handleMessageClick = useCallback((msg: ChatMessage) => {
      SoundService.playClick();
      triggerHaptic('light'); 
      setFocusedMessage(null);
      setTimeout(() => {
          setFocusedMessage(msg); 
      }, 50);
      setIsFeedOpen(false);   
  }, []);

  const handleOpenThread = useCallback((msg: ChatMessage) => {
      SoundService.playClick();
      setSelectedMessage(msg);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
      SoundService.playClick();
      setActiveTag(tag);
      setIsFeedOpen(true);
      setSelectedMessage(null);
  }, []);

  const handleClosePopup = useCallback(() => {
      SoundService.playClick(); 
      setFocusedMessage(null);
  }, []);

  const getLocation = useCallback(async (forceRefresh = false): Promise<{lat: number, lng: number}> => {
     if (locationCache.current && !forceRefresh) return locationCache.current;
     
     try {
         const result = await getPreciseLocation();
         const loc = { lat: result.lat, lng: result.lng };
         
         locationCache.current = loc;
         setCurrentUserLocation(loc); 
         setGpsAccuracy(result.accuracy);
         
         if (result.isFallback) setIsFallbackLocation(true);

         return loc;
     } catch (e: any) {
         console.warn("Location service failed:", e);
         if (locationCache.current) return locationCache.current;
         throw new Error(e.message || "GPS Signal Lost.");
     }
  }, []);

  const handleLocateMe = async () => {
      setIsLocating(true);
      SoundService.playClick();
      triggerHaptic('light');
      
      try {
          const loc = await getLocation(true); 
          setFlyToLocation({ ...loc, timestamp: Date.now() }); 
      } catch (e) {
          console.warn("Locate failed", e);
      } finally {
          setIsLocating(false);
      }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    SoundService.playClick();
    
    // --- TERMINAL COMMAND LOGIC ---
    let queryLocation = searchQuery;
    let isCommand = false;

    if (searchQuery.startsWith('/scan ')) {
        isCommand = true;
        queryLocation = searchQuery.replace('/scan ', '').trim();
    }

    // 1. Resolve Location
    const result = await searchLocations(queryLocation);

    if (result) {
        // Fly to location
        setFlyToLocation({ lat: result.lat, lng: result.lng, timestamp: Date.now() });
        setSearchQuery('');
        SoundService.playSuccess();
        
        // 2. Execute Scan Logic if Command or Implicit Wish
        if (isCommand) {
            setIsSearchOpen(false);
            performGlobalScan(queryLocation);
        } else {
            setIsSearchOpen(false);
        }
    } else {
        alert(t('map.search_not_found'));
        triggerHaptic('error');
    }
    setIsSearching(false);
  };

  const handleOpenInput = async () => {
      SoundService.playClick();
      setTargetLocation(null); 
      getLocation(true).catch(e => console.log("Background wake-up GPS fetch failed", e));
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
    
    try {
        const freshLoc = await getLocation(true);
        finalLat = freshLoc.lat;
        finalLng = freshLoc.lng;
    } catch (e) {}
    
    const userLoc = { lat: finalLat, lng: finalLng };
    
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

  const handleVote = useCallback(async (msgId: string, direction: 'up' | 'down') => {
    SoundService.playClick();
    setMessages(prev => prev.map(m => {
        if (m.id === msgId) {
            const delta = direction === 'up' ? 1 : -1; 
            return { ...m, score: m.score + delta };
        }
        return m;
    }));
    await castVote(msgId, direction);
  }, []);

  const handleDelete = useCallback(async (msgId: string, parentId?: string | null) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    if (selectedMessage?.id === msgId) setSelectedMessage(null);
    if (focusedMessage?.id === msgId) setFocusedMessage(null);
    await deleteMessage(msgId);
  }, [selectedMessage, focusedMessage]);

  const handleToggleHidden = useCallback((msgId: string) => {
      const newSet = toggleHiddenMessage(msgId);
      setHiddenIds(newSet);
      triggerHaptic('light'); 
  }, []);
  
  const toggleMute = () => {
      const newState = SoundService.toggleMute();
      setIsMuted(newState);
      if (!newState) SoundService.playClick();
  };

  if (isDesktop) return <DesktopLanding />;

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
                messages={mapMessages} 
                signals={signals}
                onViewportChange={handleViewportChange}
                onMapClick={handleMapClick}
                lastNewMessage={lastNewMessage}
                hasSignal={hasSignal}
                initialCenter={locationCache.current || undefined}
                flyToLocation={flyToLocation}
                focusedMessage={focusedMessage}
                onOpenThread={handleOpenThread}
                onClosePopup={handleClosePopup}
                hiddenIds={hiddenIds}
                getUserLocation={getLocation}
                userLocation={currentUserLocation} 
            />

            {/* TOP HEADER CONTROLS */}
            <div className="absolute top-0 left-0 right-0 z-[400] p-4 pointer-events-none flex justify-between items-start">
                
                {/* TERMINAL SEARCH BAR & LOGO */}
                <div className="flex items-center gap-2 pointer-events-auto">
                    <AnimatePresence mode="wait">
                        {isSearchOpen ? (
                             <motion.form 
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: "auto", opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                className="flex items-center bg-[#0a0a12]/95 backdrop-blur-xl rounded-md border border-cyan-500 shadow-lg overflow-hidden h-10 font-mono"
                                onSubmit={handleSearchSubmit}
                             >
                                <div className="pl-3 text-cyan-500 animate-pulse">
                                    <Terminal size={14} />
                                </div>
                                <input 
                                    autoFocus
                                    type="text" 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="> ENTER COORDINATES OR /SCAN"
                                    className="bg-transparent text-cyan-400 text-xs px-3 py-2 w-56 focus:outline-none placeholder-cyan-900 font-bold uppercase tracking-wider"
                                />
                                <button type="submit" disabled={isSearching} className="p-2 text-cyan-500 hover:text-white transition-colors bg-cyan-950/30 border-l border-cyan-900">
                                    {isSearching ? <span className="animate-spin text-xs">|</span> : <span className="text-xs">EXE</span>}
                                </button>
                                <button type="button" onClick={() => setIsSearchOpen(false)} className="p-2 text-red-500 hover:text-white border-l border-cyan-900">
                                    <X size={14} />
                                </button>
                             </motion.form>
                        ) : (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex items-center gap-2"
                            >
                                <div className="flex items-center gap-3 bg-[#0a0a12]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg h-10">
                                    <Radio size={18} style={{ color: THEME_COLOR }} className={isScanningGlobal ? "animate-spin" : "animate-pulse"} />
                                    <h1 className="text-sm font-bold tracking-widest text-white">KAIKU</h1>
                                </div>

                                <button 
                                    onClick={() => setIsSearchOpen(true)}
                                    className="w-10 h-10 flex items-center justify-center bg-[#0a0a12]/80 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 text-gray-400 hover:text-cyan-400 transition-colors shadow-lg"
                                >
                                    <Search size={16} />
                                </button>

                                <button 
                                    onClick={toggleMute}
                                    className="w-10 h-10 flex items-center justify-center bg-[#0a0a12]/80 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-colors shadow-lg"
                                >
                                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>

                                {/* GLOBAL SCAN BUTTON */}
                                <button 
                                    onClick={() => performGlobalScan()}
                                    disabled={isScanningGlobal}
                                    className="w-10 h-10 flex items-center justify-center bg-[#0a0a12]/80 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 text-red-400 hover:text-red-300 transition-colors shadow-lg"
                                    title="Global Radar Scan"
                                >
                                    <Zap size={16} className={isScanningGlobal ? "animate-spin" : ""} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* LOCATE ME */}
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
                gpsAccuracy={gpsAccuracy}
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
