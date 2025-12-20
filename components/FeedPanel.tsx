import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Shield, MapPin, ChevronUp, ChevronDown, RotateCcw, Trash2, Clock, Satellite, Radar, ScanLine, X, Hash, TrendingUp, Zap, Flag, Activity, User, ArrowUp, Radio, Eye, EyeOff, Plus, Lock, Newspaper, ExternalLink, Sparkles, Languages, Loader2, RefreshCw, Crown } from 'lucide-react';
import { ChatMessage } from '../types';
import { getUserVotes, getAnonymousID, getFlagUrl, getFlagEmoji } from '../services/storageService';
import { translateText } from '../services/translationService';
import { triggerHaptic } from '../services/hapticService';
import { useTranslation } from 'react-i18next';
import ImageAttachment from './ImageAttachment';
import { getHumanizedDistance } from '../services/locationService';
import { AVATAR_ICONS, HIGH_SIGNAL_THRESHOLD, LOW_SIGNAL_THRESHOLD, BADGES } from '../constants';

interface FeedPanelProps {
  visibleMessages: ChatMessage[];
  onMessageClick: (msg: ChatMessage) => void;
  isOpen: boolean;
  toggleOpen: () => void;
  onVote: (msgId: string, direction: 'up' | 'down') => void;
  onDelete: (msgId: string, parentId?: string) => void;
  onRefresh?: () => void;
  zoomLevel?: number;
  activeTag: string | null;
  onTagClick: (tag: string) => void;
  onClearTag: () => void;
  nearbyTypingCount?: number; 
  hiddenIds: Set<string>;
  onToggleHidden: (msgId: string) => void;
  onCompose: () => void;
  viewMode: 'map' | 'list';
  currentLocationName?: string | null;
  userLocation?: { lat: number, lng: number } | null;
}

const getSourceName = (url?: string) => {
    if (!url) return 'SOURCE';
    try {
        const domain = new URL(url).hostname.replace('www.', '');
        const parts = domain.split('.');
        return (parts[0] === 'google' ? parts[1] : parts[0]).toUpperCase();
    } catch (e) {
        return 'NEWS';
    }
};

const getSignalHealth = (msg: ChatMessage) => {
    const expiry = msg.expiresAt || (msg.timestamp + 24 * 60 * 60 * 1000);
    const diff = expiry - Date.now();
    const hoursLeft = diff / (1000 * 60 * 60);
    
    return {
        isCritical: hoursLeft < 1, 
        isWeak: hoursLeft < 4,     
        timeLeftMs: diff
    };
};

const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString(); 
};

