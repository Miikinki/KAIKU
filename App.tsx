import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Radio, Plus, Locate, Zap, Terminal, RefreshCw } from 'lucide-react';
import ChatMap from './components/ChatMap';
import ChatInputModal from './components/ChatInputModal';
import FeedPanel from './components/FeedPanel';
import ThreadView from './components/ThreadView';
import WelcomeScreen from './components/WelcomeScreen';
import BootSequence from './components/BootSequence';
import DesktopLanding from './components/DesktopLanding';
import TerminalScanner from './components/TerminalScanner';
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, deleteMessage, getLocalMessages, calculateDistance, getHiddenIds, toggleHiddenMessage } from './services/storageService';
import { scanGlobalNetwork } from './services/globalRadarService';
import { getCityName, searchLocations } from './services/moderationService';
import { getPreciseLocation } from './services/locationService';
import { SoundService } from './services/soundService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence, motion } from 'framer-motion';
import { triggerHaptic } from './services/hapticService';
import { useTranslation } from 'react-i18next';

const BASE_SCAN_RADIUS_PX = 128; 
const SCAN_MOVE_THRESHOLD_KM = 20; // Etäisyys jolloin "Hae tältä alueelta" ilmestyy

type AppState = 'welcome' | 'boot' | 'app';

function App() {
  const { t } = useTranslation();
  const [appState, setAppState] = useState<AppState>('welcome');
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
  
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [targetLocation, setTargetLocation] = useState<{lat: number, lng: number, name: string} | null>(null);
  
  const locationCache = useRef<{lat: number, lng: number} | null>(null);
  const [currentUserLocation, setCurrentUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); 
  
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);
  const [flyToLocation, setFlyToLocation] = useState<{lat: number, lng: number; timestamp: number; bounds?: [number, number, number, number]} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScanningGlobal, setIsScanningGlobal] = useState(false); 
  const [scannerStatus, setScannerStatus] = useState<string | null>(null);
  const [scannerCity, setScannerCity] = useState<string | null>(null);

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
      setIsMapDirty(false); // Piilotetaan nappi heti skannauksen alussa
      
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

          // Päivitetään viimeisin skannattu sijainti
          if (scanCoord) setLastScannedCenter(scanCoord);

          setScannerStatus(t('welcome.status_scanning_freq'));
          const events = await scanGlobalNetwork(specificQuery, isTargeted);
          await new Promise(r => setTimeout(r, 600));
          
          if (events.length > 0) {
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
              if (isTargeted) alert("No active signals intercepted in sector.");
          }
      } catch (e) {
          console.error("Global scan failed", e);
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
  }, [isRunning, isFallbackLocation]);

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
    if (!currentBounds) return;
    const now = Date.now();
    const centerLat = currentBounds.sectorCenter ? currentBounds.sectorCenter.lat : currentBounds.center.lat;
    const centerLng = currentBounds.sectorCenter ? currentBounds.sectorCenter.lng : currentBounds.center.lng;

    const scale = currentBounds.zoom >= 13 ? 1.0 : (currentBounds.zoom <= 7 ? 0.4 : 0.4 + ((currentBounds.zoom - 7) / (13 - 7)) * (1.0 - 0.4));
    const effectiveRadiusPx = BASE_SCAN_RADIUS_PX * scale;
    const metersPerPx = 156543.03 * Math.cos(centerLat * Math.PI / 180) / Math.pow(2, currentBounds.zoom);
    const radiusKm = (metersPerPx * effectiveRadiusPx) / 1000;

    let visible = mapMessages.filter(m => {
      const expiry = m.expiresAt || (m.timestamp + MESSAGE_LIFESPAN_MS);
      if (expiry <= now || m.score <= SCORE_THRESHOLD_HIDE) return false;
      const dist = calculateDistance(centerLat, centerLng, m.location.lat, m.location.lng);
      const effectiveRadius = (m.postType === 'GLOBAL_EVENT' || m.postType === 'SCAN_RESULT') ? radiusKm * 2.5 : radiusKm;
      return dist <= effectiveRadius;
    });

    visible = visible.sort((a, b) => b.timestamp - a.timestamp);
    setVisibleMessages(visible);
    
    // Tarkistetaan onko kartta liikkunut merkittävästi skannauksesta
    if (lastScannedCenter && !isScanningGlobal) {
        const dist = calculateDistance(centerLat, centerLng, lastScannedCenter.lat, lastScannedCenter.lng);
        if (dist > SCAN_MOVE_THRESHOLD_KM) {
            setIsMapDirty(true);
        } else {
            setIsMapDirty(false);
        }
    }
  }, [mapMessages, currentBounds, lastScannedCenter, isScanningGlobal]); 

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
      setIsFeedOpen(false);   
  }, []);

  const handleOpenThread = useCallback((msg: ChatMessage) => {
      triggerHaptic('light');
      setSelectedMessage(msg);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
      triggerHaptic('light');
      setActiveTag(tag);
      setIsFeedOpen(true);
      setSelectedMessage(null);
  }, []);

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

  useEffect(() => {
    if (isInputOpen && !targetLocation) {
        getPreciseLocation().then(res => {
            const lat = res.lat;
            const lng = res.lng;
            getCityName(lat, lng).then(nameData => {
                setTargetLocation({ lat, lng, name: nameData.city });
            });
        }).catch(e => {
            console.warn("GPS acquire failed for input", e);
        });
    }
  }, [isInputOpen]);

  const handleSaveMessage = async (text: string, imageUrl?: string, isMasked: boolean = false) => {
    if (!targetLocation) {
        try {
            const res = await getPreciseLocation();
            await saveMessage(text, res.lat, res.lng, res.lat, res.lng, undefined, imageUrl, isMasked);
        } catch (e) {
            throw new Error("GPS Signal required to broadcast.");
        }
    } else {
        const userLoc = { lat: targetLocation.lat, lng: targetLocation.lng };
        await saveMessage(text, targetLocation.lat, targetLocation.lng, userLoc.lat, userLoc.lng, undefined, imageUrl, isMasked);
    }
    await loadData();
  };
  
  const handleReplyMessage = async (text: string, parentId: string) => {
      if (!locationCache.current) return;
      const userLoc = locationCache.current;
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

  const shouldHideFAB = isInputOpen || isFeedOpen || visibleMessages.length > 0;

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

            <TerminalScanner 
              isOpen={isSearchOpen} 
              onClose={() => setIsSearchOpen(false)} 
              onScan={performGlobalScan} 
              isScanning={isScanningGlobal} 
            />

            <div className="absolute top-0 left-0 right-0 z-[400] p-4 pointer-events-none flex flex-col items-center">
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

                                <button onClick={() => performGlobalScan()} disabled={isScanningGlobal} className="w-10 h-10 flex items-center justify-center bg-[#0a0a12]/80 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 text-red-400 hover:text-red-300 transition-colors shadow-lg">
                                    <Zap size={16} className={isScanningGlobal ? "animate-spin" : ""} />
                                </button>
                            </div>
                        )}
                    </div>

                    <button onClick={handleLocateMe} className={`pointer-events-auto flex items-center justify-center w-10 h-10 bg-[#0a0a12]/80 backdrop-blur-md border border-cyan-500/30 rounded-full shadow-lg text-cyan-400 hover:bg-cyan-950/80 hover:text-white transition-all active:scale-95 group ${isLocating ? 'animate-pulse' : ''}`}>
                        <Locate size={18} className="group-hover:rotate-45 transition-transform duration-500" />
                    </button>
                </div>

                {/* SEARCH THIS AREA BUTTON */}
                <AnimatePresence>
                    {isMapDirty && !isScanningGlobal && !isSearchOpen && !isInputOpen && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-4 pointer-events-auto"
                        >
                            <button 
                                onClick={() => performGlobalScan()}
                                className="px-5 py-2.5 bg-cyan-950/80 backdrop-blur-md border border-cyan-500/50 rounded-full text-cyan-100 text-[10px] font-black tracking-[0.2em] uppercase flex items-center gap-2 shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_15px_rgba(6,182,212,0.3)] hover:bg-cyan-900 transition-all active:scale-95 border-t-cyan-400"
                            >
                                <RefreshCw size={12} className="animate-[spin_4s_linear_infinite]" />
                                {t('map.search_this_area')}
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
                />
            )}
            </div>
        )}
    </>
  );
}

export default App;