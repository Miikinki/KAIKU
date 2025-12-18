import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Radio, Plus, Locate, Zap, Terminal, RefreshCw, Map as MapIcon, List as ListIcon, User, AlertTriangle } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import WelcomeScreen from './components/WelcomeScreen';
import BootSequence from './components/BootSequence';
import DesktopLanding from './components/DesktopLanding';
import TerminalScanner from './components/TerminalScanner';
import AgentDossier from './components/AgentDossier';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, deleteMessage, getLocalMessages, calculateDistance, getHiddenIds, toggleHiddenMessage } from './services/storageService';
import { scanGlobalNetwork } from './services/globalRadarService';
import { getCityName, searchLocations } from './services/moderationService';
import { getPreciseLocation } from './services/locationService';
import { SoundService } from './services/soundService';
import { incrementScanCount } from './services/statsService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence, motion } from 'framer-motion';
import { triggerHaptic } from './services/hapticService';
import { useTranslation } from 'react-i18next';

const BASE_SCAN_RADIUS_PX = 128; 
const SCAN_MOVE_THRESHOLD_KM = 20; // Etäisyys jolloin "Hae tältä alueelta" ilmestyy
const LIST_VIEW_RADIUS_KM = 20; // Fixed radius for list view

type AppState = 'welcome' | 'boot' | 'app';
type ViewMode = 'map' | 'list';

