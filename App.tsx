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
import DebugOverlay from './components/DebugOverlay';
import { Toast } from './components/Toast'; 
import { ChatMessage, ViewportBounds } from './types';
import { fetchMessages, saveMessage, subscribeToMessages, getRateLimitStatus, castVote, deleteMessage, getLocalMessages, calculateDistance, getHiddenIds, toggleHiddenMessage, getUserProfile, getAnonymousID } from './services/storageService';
import { scanGlobalNetwork } from './services/globalRadarService';
import { getCityName, searchLocations } from './services/moderationService';
import { getPreciseLocation } from './services/locationService';
import { SoundService } from './services/soundService';
import { incrementScanCount, processDailyLogin, fetchAgentStats } from './services/statsService';
import { NotificationService } from './services/notificationService';
import { THEME_COLOR, SCORE_THRESHOLD_HIDE, MESSAGE_LIFESPAN_MS } from './constants';
import { AnimatePresence, motion } from 'framer-motion';
import { triggerHaptic } from './services/hapticService';
import { useTranslation } from 'react-i18next';

const BASE_SCAN_RADIUS_PX = 128; 
const SCAN_MOVE_THRESHOLD_KM = 20; 
const LIST_VIEW_RADIUS_KM = 20; 

type AppState = 'welcome' | 'boot' | 'app';
type ViewMode = 'map' | 'list';