// Helper for absolute time (for cached news)
const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const FeedPanel: React.FC<FeedPanelProps> = ({ 
    visibleMessages, onMessageClick, isOpen, toggleOpen, onVote, onDelete, onRefresh, zoomLevel,
    activeTag, onTagClick, onClearTag, nearbyTypingCount = 0, hiddenIds, onToggleHidden, onCompose,
    viewMode, currentLocationName, userLocation
}) => {
  const { t, i18n } = useTranslation();
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showMyMessagesOnly, setShowMyMessagesOnly] = useState(false);
  
  // Translation State
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState<Record<string, boolean>>({});
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewMsgToast, setShowNewMsgToast] = useState(false);
  const prevMsgCountRef = useRef(visibleMessages.length);
  
  const currentSessionId = getAnonymousID();

  const isListMode = viewMode === 'list';

  useEffect(() => {
      if (!isOpen && !isListMode) return;
      const interval = setInterval(() => setNow(Date.now()), 60000);
      return () => clearInterval(interval);
  }, [isOpen, isListMode]);

  useEffect(() => {
    setUserVotes(getUserVotes());
  }, [visibleMessages, isOpen, viewMode]);

  useEffect(() => {
    const hasNewMessage = visibleMessages.length > prevMsgCountRef.current;
    const newest = visibleMessages[0];
    const isRecent = newest && (Date.now() - newest.timestamp) < 60000;

    if (hasNewMessage && isRecent) {
        if ((isOpen || isListMode) && scrollRef.current && scrollRef.current.scrollTop > 150) {
            setShowNewMsgToast(true);
            triggerHaptic('light'); 
        }
    }
    prevMsgCountRef.current = visibleMessages.length;
  }, [visibleMessages, isOpen, isListMode]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    if (scrollRef.current.scrollTop < 50) {
        setShowNewMsgToast(false);
    }
  };

  const scrollToTop = () => {
      if (scrollRef.current) {
          triggerHaptic('light');
          scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          setShowNewMsgToast(false);
      }
  };

  const displayMessages = useMemo(() => {
    let msgs = visibleMessages;
    if (activeTag) {
        msgs = msgs.filter(msg => msg.tags?.includes(activeTag) || msg.text.includes(activeTag));
    }
    if (showMyMessagesOnly) {
        msgs = msgs.filter(msg => msg.sessionId === currentSessionId);
    }
    return msgs;
  }, [visibleMessages, activeTag, showMyMessagesOnly, currentSessionId]);

  const trendingTags = useMemo(() => {
      if (activeTag || showMyMessagesOnly) return []; 
      const timeWindow = 24 * 60 * 60 * 1000; 
      const counts: Record<string, number> = {};
      
      visibleMessages.forEach(msg => {
          if (now - msg.timestamp < timeWindow && msg.tags) {
              msg.tags.forEach(tag => {
                  // FILTER: Only show real hashtags (starting with #)
                  // Exclude system tags like __loc, __masked, lang: etc.
                  if (tag.startsWith('#') && tag.length > 1) {
                      counts[tag] = (counts[tag] || 0) + 1;
                  }
              });
          }
      });
      
      return Object.entries(counts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5) 
          .map(([tag, count]) => ({ tag, count }));
  }, [visibleMessages, activeTag, showMyMessagesOnly, now]);


  const handleVoteClick = (e: React.MouseEvent, msgId: string, direction: 'up' | 'down') => {
    e.stopPropagation();
    triggerHaptic('heavy'); 
    onVote(msgId, direction);
    
    // Optimistic local update for UI responsiveness
    setUserVotes(prev => {
        const current = prev[msgId];
        const next = { ...prev };
        if (current === direction) {
            delete next[msgId];
        } else {
            next[msgId] = direction;
        }
        return next;
    });
  };

  const handleToggleHiddenClick = (e: React.MouseEvent, msgId: string) => {
      e.stopPropagation();
      triggerHaptic('light');
      onToggleHidden(msgId);
  };

  const handleDeleteClick = (e: React.MouseEvent, msgId: string, parentId?: string | null) => {
      e.stopPropagation();
      triggerHaptic('error'); 
      if (window.confirm(t('feed.delete_confirm'))) {
          onDelete(msgId, parentId || undefined);
      }
  };

  const handleRefresh = (e: React.MouseEvent) => {
      e.stopPropagation();
      triggerHaptic('light');
      if (onRefresh) {
          setIsRefreshing(true);
          onRefresh();
          setTimeout(() => setIsRefreshing(false), 1000);
      }
  };

  const handleToggleFilter = (e: React.MouseEvent) => {
      e.stopPropagation();
      triggerHaptic('light');
      setShowMyMessagesOnly(!showMyMessagesOnly);
  };

  const handleComposeClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      triggerHaptic('light');
      onCompose();
  };

  // Translation Logic
  const handleTranslate = async (e: React.MouseEvent, msg: ChatMessage) => {
    e.stopPropagation();
    if (translatedMessages[msg.id]) {
        // Toggle off
        const updated = { ...translatedMessages };
        delete updated[msg.id];
        setTranslatedMessages(updated);
        triggerHaptic('light');
        return;
    }

    setIsTranslating(prev => ({ ...prev, [msg.id]: true }));
    triggerHaptic('light');
    
    try {
        const translated = await translateText(msg.text, i18n.language);
        setTranslatedMessages(prev => ({ ...prev, [msg.id]: translated }));
    } catch (error) {
        console.error("Translation failed", error);
    } finally {
        setIsTranslating(prev => ({ ...prev, [msg.id]: false }));
    }
  };

  const renderMessageText = (text: string, isBody: boolean = false) => {
      const parts = text.split(/(#[\p{L}\p{N}_]+)/gu);
      return parts.map((part, index) => {
          if (part.startsWith('#')) {
              return (
                  <span 
                    key={index}
                    onClick={(e) => { e.stopPropagation(); onTagClick(part); }}
                    className="text-cyan-400 font-bold hover:text-cyan-300 hover:underline cursor-pointer transition-colors"
                  >
                      {part}
                  </span>
              );
          }
          return <span key={index}>{part}</span>;
      });
  };

  const renderVisitorBadge = (msg: ChatMessage) => {
    if (!msg.isRemote) return null;
    const isDomestic = msg.country && msg.originCountry === msg.country;
    const title = isDomestic 
        ? t('feed.visitor_remote', { country: msg.originCountry })
        : t('feed.visitor_global', { country: msg.originCountry });

    return (
        <div className="text-amber-400 flex items-center gap-1.5" title={title}>
            <Satellite size={12} />
            {!isDomestic && msg.originCountry && (
                <span className="text-sm leading-none" role="img" aria-label={msg.originCountry}>
                    {getFlagEmoji(msg.originCountry)}
                </span>
            )}
        </div>
    );
  };

  const feedTitle = isListMode 
    ? (currentLocationName || t('feed.local_signals'))
    : (zoomLevel && zoomLevel < 9) ? t('feed.regional_intercept') : t('feed.local_signals');
  const hasSignal = displayMessages.length > 0;
  
  // Variants for Map Mode (Bottom Sheet)
  const mapVariants = {
      open: { y: 0 },
      peek: { y: '55%' },
      collapsed: { y: 'calc(100% - 76px)' } 
  };

  // Variants for List Mode (Full Screen, No Animation between "open/closed" because it's always open)
  const listVariants = {
      open: { y: 0, top: '60px' },
      peek: { y: 0, top: '60px' },
      collapsed: { y: 0, top: '60px' } 
  };

  const currentState = (isOpen || isListMode) 
    ? 'open' 
    : (displayMessages.length === 0 ? 'collapsed' : 'peek');

  const containerClasses = isListMode 
    ? "fixed inset-x-0 bottom-0 bg-[#0a0a12] z-[400] overflow-hidden flex flex-col" // Removed shadow/border for seamless look
    : "fixed inset-x-0 bottom-0 top-[15vh] bg-[#0a0a12]/95 backdrop-blur-xl border-t border-white/10 z-[450] shadow-2xl flex flex-col rounded-t-3xl overflow-hidden";

  return (
    <>
      <motion.div
        initial={isListMode ? "open" : "collapsed"}
        animate={currentState}
        variants={isListMode ? listVariants : mapVariants}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={containerClasses}
      >
        <div 
            className={`p-4 border-b border-white/5 flex flex-col items-center cursor-pointer transition-colors shrink-0 ${isListMode ? 'bg-[#0a0a12]' : 'bg-white/5 hover:bg-white/10'}`}
            onClick={() => { 
                if (!isListMode) {
                    triggerHaptic('light'); toggleOpen(); 
                }
            }}
        >
          {/* Only show Drag Handle in Map Mode */}
          {!isListMode && isOpen && <div className="w-12 h-1.5 bg-white/20 rounded-full mb-4" />}
          
          <div className="w-full flex justify-between items-center px-2">
            <div className="flex items-center gap-4">
                {(!isOpen && !isListMode) ? (
                    <div className="flex items-center gap-3">
                         <div className={`p-1.5 rounded-full ${hasSignal ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800/50 text-gray-500'} ${isRefreshing ? 'animate-spin' : ''}`}>
                             {hasSignal ? <Lock size={18} /> : <ScanLine size={18} />}
                         </div>
                         <div className="flex flex-col">
                             <span className={`text-xs font-bold tracking-widest uppercase ${hasSignal ? 'text-cyan-400' : 'text-gray-400'}`}>
                                {hasSignal ? t('feed.signal_locked') : t('feed.scanning')}
                             </span>
                             <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-mono ${displayMessages.length === 0 ? 'text-gray-500' : 'text-white/60'}`}>
                                    {displayMessages.length} {t('feed.signals_detected')}
                                </span>
                             </div>
                         </div>
                    </div>
                ) : (
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                            {isListMode ? <MapPin size={24} className="text-cyan-400" /> : <Radar size={24} className="text-cyan-400" />}
                            {feedTitle}
                        </h2>
                    </div>
                )}
            </div>
            
            <div className="flex items-center gap-1">
                {/* Only show Compose in Map Mode Header. In List Mode, we rely on the main FAB */}
                {!isListMode && (
                    <button
                        onClick={handleComposeClick}
                        className="p-2 rounded-full bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all active:scale-95 shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                        title="Broadcast Signal"
                    >
                        <Plus size={20} />
                    </button>
                )}

                {(isOpen || isListMode) && (
                    <>
                        <button
                            onClick={handleToggleFilter}
                            className={`p-2 rounded-full transition-all ${showMyMessagesOnly ? 'bg-cyan-500/20 text-cyan-400' : 'hover:bg-white/10 text-gray-400'}`}
                            title="My Signals"
                        >
                            <User size={18} />
                        </button>
                        
                        {onRefresh && (
                            <button 
                                onClick={handleRefresh} 
                                className={`p-2 hover:bg-white/10 rounded-full transition-all ${isRefreshing ? 'animate-spin' : ''} text-gray-400`}
                            >
                                <RotateCcw size={18} />
                            </button>
                        )}
                    </>
                )}
                
                {/* Hide chevron in List Mode */}
                {!isListMode && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); toggleOpen(); }} 
                        className="p-2 hover:bg-white/10 rounded-full text-gray-400"
                    >
                    {isOpen ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
                    </button>
                )}
            </div>
          </div>
        </div>

        <AnimatePresence>
            {activeTag && (
                <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-cyan-900/30 border-b border-cyan-500/30 overflow-hidden shrink-0"
                >
                    <div className="flex items-center justify-between px-6 py-2">
                        <div className="flex items-center gap-2 text-cyan-400 text-sm font-mono">
                            <Hash size={14} />
                            <span>{t('feed.filtering')}: <span className="font-bold">{activeTag}</span></span>
                        </div>
                        <button 
                            onClick={() => { triggerHaptic('light'); onClearTag(); }}
                            className="p-1 hover:bg-white/10 rounded-full text-cyan-200 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className={`relative flex-1 p-4 space-y-3 custom-scrollbar bg-gradient-to-b from-[#0a0a12] to-[#050508] ${isOpen || isListMode ? 'overflow-y-auto' : 'overflow-hidden'}`}
        >
            <AnimatePresence>
                {showNewMsgToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -20, x: "-50%" }}
                        className="fixed left-1/2 z-[500] pointer-events-none"
                        style={{ top: isListMode ? "100px" : "calc(15vh + 90px)" }}
                    >
                         <button
                            onClick={scrollToTop}
                            className="pointer-events-auto flex items-center gap-3 px-5 py-2.5 bg-[#0a0a12]/90 border border-cyan-500/50 rounded-full shadow-[0_0_25px_rgba(6,182,212,0.4)] backdrop-blur-xl text-cyan-400 text-xs font-bold font-mono tracking-widest cursor-pointer hover:bg-cyan-950/80 transition-all active:scale-95 group overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]" />
                            <span className="relative flex items-center gap-2">
                                <Radio size={14} className="animate-pulse" />
                                📡 INCOMING TRANSMISSION
                            </span>
                            <ArrowUp size={14} className="group-hover:-translate-y-0.5 transition-transform text-white" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {(isOpen || isListMode) && !activeTag && !showMyMessagesOnly && trendingTags.length > 0 && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 pb-4 border-b border-white/5"
                >
                    <div className="flex items-center gap-2 mb-3 text-xs font-bold text-cyan-500/80 uppercase tracking-widest px-1">
                         <TrendingUp size={12} />
                         <span>{t('feed.trending_header')}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {trendingTags.map((tItem) => (
                            <button
                                key={tItem.tag}
                                onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); onTagClick(tItem.tag); }}
                                className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/40 transition-all active:scale-95"
                            >
                                <span className="text-sm font-medium text-cyan-200 group-hover:text-cyan-400">{tItem.tag}</span>
                                <span className="text-[10px] text-gray-500 font-mono group-hover:text-cyan-500/70">{tItem.count}</span>
                            </button>
                        ))}
                    </div>
                </motion.div>
            )}

            {displayMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center pb-20">
                <Shield size={48} className="mb-4 opacity-20" />
                <p>{t('feed.no_signals')}</p>
                {activeTag ? (
                    <p className="text-xs mt-2 opacity-50">{t('feed.clear_tag_hint')}</p>
                ) : (
                    <p className="text-xs mt-2 opacity-50">{t('feed.move_radar_hint')}</p>
                )}
            </div>
            ) : (
            displayMessages.map((msg) => {
                const { isCritical, isWeak } = getSignalHealth(msg);
                const userVote = userVotes[msg.id];
                const isMe = msg.sessionId === currentSessionId;
                const isHidden = hiddenIds.has(msg.id);
                const isNews = msg.postType === 'GLOBAL_EVENT' || msg.postType === 'SCAN_RESULT';
                const isTranslated = !!translatedMessages[msg.id];
                const activeText = translatedMessages[msg.id] || msg.text;

                // Signal Strength Logic (Using new constants)
                const isHighSignal = msg.score >= HIGH_SIGNAL_THRESHOLD;
                const isLowSignal = msg.score <= LOW_SIGNAL_THRESHOLD;
                
                // If collapsed (low signal), we blur unless user clicks expand (logic handled by isHidden for simplicity, or we can add local state)
                const isBlurred = isLowSignal && !isMe;

                const textParts = isNews ? activeText.split('\n\n') : [activeText];
                const headline = isNews ? textParts[0] : null;
                const body = isNews ? textParts.slice(1).join('\n\n') : activeText;
                const sourceName = isNews ? getSourceName(msg.eventMetadata?.source_url) : null;
                const sourceUrl = isNews ? msg.eventMetadata?.source_url : null;

                const needsTranslation = isNews && msg.language && msg.language !== i18n.language;

                // Humanized Distance
                let distanceLabel = { text: msg.city || 'UNKNOWN', style: 'text-gray-500' };
                if (userLocation) {
                    distanceLabel = getHumanizedDistance(
                        userLocation.lat, userLocation.lng,
                        msg.location.lat, msg.location.lng,
                        msg.city,
                        t
                    );
                }

                let borderClass = 'border-white/5 hover:border-cyan-500/30'; 
                let bgClass = 'bg-white/5 hover:bg-white/10';

                if (isMe) {
                    borderClass = 'border-cyan-500/60 hover:border-cyan-400';
                    bgClass = 'bg-cyan-950/10 hover:bg-cyan-950/20';
                } else if (isHighSignal && !isNews) {
                    borderClass = 'border-cyan-400/50 hover:border-cyan-400';
                    bgClass = 'bg-cyan-900/10 hover:bg-cyan-900/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]';
                } else if (isLowSignal && !isNews) {
                     borderClass = 'border-white/5 opacity-50';
                     bgClass = 'bg-black/40';
                } else if (isCritical && !isNews) {
                    borderClass = 'border-red-500/50 hover:border-red-500';
                    bgClass = 'bg-red-950/10';
                }

                if (isHidden) {
                    bgClass = 'bg-gray-900/50';
                    borderClass = 'border-white/5';
                }

                // Identity Styling
                const displayName = msg.userDisplayName || (isNews ? 'SYSTEM' : t('dossier.anonymous'));
                const identityColor = isNews ? '#ef4444' : (msg.userColor || (isMe ? '#06b6d4' : '#9ca3af'));

                return (
                <motion.div
                key={msg.id}
                layoutId={isListMode ? undefined : msg.id} // Disable layoutId in list mode to prevent transition issues
                onClick={() => !isHidden && onMessageClick(msg)}
                className={`group border rounded-xl p-4 cursor-pointer transition-all flex gap-4 ${borderClass} ${bgClass}`}
                >
                {/* VOTING COLUMN (Left) */}
                <div className="flex flex-col items-center justify-start gap-1 min-w-[30px]">
                    <button 
                        onClick={(e) => handleVoteClick(e, msg.id, 'up')}
                        className={`p-1 rounded transition-colors ${userVote === 'up' ? 'text-cyan-400' : 'text-gray-600 hover:text-cyan-400'}`}
                    >
                        <ChevronUp size={24} strokeWidth={3} />
                    </button>
                    
                    <span className={`text-sm font-mono font-bold ${
                        userVote === 'up' ? 'text-cyan-400' : 
                        userVote === 'down' ? 'text-red-500' : 
                        isHighSignal ? 'text-cyan-200 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]' :
                        'text-gray-500'
                    }`}>
                        {msg.score}
                    </span>

                    <button 
                        onClick={(e) => handleVoteClick(e, msg.id, 'down')}
                        className={`p-1 rounded transition-colors ${userVote === 'down' ? 'text-red-500' : 'text-gray-600 hover:text-red-500'}`}
                    >
                        <ChevronDown size={24} strokeWidth={3} />
                    </button>
                </div>

                <div className={`flex-1 ${isBlurred && !isHidden ? 'blur-sm grayscale opacity-50 hover:blur-none hover:grayscale-0 hover:opacity-100 transition-all duration-300' : ''}`}>
                    <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center flex-wrap gap-2 text-[12px] text-gray-500 font-medium">
                            {/* Avatar Mini Icon */}
                            {!isNews && msg.userAvatar && AVATAR_ICONS[msg.userAvatar] && (
                                <div className="w-4 h-4 rounded-full border border-white/10 flex items-center justify-center bg-black/30" style={{ color: identityColor }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                                        <path d={AVATAR_ICONS[msg.userAvatar]} />
                                    </svg>
                                </div>
                            )}

                            <span className="font-mono font-bold tracking-wide uppercase text-[10px]" style={{ color: identityColor }}>
                                {displayName}
                            </span>
                            
                            {/* LEVEL BADGE */}
                            {!isNews && msg.userLevel && !msg.hideLevel && (
                                <div className="px-1.5 py-0.5 rounded border border-white/10 bg-cyan-900/30 text-cyan-400 text-[9px] font-mono font-black">
                                    LVL {msg.userLevel}
                                </div>
                            )}

                            {/* BADGES */}
                            {!isNews && msg.userBadges && msg.userBadges.length > 0 && (
                                <div className="flex items-center gap-0.5 ml-1">
                                    {msg.userBadges.map(bid => BADGES[bid] ? (
                                        <span key={bid} title={t(BADGES[bid].translationKey)} className="text-xs filter drop-shadow-md">
                                            {BADGES[bid].icon}
                                        </span>
                                    ) : null)}
                                </div>
                            )}
                            
                            <span>•</span>
                            
                            <div className="flex items-center gap-1">
                                <MapPin size={10} className={userLocation ? 'text-cyan-500' : 'text-gray-600'} />
                                <span className={`truncate max-w-[120px] flex items-center gap-1 ${distanceLabel.style}`}>
                                    {distanceLabel.text}
                                    {isNews && msg.country && (
                                        <span className="text-sm leading-none ml-1 grayscale-0" role="img" aria-label={msg.country}>
                                            {getFlagEmoji(msg.country)}
                                        </span>
                                    )}
                                </span>
                            </div>
                            
                            {isNews && sourceName && (
                                <>
                                    <span>•</span>
                                    <div className="bg-white/5 text-gray-300 px-2 py-0.5 rounded-full border border-white/10 text-[9px] font-bold tracking-widest flex items-center gap-1">
                                        <span className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse"></span>
                                        {sourceName}
                                    </div>
                                </>
                            )}

                            <span>•</span>

                            <div className="flex items-center gap-1">
                                <Clock size={10} />
                                {formatRelativeTime(msg.timestamp)}
                            </div>

                            {needsTranslation && !isHidden && (
                                <button 
                                    onClick={(e) => handleTranslate(e, msg)}
                                    className="flex items-center gap-1 text-cyan-400 hover:text-white font-bold ml-1 transition-colors group/trans"
                                    disabled={isTranslating[msg.id]}
                                >
                                    {isTranslating[msg.id] ? (
                                        <Loader2 size={10} className="animate-spin" />
                                    ) : (
                                        <Languages size={10} className="group-hover/trans:rotate-12 transition-transform" />
                                    )}
                                    <span>{isTranslated ? t('feed.show_original') : t('feed.translate')}</span>
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {!isHidden && renderVisitorBadge(msg)}

                            {isMe && (
                                <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30">
                                    ME
                                </span>
                            )}

                            {msg.sessionId === currentSessionId ? (
                                <button 
                                    onClick={(e) => handleDeleteClick(e, msg.id, msg.parentId)}
                                    className="relative z-10 p-1.5 bg-red-500/10 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                >
                                    <Trash2 size={12} />
                                </button>
                            ) : (
                                <button 
                                    onClick={(e) => handleToggleHiddenClick(e, msg.id)}
                                    className={`relative z-10 p-1.5 transition-colors ${isHidden ? 'text-cyan-400 hover:text-white' : 'text-gray-600 hover:text-white'}`}
                                    title={isHidden ? "Unhide Signal" : "Hide Signal"}
                                >
                                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {isHidden ? (
                        <p className="text-sm text-gray-600 italic leading-relaxed font-light break-words select-none">
                            ** CONTENT HIDDEN **
                        </p>
                    ) : isNews && headline ? (
                        <div className="space-y-3">
                            <h3 className="text-lg font-bold text-white leading-snug break-words flex items-start gap-2">
                                {isTranslated && <Sparkles size={14} className="text-cyan-400 shrink-0 mt-1" />}
                                {headline}
                            </h3>
                            <p className="text-base text-[#D1D5DB] font-normal leading-relaxed break-words line-clamp-3">
                                {renderMessageText(body, true)}
                            </p>
                            
                            <div className="flex items-center justify-between pt-2">
                                <div className="flex items-center gap-3">
                                    {sourceUrl && (
                                        <a 
                                            href={sourceUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                                        >
                                            {t('news.read_original', { source: sourceName })}
                                            <ExternalLink size={10} />
                                        </a>
                                    )}
                                    {/* CACHE TIME INDICATOR */}
                                    <span className="flex items-center gap-1 text-[9px] font-mono text-gray-500 uppercase tracking-tight" title="Data fetched time">
                                        <RefreshCw size={8} />
                                        UPDATED: {formatTime(msg.timestamp)}
                                    </span>
                                </div>

                                {isTranslated && (
                                    <span className="text-[9px] font-mono text-cyan-500/50 flex items-center gap-1 uppercase tracking-tighter">
                                        <Shield size={10} />
                                        {t('feed.translated_by_ai')}
                                    </span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <p className={`text-base leading-relaxed font-normal break-words ${isNews ? 'text-[#D1D5DB]' : 'text-gray-100'}`}>
                             {renderMessageText(body)}
                        </p>
                    )}

                    {!isHidden && msg.imageUrl && (
                        <ImageAttachment src={msg.imageUrl} />
                    )}
                    
                    {!isHidden && (
                        <div className="mt-4 flex justify-between items-center border-t border-white/5 pt-3">
                             <div className="flex items-center gap-2">
                                {/* Removed old Impact button since voting is now main control */}
                             </div>
                            
                            <div className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                                <MessageSquare size={14} />
                                <span>{msg.replyCount || 0} {t('feed.replies')}</span>
                            </div>
                        </div>
                    )}
                </div>
                </motion.div>
            )})
            )}
            
            {nearbyTypingCount > 0 && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="sticky bottom-0 left-0 right-0 p-3 mt-4 bg-[#0a0a12]/90 backdrop-blur-md border-t border-cyan-500/20 flex items-center justify-center gap-3 z-30"
                >
                     <div className="flex space-x-1">
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                     </div>
                     <span className="text-[10px] text-cyan-400 font-mono tracking-widest animate-pulse">
                         DETECTING INCOMING TRANSMISSION...
                     </span>
                </motion.div>
            )}

            <div className="h-20" /> 
            
            {/* Show "Pull Up" chevron ONLY in Map Mode (when closed) */}
            {!isOpen && !isListMode && displayMessages.length > 2 && (
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('light');
                        toggleOpen();
                    }}
                    className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0a0a12] via-[#0a0a12]/80 to-transparent z-20 cursor-pointer flex items-end justify-center pb-8 group"
                >
                    <div className="flex flex-col items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                         <ChevronUp className="text-cyan-400 animate-bounce" size={20} />
                    </div>
                </div>
            )}
        </div>
      </motion.div>
    </>
  );
};

export default FeedPanel;