function App() {
  const { t } = useTranslation();
  const [appState, setAppState] = useState<AppState>('welcome');
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isDesktop, setIsDesktop] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => getLocalMessages(true));
  const [globalEvents, setGlobalEvents] = useState<ChatMessage[]>([]); 
  const [scanResults, setScanResults] = useState<ChatMessage[]>([]); 
  const [signals, setSignals] = useState<ChatMessage[]>([]);
  
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const [lastNewMessage, setLastNewMessage] = useState<ChatMessage | null>(null);
  
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isFeedOpen, setIsFeedOpen] = useState(false); 
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [focusedMessage, setFocusedMessage] = useState<ChatMessage | null>(null);

  const [currentBounds, setCurrentBounds] = useState<ViewportBounds | null>(null);
  const [lastScannedCenter, setLastScannedCenter] = useState<{lat: number, lng: number} | null>(null);
  const [isMapDirty, setIsMapDirty] = useState(false);
  
  // NEW: State for contextual scanner button
  const [scanLocationName, setScanLocationName] = useState<string | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [targetLocation, setTargetLocation] = useState<{lat: number, lng: number, name: string} | null>(null);
  
  const locationCache = useRef<{lat: number, lng: number} | null>(null);
  const [currentUserLocation, setCurrentUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [currentCityName, setCurrentCityName] = useState<string | null>(null); // For List View Header
  const [currentCountry, setCurrentCountry] = useState<string | null>(null); // For Reply Foreign Indicators
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); 
  
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);
  const [flyToLocation, setFlyToLocation] = useState<{lat: number, lng: number; timestamp: number; bounds?: [number, number, number, number]} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScanningGlobal, setIsScanningGlobal] = useState(false); 
  const [scannerStatus, setScannerStatus] = useState<string | null>(null);
  const [scannerCity, setScannerCity] = useState<string | null>(null);
  
  // Debug / Status State
  const [isDemoMode, setIsDemoMode] = useState(false);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenIds());

  const [rateLimit, setRateLimit] = useState<{ isLimited: boolean; cooldownUntil: number | null }>({
    isLimited: false,
    cooldownUntil: null
  });

  const [nearbyTypingCount, setNearbyTypingCount] = useState(0);

  useEffect(() => {
    const checkDevice = () => {
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 1024;
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

  const handleStart = (startLoc: { lat: number, lng: number }, isFallback: boolean) => {
      locationCache.current = startLoc;
      setCurrentUserLocation(startLoc);
      setIsFallbackLocation(isFallback);
      localStorage.setItem('kaiku_last_loc', JSON.stringify(startLoc));
      
      // Init City Name & Country
      getCityName(startLoc.lat, startLoc.lng).then(data => {
          setCurrentCityName(data.city);
          if (data.countryCode) setCurrentCountry(data.countryCode);
      });

      triggerHaptic('light');
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

  useEffect(() => {
      if (appState === 'app') {
          performGlobalScan();
      }
  }, [appState]);

  useEffect(() => {
      if (scanResults.length === 0) return;
      const interval = setInterval(() => {
          const now = Date.now();
          setScanResults(prev => prev.filter(r => r.expiresAt > now));
      }, 30000); 
      return () => clearInterval(interval);
  }, [scanResults.length]);

  const performGlobalScan = async (specificQuery?: string) => {
      if (isScanningGlobal) return;
      setIsScanningGlobal(true);
      setScannerStatus(t('welcome.status_acquiring'));
      setScannerCity(null);
      setIsMapDirty(false); 
      
      incrementScanCount();
      
      const isTargeted = !!specificQuery;
      if (isTargeted) {
          triggerHaptic('heavy');
      } else {
          triggerHaptic('light');
      }
      
      try {
          let scanCoord = currentBounds?.sectorCenter || currentBounds?.center || locationCache.current;
          
          if (isTargeted) {
              const res = await searchLocations(specificQuery);
              if (res) {
                  setScannerCity(res.name);
                  setScannerStatus(t('welcome.status_target', { city: res.name }));
                  await new Promise(r => setTimeout(r, 1000));
                  setFlyToLocation({ lat: res.lat, lng: res.lng, timestamp: Date.now(), bounds: res.bounds });
                  scanCoord = { lat: res.lat, lng: res.lng };
              }
          } else if (scanCoord) {
              const cityData = await getCityName(scanCoord.lat, scanCoord.lng);
              const cityName = cityData.city || "Sector X";
              setScannerCity(cityName);
              setScannerStatus(t('welcome.status_target', { city: cityName }));
              await new Promise(r => setTimeout(r, 800));
          }

          if (scanCoord) setLastScannedCenter(scanCoord);

          setScannerStatus(t('welcome.status_scanning_freq'));
          
          // CRITICAL: Call the service
          const events = await scanGlobalNetwork(specificQuery, isTargeted);
          await new Promise(r => setTimeout(r, 600));
          
          if (events.length > 0) {
              // Check for Demo Mode Flag
              if (events[0].tags?.includes('#DEMO')) {
                  setIsDemoMode(true);
              }

              if (isTargeted) {
                  setScanResults(prev => [...prev, ...events]);
              } else {
                  setGlobalEvents(prev => {
                      const map = new Map(prev.map(p => [p.id, p]));
                      events.forEach(e => map.set(e.id, e));
                      return Array.from(map.values());
                  });
              }
              SoundService.playSuccess();
          } else {
              // Notify user if specific search found nothing
              if (isTargeted) {
                  alert(`Signal intercept failed for: ${specificQuery}. No news found.`);
              }
          }
      } catch (e: any) {
          console.error("Global scan failed", e);
          // Only show alert for manual targeted searches. 
          // Suppress errors for auto-scans to prevent startup annoyance.
          if (isTargeted) {
             alert(`Scanner Error: ${e.message || "Connection Failed"}`);
          }
      } finally {
          setIsScanningGlobal(false);
          setScannerStatus(null);
          setScannerCity(null);
      }
  };

  useEffect(() => {
    if (!isRunning) return; 
    let watchId: number;
    if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                if (latitude !== 0 || longitude !== 0) {
                    const newLoc = { lat: latitude, lng: longitude };
                    locationCache.current = newLoc;
                    setCurrentUserLocation(newLoc);
                    setGpsAccuracy(accuracy);
                    
                    // Update City Name & Country occasionally
                    getCityName(latitude, longitude).then(d => {
                         if (d.city && d.city !== currentCityName) setCurrentCityName(d.city);
                         if (d.countryCode) setCurrentCountry(d.countryCode);
                    });

                    localStorage.setItem('kaiku_last_loc', JSON.stringify(newLoc));
                    if (isFallbackLocation) {
                        setFlyToLocation({ ...newLoc, timestamp: Date.now() }); 
                        setIsFallbackLocation(false); 
                    }
                }
            },
            (err) => console.warn("GPS Watch Error:", err.code, err.message),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isRunning, isFallbackLocation, currentCityName]);

  useEffect(() => {
    if (!isRunning) return;
    loadData();
    const subMessages = subscribeToMessages(({ type, message, id }) => {
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
                 }
             }
        }
        return next;
      });
    });
    return () => { if (subMessages) subMessages.unsubscribe(); };
  }, [isRunning]);

  const mapMessages = useMemo(() => {
      const combined = [...globalEvents, ...scanResults, ...messages];
      const unique = new Map();
      combined.forEach(m => unique.set(m.id, m));
      return Array.from(unique.values());
  }, [globalEvents, scanResults, messages]);

  useEffect(() => {
    // Determine filtering logic based on View Mode
    const now = Date.now();
    let centerLat: number;
    let centerLng: number;
    let effectiveRadiusKm: number;

    if (viewMode === 'list') {
        // List Mode: Use User GPS + Fixed Radius
        if (!currentUserLocation) return;
        centerLat = currentUserLocation.lat;
        centerLng = currentUserLocation.lng;
        effectiveRadiusKm = LIST_VIEW_RADIUS_KM;
    } else {
        // Map Mode: Use Viewport Bounds
        if (!currentBounds) return;
        centerLat = currentBounds.sectorCenter ? currentBounds.sectorCenter.lat : currentBounds.center.lat;
        centerLng = currentBounds.sectorCenter ? currentBounds.sectorCenter.lng : currentBounds.center.lng;

        const scale = currentBounds.zoom >= 13 ? 1.0 : (currentBounds.zoom <= 7 ? 0.4 : 0.4 + ((currentBounds.zoom - 7) / (13 - 7)) * (1.0 - 0.4));
        const effectiveRadiusPx = BASE_SCAN_RADIUS_PX * scale;
        const metersPerPx = 156543.03 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, currentBounds.zoom);
        effectiveRadiusKm = (metersPerPx * effectiveRadiusPx) / 1000;
    }

    let visible = mapMessages.filter(m => {
      const expiry = m.expiresAt || (m.timestamp + MESSAGE_LIFESPAN_MS);
      if (expiry <= now || m.score <= SCORE_THRESHOLD_HIDE) return false;
      
      const dist = calculateDistance(centerLat, centerLng, m.location.lat, m.location.lng);
      
      // Global events have wider radius
      const radiusToCheck = (m.postType === 'GLOBAL_EVENT' || m.postType === 'SCAN_RESULT') 
          ? effectiveRadiusKm * 2.5 
          : effectiveRadiusKm;
          
      return dist <= radiusToCheck;
    });

    visible = visible.sort((a, b) => b.timestamp - a.timestamp);
    setVisibleMessages(visible);
    
    // Tarkistetaan onko kartta liikkunut merkittävästi skannauksesta (Only relevant in Map mode)
    if (viewMode === 'map' && lastScannedCenter && !isScanningGlobal) {
        const dist = calculateDistance(centerLat, centerLng, lastScannedCenter.lat, lastScannedCenter.lng);
        if (dist > SCAN_MOVE_THRESHOLD_KM) {
            setIsMapDirty(true);
        } else {
            setIsMapDirty(false);
        }
    }
  }, [mapMessages, currentBounds, lastScannedCenter, isScanningGlobal, viewMode, currentUserLocation]); 

  // EFFECT: Fetch Contextual Name for Scanner Button when map moves
  useEffect(() => {
      if (viewMode !== 'map' || !currentBounds) return;
      
      const { lat, lng } = currentBounds.center;
      
      // Fetch new name based on center
      getCityName(lat, lng).then(data => {
          // If Zoom <= 6, use Country Name. Else use City Name.
          if (currentBounds.zoom <= 6) {
              setScanLocationName(data.countryName || data.countryCode);
          } else {
              setScanLocationName(data.city);
          }
      });
  }, [currentBounds, viewMode]);

  const handleViewportChange = useCallback((bounds: ViewportBounds) => setCurrentBounds(bounds), []);
  const handleMapClick = useCallback(() => {
    setFocusedMessage(null);
    if (isSearchOpen) setIsSearchOpen(false);
    setIsFeedOpen(false);
    triggerHaptic('light');
  }, [isSearchOpen]);

  const handleMessageClick = useCallback((msg: ChatMessage) => {
      triggerHaptic('light'); 
      setFocusedMessage(null);
      // Zoomataan kartta ja avataan modal heti
      setTimeout(() => setFocusedMessage(msg), 50);
      setSelectedMessage(msg);
      if (viewMode === 'map') setIsFeedOpen(false);   
  }, [viewMode]);

  const handleOpenThread = useCallback((msg: ChatMessage) => {
      triggerHaptic('light');
      setSelectedMessage(msg);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
      triggerHaptic('light');
      setActiveTag(tag);
      if (viewMode === 'map') setIsFeedOpen(true);
      setSelectedMessage(null);
  }, [viewMode]);

  const handleLocateMe = async () => {
      setIsLocating(true);
      triggerHaptic('light');
      try {
          const res = await getPreciseLocation();
          const loc = { lat: res.lat, lng: res.lng };
          locationCache.current = loc;
          setCurrentUserLocation(loc);
          setFlyToLocation({ lat: loc.lat, lng: loc.lng, timestamp: Date.now() }); 
      } catch (e) {
          console.warn("Locate failed", e);
      } finally {
          setIsLocating(false);
      }
  };

  const handleOpenInput = () => {
      triggerHaptic('light');
      setTargetLocation(null); 
      setIsInputOpen(true);
  };

  const handleToggleView = () => {
      triggerHaptic('light');
      setViewMode(prev => prev === 'map' ? 'list' : 'map');
      // Reset active selections when switching
      setSelectedMessage(null);
      setFocusedMessage(null);
      setIsFeedOpen(false);
  };

  // CRITICAL FIX: Robust Input Opening
  // Immediately use cached location so user isn't stuck on "Locating..."
  useEffect(() => {
    if (isInputOpen && !targetLocation) {
        
        // 1. Instant Cache Hit (Fastest)
        if (locationCache.current) {
            const cachedLat = locationCache.current.lat;
            const cachedLng = locationCache.current.lng;
            
            getCityName(cachedLat, cachedLng).then(nameData => {
                setTargetLocation({ lat: cachedLat, lng: cachedLng, name: nameData.city });
            });
        }

        // 2. Background Refresh (Precision)
        const acquireLocation = async () => {
            try {
                // Try to get fresh location with the new robust service
                const res = await getPreciseLocation();
                const nameData = await getCityName(res.lat, res.lng);
                
                // Update target and cache
                setTargetLocation({ lat: res.lat, lng: res.lng, name: nameData.city });
                locationCache.current = { lat: res.lat, lng: res.lng };
                
            } catch (e) {
                console.warn("Input GPS failed, using fallback/cache logic...", e);
                
                // If we didn't have a cache hit earlier, we MUST set something now or modal hangs
                if (!locationCache.current) {
                     setTargetLocation({ lat: 0, lng: 0, name: "Unknown Sector" });
                }
            }
        };
        
        acquireLocation();
    }
  }, [isInputOpen]);

  const handleSaveMessage = async (text: string, imageUrl?: string, isMasked: boolean = false) => {
    let finalLat = 0;
    let finalLng = 0;

    // IMMEDIATE SEND LOGIC: Never await getPreciseLocation inside the submit handler
    // This prevents the button from freezing/spinning indefinitely on bad networks
    if (targetLocation) {
        finalLat = targetLocation.lat;
        finalLng = targetLocation.lng;
    } else if (locationCache.current) {
        finalLat = locationCache.current.lat;
        finalLng = locationCache.current.lng;
    } else if (currentUserLocation) {
        finalLat = currentUserLocation.lat;
        finalLng = currentUserLocation.lng;
    } else {
        // Absolute fallback: 0,0. Better to send a broken location than block the user.
        console.warn("Forcing blind send (0,0)");
        finalLat = 0;
        finalLng = 0;
    }

    // We pass finalLat/Lng as BOTH target and user location for simplicity in this fallback scenario
    await saveMessage(text, finalLat, finalLng, finalLat, finalLng, undefined, imageUrl, isMasked);
    await loadData();
  };
  
  const handleReplyMessage = async (text: string, parentId: string) => {
      // IMMEDIATE REPLY LOGIC: Use cache or die trying (0,0)
      // Never block UI on reply for GPS
      let userLoc = locationCache.current;
      
      if (!userLoc) {
          if (currentUserLocation) {
              userLoc = currentUserLocation;
          } else {
              // Blind reply
              userLoc = { lat: 0, lng: 0 };
          }
      }
      
      await saveMessage(text, userLoc.lat, userLoc.lng, userLoc.lat, userLoc.lng, parentId);
      await loadData();
  };

  const handleVote = useCallback(async (msgId: string, direction: 'up' | 'down') => {
    triggerHaptic('heavy');
    await castVote(msgId, direction);
  }, []);

  const handleDelete = useCallback(async (msgId: string, parentId?: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    if (selectedMessage?.id === msgId) setSelectedMessage(null);
    if (focusedMessage?.id === msgId) setFocusedMessage(null);
    triggerHaptic('error');
    await deleteMessage(msgId);
  }, [selectedMessage, focusedMessage]);

  const handleToggleHidden = useCallback((msgId: string) => {
      setHiddenIds(toggleHiddenMessage(msgId));
      triggerHaptic('light'); 
  }, []);
  
  if (isDesktop) return <DesktopLanding />;

  // Logic to determine if FAB is visible.
  // Map Mode: Hidden if Input/Feed/Details open OR if there are visible messages (because FeedPanel covers bottom).
  // List Mode: Always visible unless Input/Details open. FeedPanel is the main view, so FAB floats above it.
  const shouldHideFAB = isInputOpen || selectedMessage || (viewMode === 'map' && (isFeedOpen || visibleMessages.length > 0));

  return (
    <>
        <AnimatePresence mode="wait">
            {appState === 'boot' && (
                <motion.div key="boot" className="fixed inset-0 z-[10000] bg-[#0a0a12] flex items-center justify-center" exit={{ opacity: 0 }} transition={{ duration: 1.5, ease: "easeInOut" }}>
                    <BootSequence onComplete={handleBootComplete} />
                </motion.div>
            )}
        </AnimatePresence>

        {appState === 'welcome' && <WelcomeScreen onStart={handleStart} />}
        
        {appState === 'app' && (
            <div className="fixed inset-0 bg-[#0a0a12] overflow-hidden">
            
            {/* Conditional Rendering of Map vs List container */}
            <div style={{ display: viewMode === 'map' ? 'block' : 'none', width: '100%', height: '100%' }}>
                <ChatMap 
                    messages={mapMessages} 
                    signals={signals}
                    onViewportChange={handleViewportChange}
                    onMapClick={handleMapClick}
                    lastNewMessage={lastNewMessage}
                    hasSignal={visibleMessages.length > 0}
                    initialCenter={locationCache.current || undefined}
                    flyToLocation={flyToLocation}
                    focusedMessage={focusedMessage}
                    onOpenThread={handleOpenThread}
                    onClosePopup={() => setFocusedMessage(null)}
                    hiddenIds={hiddenIds}
                    getUserLocation={async () => locationCache.current || {lat: 0, lng: 0}}
                    userLocation={currentUserLocation} 
                    scannerStatus={scannerStatus}
                    scannerCity={scannerCity}
                />
            </div>

            <TerminalScanner 
              isOpen={isSearchOpen} 
              onClose={() => setIsSearchOpen(false)} 
              onScan={performGlobalScan} 
              isScanning={isScanningGlobal} 
            />
            
            <AgentDossier isOpen={isDossierOpen} onClose={() => setIsDossierOpen(false)} />

            {/* HEADER BAR */}
            <div className="absolute top-0 left-0 right-0 z-[400] p-4 pointer-events-none flex flex-col items-center">
                
                {/* DEMO MODE WARNING BANNER */}
                <AnimatePresence>
                    {isDemoMode && (
                        <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="pointer-events-auto mb-2 bg-amber-500/10 border border-amber-500/50 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2"
                        >
                            <AlertTriangle size={12} className="text-amber-500 animate-pulse" />
                            <span className="text-[9px] font-bold text-amber-400 font-mono tracking-widest uppercase">
                                SIMULATION MODE ACTIVE (NO API KEY)
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="w-full flex justify-between items-start">
                    <div className="flex items-center gap-2 pointer-events-auto">
                        {!isSearchOpen && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-3 bg-[#0a0a12]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg h-10">
                                    <Radio size={18} style={{ color: THEME_COLOR }} className={isScanningGlobal ? "animate-spin" : "animate-pulse"} />
                                    <h1 className="text-sm font-bold tracking-widest text-white">KAIKU</h1>
                                </div>

                                <button onClick={() => setIsSearchOpen(true)} className="w-10 h-10 flex items-center justify-center bg-[#0a0a12]/80 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 text-gray-400 hover:text-cyan-400 transition-colors shadow-lg">
                                    <Terminal size={16} />
                                </button>
                                
                                {/* VIEW TOGGLE SWITCH */}
                                <button 
                                    onClick={handleToggleView}
                                    className="h-10 px-3 flex items-center justify-center gap-2 bg-[#0a0a12]/80 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-colors shadow-lg"
                                >
                                    {viewMode === 'map' ? (
                                        <>
                                            <ListIcon size={16} />
                                            <span className="text-[10px] font-bold hidden sm:inline">{t('feed.view_list')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <MapIcon size={16} />
                                            <span className="text-[10px] font-bold hidden sm:inline">{t('feed.view_map')}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 pointer-events-auto">
                         <button 
                             onClick={() => setIsDossierOpen(true)}
                             className="flex items-center justify-center w-10 h-10 bg-[#0a0a12]/80 backdrop-blur-md border border-cyan-500/30 rounded-full shadow-lg text-cyan-400 hover:bg-cyan-950/80 hover:text-white transition-all active:scale-95"
                         >
                            <User size={18} />
                         </button>
                         <button onClick={handleLocateMe} className={`flex items-center justify-center w-10 h-10 bg-[#0a0a12]/80 backdrop-blur-md border border-cyan-500/30 rounded-full shadow-lg text-cyan-400 hover:bg-cyan-950/80 hover:text-white transition-all active:scale-95 group ${isLocating ? 'animate-pulse' : ''}`}>
                            <Locate size={18} className="group-hover:rotate-45 transition-transform duration-500" />
                        </button>
                    </div>
                </div>

                {/* SEARCH THIS AREA BUTTON (Only relevant for Map Mode) */}
                <AnimatePresence>
                    {viewMode === 'map' && isMapDirty && !isScanningGlobal && !isSearchOpen && !isInputOpen && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-4 pointer-events-auto"
                        >
                            <button 
                                onClick={() => performGlobalScan(scanLocationName || undefined)}
                                className="px-5 py-2.5 bg-cyan-950/80 backdrop-blur-md border border-cyan-500/50 rounded-full text-cyan-100 text-[10px] font-black tracking-[0.2em] uppercase flex items-center gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_15px_rgba(6,182,212,0.3)] hover:bg-cyan-900 transition-all active:scale-95 border-t-cyan-400"
                            >
                                <RefreshCw size={12} className="animate-[spin_4s_linear_infinite]" />
                                {/* Dynamic Text with Animation Key */}
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={scanLocationName || "default"}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        className="whitespace-nowrap"
                                    >
                                        {scanLocationName 
                                            ? t('map.search_context', { location: scanLocationName }) 
                                            : t('map.search_this_area')}
                                    </motion.span>
                                </AnimatePresence>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <FeedPanel 
                visibleMessages={visibleMessages}
                onMessageClick={handleMessageClick} 
                isOpen={isFeedOpen}
                toggleOpen={() => setIsFeedOpen(!isFeedOpen)}
                onVote={handleVote}
                onDelete={handleDelete}
                onRefresh={loadData}
                zoomLevel={currentBounds?.zoom}
                activeTag={activeTag}
                onTagClick={handleTagClick}
                onClearTag={() => setActiveTag(null)}
                nearbyTypingCount={nearbyTypingCount}
                hiddenIds={hiddenIds}
                onToggleHidden={handleToggleHidden}
                onCompose={handleOpenInput}
                viewMode={viewMode}
                currentLocationName={currentCityName}
                userLocation={currentUserLocation}
            />

            <div className={`fixed bottom-24 right-5 z-[500] transition-all duration-300 ${shouldHideFAB ? 'opacity-0 translate-y-10 pointer-events-none' : 'opacity-100 translate-y-0 pointer-events-auto'}`}>
                <button onClick={handleOpenInput} className="flex items-center gap-2 px-5 py-3 bg-[#0a0a12]/80 backdrop-blur-md border border-cyan-500/40 rounded-lg text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)] hover:bg-cyan-950/80 hover:text-white hover:border-cyan-400 transition-all active:scale-95 group">
                    <Plus size={18} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-300" />
                    <span className="font-mono font-bold tracking-widest text-xs uppercase">SIGNAL</span>
                </button>
            </div>

            <ChatInputModal 
                isOpen={isInputOpen}
                onClose={() => setIsInputOpen(false)}
                onSave={handleSaveMessage}
                cooldownUntil={rateLimit.cooldownUntil}
                targetLocationName={targetLocation?.name}
                gpsAccuracy={gpsAccuracy}
            />

            {selectedMessage && (
                <ThreadView 
                    parentMessage={selectedMessage}
                    onClose={() => setSelectedMessage(null)}
                    onReply={handleReplyMessage}
                    onVote={handleVote}
                    onDelete={handleDelete}
                    onTagClick={handleTagClick}
                    hiddenIds={hiddenIds}
                    onToggleHidden={handleToggleHidden}
                    currentUserCountry={currentCountry}
                    userLocation={currentUserLocation}
                />
            )}
            </div>
        )}
    </>
  );
}

export default App;