function App() {
  const { t } = useTranslation();
  const [appState, setAppState] = useState<AppState>('welcome');
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [isDesktop, setIsDesktop] = useState(false);

  // UNIFIED MESSAGE STREAM
  const [messages, setMessages] = useState<ChatMessage[]>(() => getLocalMessages(true));
  
  // Signals for Arc Layer
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
  
  const [scanLocationName, setScanLocationName] = useState<string | null>(null);
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [targetLocation, setTargetLocation] = useState<{lat: number, lng: number, name: string} | null>(null);
  
  const locationCache = useRef<{lat: number, lng: number} | null>(null);
  const [currentUserLocation, setCurrentUserLocation] = useState<{lat: number, lng: number} | null>(null);
  
  // PRIME TELEPORT: Virtual Location State
  const [virtualLocation, setVirtualLocation] = useState<{lat: number, lng: number} | null>(null);
  
  const [currentCityName, setCurrentCityName] = useState<string | null>(null); 
  const [currentCountry, setCurrentCountry] = useState<string | null>(null); 
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null); 
  
  const [isFallbackLocation, setIsFallbackLocation] = useState(false);
  const [flyToLocation, setFlyToLocation] = useState<{lat: number, lng: number; timestamp: number; bounds?: [number, number, number, number]} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScanningGlobal, setIsScanningGlobal] = useState(false); 
  const [scannerStatus, setScannerStatus] = useState<string | null>(null);
  const [scannerCity, setScannerCity] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Debug / Status State
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => getHiddenIds());

  const [rateLimit, setRateLimit] = useState<{ isLimited: boolean; cooldownUntil: number | null }>({
    isLimited: false,
    cooldownUntil: null
  });

  const [nearbyTypingCount, setNearbyTypingCount] = useState(0);
  
  // EFFECT: Check Daily Streak on App Start
  useEffect(() => {
      const result = processDailyLogin();
      if (result) {
          // Add small delay so it appears after boot
          setTimeout(() => {
              setToastMessage(`${result.message} (+${result.xpGained} XP)`);
              SoundService.playSuccess();
          }, 4000);
      }
  }, []);

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
      
      // Init City Name & Country (One time only on startup)
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
      try {
          const data = await fetchMessages(true);
          setMessages(data);
          setRateLimit(await getRateLimitStatus());
          
          // Retroactive Badge Check on Load
          const { newBadges } = await fetchAgentStats();
          if (newBadges.length > 0) {
              // Iterate and show a toast for each new badge
              newBadges.forEach((badgeId, index) => {
                  setTimeout(() => {
                      const badgeName = t(`badge_${badgeId}`) || badgeId;
                      setToastMessage(`${t('dossier.badge_unlocked', 'BADGE UNLOCKED')}: ${badgeName}`);
                      SoundService.playSuccess();
                      triggerHaptic('success');
                  }, index * 4000); // Stagger toasts if multiple
              });
          }

      } catch (e: any) {
          setLastError(`Data Load: ${e.message}`);
      }
  };

  useEffect(() => {
      if (appState === 'app') {
          performGlobalScan();
      }
  }, [appState]);

  const performGlobalScan = async (specificQuery?: string) => {
      if (isScanningGlobal) return;
      setIsScanningGlobal(true);
      setScannerStatus(t('welcome.status_acquiring'));
      setScannerCity(null);
      setIsMapDirty(false); 
      
      const isTargeted = !!specificQuery;
      if (isTargeted) {
          triggerHaptic('heavy');
      } else {
          triggerHaptic('light');
      }
      
      let effectiveCityName = "Global";

      try {
          let scanCoord = currentBounds?.sectorCenter || currentBounds?.center || locationCache.current;
          
          if (isTargeted) {
              const res = await searchLocations(specificQuery);
              if (res) {
                  setScannerCity(res.name);
                  effectiveCityName = res.name;
                  setScannerStatus(t('welcome.status_target', { city: res.name }));
                  await new Promise(r => setTimeout(r, 1000));
                  setFlyToLocation({ lat: res.lat, lng: res.lng, timestamp: Date.now(), bounds: res.bounds });
                  scanCoord = { lat: res.lat, lng: res.lng };
              }
          } else if (scanCoord) {
              // OPTIMIZATION: Do NOT geocode here if we have a name in scanLocationName already
              // If it's a coordinate string, we leave it as generic "Sector"
              let cityName = scanLocationName;
              if (!cityName || cityName.includes("SECTOR")) {
                   // Fallback for visual status only, okay to skip or be generic
                   cityName = "Sector " + scanCoord.lat.toFixed(1);
              }
              effectiveCityName = cityName;
              setScannerCity(cityName);
              setScannerStatus(t('welcome.status_target', { city: cityName }));
              await new Promise(r => setTimeout(r, 800));
          }

          if (scanCoord) setLastScannedCenter(scanCoord);

          setScannerStatus(t('welcome.status_scanning_freq'));
          
          // SERVICE CALL:
          const events = await scanGlobalNetwork(specificQuery, isTargeted);
          await new Promise(r => setTimeout(r, 600));
          
          if (events.length > 0) {
              // Check for Demo Mode Flag
              if (events[0].tags?.includes('#DEMO')) {
                  setIsDemoMode(true);
              }
              
              SoundService.playSuccess();
              // Force a reload to see new pins immediately
              loadData(); 
              
              const earnedCredit = incrementScanCount(effectiveCityName);
              if (earnedCredit) {
                  setToastMessage(`INTEL ACQUIRED: ${effectiveCityName.toUpperCase()}`);
                  triggerHaptic('success');
              } 

          } else {
              if (isTargeted) {
                  alert(`Signal intercept failed for: ${specificQuery}. No news found.`);
              }
          }
      } catch (e: any) {
          console.error("Global scan failed", e);
          setLastError(`Scan: ${e.message}`);
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
                    
                    // Note: We intentionally DO NOT geocode on every move here.
                    // We only do it once on start or explicit locate.

                    localStorage.setItem('kaiku_last_loc', JSON.stringify(newLoc));
                    if (isFallbackLocation) {
                        setFlyToLocation({ ...newLoc, timestamp: Date.now() }); 
                        setIsFallbackLocation(false); 
                    }
                }
            },
            (err) => {
                console.warn("GPS Watch Error:", err.code, err.message);
                setLastError(`GPS: ${err.message}`);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isRunning, isFallbackLocation, virtualLocation]);

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

             // --- NOTIFICATION & SIGNALS LOGIC ---
             if (type === 'INSERT') {
                 setSignals(s => [...s, message]); // Trigger Arc Layer
                 
                 const myId = getAnonymousID();
                 const profile = getUserProfile();
                 
                 if (profile.notificationsEnabled) {
                     // Check for Reply
                     if (message.parentId) {
                         const parent = prev.find(p => p.id === message.parentId);
                         if (parent && parent.sessionId === myId && message.sessionId !== myId) {
                             NotificationService.sendNotification(
                                 t('notifications.reply_title'), 
                                 t('notifications.reply_body')
                             );
                         }
                     }
                 }
             }
        }
        return next;
      });
    });
    return () => { if (subMessages) subMessages.unsubscribe(); };
  }, [isRunning, t]);

  // Combined messages for map
  const mapMessages = useMemo(() => {
      const unique = new Map();
      messages.forEach(m => unique.set(m.id, m));
      return Array.from(unique.values());
  }, [messages]);

  // Use Virtual Location if Active, else User GPS
  const effectiveLocation = virtualLocation || currentUserLocation;

  useEffect(() => {
    const now = Date.now();
    let centerLat: number;
    let centerLng: number;
    let effectiveRadiusKm: number;

    if (viewMode === 'list') {
        // List Mode: Use Effective Location (Virtual or GPS)
        if (!effectiveLocation) return;
        centerLat = effectiveLocation.lat;
        centerLng = effectiveLocation.lng;
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
      
      const radiusToCheck = (m.postType === 'GLOBAL_EVENT' || m.postType === 'SCAN_RESULT') 
          ? effectiveRadiusKm * 2.5 
          : effectiveRadiusKm;
          
      return dist <= radiusToCheck;
    });

    visible = visible.sort((a, b) => b.timestamp - a.timestamp);
    setVisibleMessages(visible);
    
    if (viewMode === 'map' && lastScannedCenter && !isScanningGlobal) {
        const dist = calculateDistance(centerLat, centerLng, lastScannedCenter.lat, lastScannedCenter.lng);
        if (dist > SCAN_MOVE_THRESHOLD_KM) {
            setIsMapDirty(true);
        } else {
            setIsMapDirty(false);
        }
    }
  }, [mapMessages, currentBounds, lastScannedCenter, isScanningGlobal, viewMode, effectiveLocation]); 

  // EFFECT: Zero-API Context Label Update
  // Calculates the location name based on visible messages OR raw coordinates.
  useEffect(() => {
      if (viewMode !== 'map' || !currentBounds) return;
      
      const { lat, lng } = currentBounds.center;
      
      // 1. If we have messages, assume the most common city name is the context
      if (visibleMessages.length > 0) {
          const counts: Record<string, number> = {};
          visibleMessages.forEach(m => {
              if (m.city && m.city !== "Unknown Sector") {
                  counts[m.city] = (counts[m.city] || 0) + 1;
              }
          });
          
          let topCity = "";
          let maxCount = 0;
          Object.entries(counts).forEach(([city, count]) => {
              if (count > maxCount) {
                  maxCount = count;
                  topCity = city;
              }
          });
          
          if (topCity) {
              setScanLocationName(topCity.toUpperCase());
              return;
          }
      }

      // 2. If no data, use "Sci-Fi" Coordinate Sector format (No API call needed)
      // Format: "SECTOR 60.1 / 24.9"
      const latStr = lat.toFixed(1);
      const lngStr = lng.toFixed(1);
      setScanLocationName(`SECTOR ${latStr} / ${lngStr}`);

  }, [currentBounds, viewMode, visibleMessages]); // Removed expensive dependencies

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
      // Clear Virtual Location on GPS locate
      setVirtualLocation(null); 
      try {
          const res = await getPreciseLocation();
          const loc = { lat: res.lat, lng: res.lng };
          locationCache.current = loc;
          setCurrentUserLocation(loc);
          
          // Here we DO fetch the name because it's a specific user action
          getCityName(loc.lat, loc.lng).then(d => {
              if (d.city) setCurrentCityName(d.city);
              if (d.countryCode) setCurrentCountry(d.countryCode);
          });

          setFlyToLocation({ lat: loc.lat, lng: loc.lng, timestamp: Date.now() }); 
      } catch (e: any) {
          console.warn("Locate failed", e);
          setLastError(`Locate: ${e.message}`);
      } finally {
          setIsLocating(false);
      }
  };

  // NEW: Teleport Handler
  const handleTeleport = (lat: number, lng: number) => {
      triggerHaptic('heavy');
      const newLoc = { lat, lng };
      setVirtualLocation(newLoc);
      
      // Update Name Context (Specific action = API Call allowed)
      getCityName(lat, lng).then(d => {
          setCurrentCityName(d.city);
          if (d.countryCode) setCurrentCountry(d.countryCode);
          setToastMessage(`SATELLITE UPLINK ESTABLISHED: ${d.city.toUpperCase()}`);
      });
  };

  const handleOpenInput = () => {
      triggerHaptic('light');
      setTargetLocation(null); 
      setIsInputOpen(true);
  };

  const handleToggleView = () => {
      triggerHaptic('light');
      setViewMode(prev => prev === 'map' ? 'list' : 'map');
      setSelectedMessage(null);
      setFocusedMessage(null);
      setIsFeedOpen(false);
  };

  // Updated Input Opening logic
  useEffect(() => {
    if (isInputOpen && !targetLocation) {
        // Explicitly fetch location name ONLY when opening the input modal
        
        // 0. VIRTUAL LOCATION (Priority 1)
        if (virtualLocation) {
             getCityName(virtualLocation.lat, virtualLocation.lng).then(nameData => {
                setTargetLocation({ lat: virtualLocation.lat, lng: virtualLocation.lng, name: nameData.city });
            });
            return;
        }

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
                const res = await getPreciseLocation();
                const nameData = await getCityName(res.lat, res.lng);
                
                setTargetLocation({ lat: res.lat, lng: res.lng, name: nameData.city });
                locationCache.current = { lat: res.lat, lng: res.lng };
                
            } catch (e: any) {
                console.warn("Input GPS failed, using fallback/cache logic...", e);
                setLastError(`Input GPS: ${e.message}`);
                
                if (!locationCache.current) {
                     setTargetLocation({ lat: 0, lng: 0, name: "Unknown Sector" });
                }
            }
        };
        
        acquireLocation();
    }
  }, [isInputOpen, virtualLocation]);

  const handleSaveMessage = async (text: string, imageUrl?: string, isMasked: boolean = false) => {
    let finalLat = 0;
    let finalLng = 0;

    // IMMEDIATE SEND LOGIC
    if (targetLocation) {
        finalLat = targetLocation.lat;
        finalLng = targetLocation.lng;
    } else if (effectiveLocation) {
        finalLat = effectiveLocation.lat;
        finalLng = effectiveLocation.lng;
    } else {
        console.warn("Forcing blind send (0,0)");
        finalLat = 0;
        finalLng = 0;
        setLastError("Sent with 0,0 coords (GPS Lock Missing)");
    }

    await saveMessage(text, finalLat, finalLng, finalLat, finalLng, undefined, imageUrl, isMasked);
    await loadData();
  };
  
  const handleReplyMessage = async (text: string, parentId: string) => {
      // Use effective location (Virtual or GPS)
      let userLoc = effectiveLocation || { lat: 0, lng: 0 };
      
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

  const shouldHideFAB = isInputOpen || selectedMessage || (viewMode === 'map' && (isFeedOpen || visibleMessages.length > 0));

  return (
    <>
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
        <DebugOverlay gpsAccuracy={gpsAccuracy} userLocation={effectiveLocation} lastError={lastError} />

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
                    getUserLocation={async () => effectiveLocation || {lat: 0, lng: 0}}
                    userLocation={effectiveLocation} 
                    scannerStatus={scannerStatus}
                    scannerCity={scannerCity}
                    onTeleport={handleTeleport}
                    isTeleporting={!!virtualLocation}
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
                                <div className={`flex items-center gap-3 bg-[#0a0a12]/80 backdrop-blur-md px-4 py-2 rounded-full border shadow-lg h-10 ${virtualLocation ? 'border-yellow-500/50' : 'border-white/10'}`}>
                                    <Radio size={18} style={{ color: virtualLocation ? '#eab308' : THEME_COLOR }} className={isScanningGlobal ? "animate-spin" : "animate-pulse"} />
                                    <h1 className={`text-sm font-bold tracking-widest ${virtualLocation ? 'text-yellow-400' : 'text-white'}`}>
                                        {virtualLocation ? 'UPLINK' : 'KAIKU'}
                                    </h1>
                                </div>

                                <button onClick={() => setIsSearchOpen(true)} className="w-10 h-10 flex items-center justify-center bg-[#0a0a12]/80 backdrop-blur-md rounded-full border border-white/10 hover:bg-white/10 text-gray-400 hover:text-cyan-400 transition-colors shadow-lg">
                                    <Terminal size={16} />
                                </button>
                                
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
                                        {scanLocationName && !scanLocationName.includes('SECTOR')
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
                userLocation={effectiveLocation}
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
                    userLocation={effectiveLocation}
                />
            )}
            </div>
        )}
    </>
  );
}

export default App;