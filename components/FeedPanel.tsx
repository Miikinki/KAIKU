import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Shield, MapPin, ChevronUp, ChevronDown, RotateCcw, Trash2, Clock, Satellite, Radar, ScanLine, X, Hash, TrendingUp, Zap, Flag, Activity, User, ArrowUp, Radio, Eye, EyeOff, Plus, Lock } from 'lucide-react';
import { ChatMessage } from '../types';
import { getUserVotes, getAnonymousID, getFlagUrl, getFlagEmoji } from '../services/storageService';
import { triggerHaptic } from '../services/hapticService';
import { useTranslation } from 'react-i18next';
import ImageAttachment from './ImageAttachment';

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
}

// Helper: Calculate if signal is dying
const getSignalHealth = (msg: ChatMessage) => {
    const expiry = msg.expiresAt || (msg.timestamp + 24 * 60 * 60 * 1000);
    const diff = expiry - Date.now();
    const hoursLeft = diff / (1000 * 60 * 60);
    
    return {
        isCritical: hoursLeft < 1, // < 1h
        isWeak: hoursLeft < 4,     // < 4h
        timeLeftMs: diff
    };
};

// Helper: Relative Creation Time (e.g. "5m ago")
const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString(); // Fallback for very old
};

const FeedPanel: React.FC<FeedPanelProps> = ({ 
    visibleMessages, onMessageClick, isOpen, toggleOpen, onVote, onDelete, onRefresh, zoomLevel,
    activeTag, onTagClick, onClearTag, nearbyTypingCount = 0, hiddenIds, onToggleHidden, onCompose
}) => {
  const { t } = useTranslation();
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showMyMessagesOnly, setShowMyMessagesOnly] = useState(false);
  
  // TOAST LOGIC STATE
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewMsgToast, setShowNewMsgToast] = useState(false);
  const prevMsgCountRef = useRef(visibleMessages.length);
  
  const currentSessionId = getAnonymousID();

  // Update ticker
  useEffect(() => {
      if (!isOpen) return;
      const interval = setInterval(() => setNow(Date.now()), 60000); // Update every minute
      return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    setUserVotes(getUserVotes());
  }, [visibleMessages, isOpen]);

  // --- NEW SIGNAL TOAST LOGIC ---
  useEffect(() => {
    const hasNewMessage = visibleMessages.length > prevMsgCountRef.current;
    const newest = visibleMessages[0];

    // Check if the newest message is actually RECENT (e.g. within last 60 seconds)
    // This prevents the toast from appearing when panning the map into an area with old messages.
    const isRecent = newest && (Date.now() - newest.timestamp) < 60000;

    if (hasNewMessage && isRecent) {
        // AND we are currently open and scrolled down significantly
        if (isOpen && scrollRef.current && scrollRef.current.scrollTop > 150) {
            setShowNewMsgToast(true);
            triggerHaptic('light'); // Subtle notification feeling
        }
    }
    prevMsgCountRef.current = visibleMessages.length;
  }, [visibleMessages, isOpen]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    // If user scrolls back to top manually, hide the toast
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

  // --- FILTERING LOGIC ---
  const displayMessages = useMemo(() => {
    let msgs = visibleMessages;
    
    // 1. Tag Filter
    if (activeTag) {
        msgs = msgs.filter(msg => msg.tags?.includes(activeTag) || msg.text.includes(activeTag));
    }
    
    // 2. "My Messages" Filter
    if (showMyMessagesOnly) {
        msgs = msgs.filter(msg => msg.sessionId === currentSessionId);
    }
    
    return msgs;
  }, [visibleMessages, activeTag, showMyMessagesOnly, currentSessionId]);

  // --- TRENDING CALCULATION ---
  const trendingTags = useMemo(() => {
      if (activeTag || showMyMessagesOnly) return []; 

      const timeWindow = 24 * 60 * 60 * 1000; 
      const counts: Record<string, number> = {};

      visibleMessages.forEach(msg => {
          if (now - msg.timestamp < timeWindow && msg.tags) {
              msg.tags.forEach(tag => {
                  counts[tag] = (counts[tag] || 0) + 1;
              });
          }
      });

      return Object.entries(counts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5) 
          .map(([tag, count]) => ({ tag, count }));
  }, [visibleMessages, activeTag, showMyMessagesOnly, now]);


  const handleBoostClick = (e: React.MouseEvent, msgId: string) => {
    e.stopPropagation();
    if (userVotes[msgId] === 'up') return; // Already boosted

    triggerHaptic('heavy'); // Heavy vibration for power action
    onVote(msgId, 'up');
    setUserVotes(prev => ({ ...prev, [msgId]: 'up' }));
  };

  // Replaces Report: Toggles Local Visibility
  const handleToggleHiddenClick = (e: React.MouseEvent, msgId: string) => {
      e.stopPropagation();
      onToggleHidden(msgId);
  };

  const handleDeleteClick = (e: React.MouseEvent, msgId: string, parentId?: string | null) => {
      e.stopPropagation();
      triggerHaptic('error'); // Warn user tactilely
      if (window.confirm(t('feed.delete_confirm'))) {
          onDelete(msgId, parentId || undefined);
      }
  };

  const handleRefresh = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onRefresh) {
          triggerHaptic('light');
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

  // --- TEXT PARSER ---
  const renderMessageText = (text: string) => {
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

  const feedTitle = (zoomLevel && zoomLevel < 9) ? t('feed.regional_intercept') : t('feed.local_signals');
  const hasSignal = displayMessages.length > 0;
  
  const variants = {
      open: { y: 0 },
      peek: { y: '55%' },
      collapsed: { y: 'calc(100% - 76px)' } 
  };

  const currentState = isOpen 
    ? 'open' 
    : (displayMessages.length === 0 ? 'collapsed' : 'peek');

  return (
    <>
      <motion.div
        initial="collapsed"
        animate={currentState}
        variants={variants}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-x-0 bottom-0 top-[15vh] bg-[#0a0a12]/95 backdrop-blur-xl border-t border-white/10 z-[450] shadow-2xl flex flex-col rounded-t-3xl overflow-hidden"
      >
        <div 
            className="p-4 border-b border-white/5 flex flex-col items-center bg-white/5 cursor-pointer transition-colors hover:bg-white/10 shrink-0"
            onClick={toggleOpen}
        >
          {isOpen && <div className="w-12 h-1.5 bg-white/20 rounded-full mb-4" />}
          
          <div className="w-full flex justify-between items-center px-2">
            <div className="flex items-center gap-4">
                {!isOpen ? (
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
                        <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                            <Radar size={24} className="text-cyan-400" />
                            {feedTitle}
                        </h2>
                    </div>
                )}
            </div>
            
            <div className="flex items-center gap-1">
                {/* COMPACT SIGNAL BUTTON - REPLACES BULKY TEXT BUTTON */}
                <button
                    onClick={handleComposeClick}
                    className="p-2 rounded-full bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all active:scale-95 shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                    title="Broadcast Signal"
                >
                    <Plus size={20} />
                </button>

                {isOpen && (
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
                
                <button 
                    onClick={(e) => { e.stopPropagation(); toggleOpen(); }} 
                    className="p-2 hover:bg-white/10 rounded-full text-gray-400"
                >
                {isOpen ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
                </button>
            </div>
          </div>
        </div>

        {/* ACTIVE FILTER BANNER */}
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
                            onClick={onClearTag}
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
            className={`relative flex-1 p-4 space-y-3 custom-scrollbar bg-gradient-to-b from-[#0a0a12] to-[#050508] ${isOpen ? 'overflow-y-auto' : 'overflow-hidden'}`}
        >
            
            {/* NEW SIGNAL TOAST (Notification) */}
            <AnimatePresence>
                {showNewMsgToast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, x: "-50%" }}
                        animate={{ opacity: 1, y: 0, x: "-50%" }}
                        exit={{ opacity: 0, y: -20, x: "-50%" }}
                        className="fixed left-1/2 z-[500] pointer-events-none"
                        style={{ top: "calc(15vh + 90px)" }} // Approx position relative to header
                    >
                         <button
                            onClick={scrollToTop}
                            className="pointer-events-auto flex items-center gap-3 px-5 py-2.5 bg-[#0a0a12]/90 border border-cyan-500/50 rounded-full shadow-[0_0_25px_rgba(6,182,212,0.4)] backdrop-blur-xl text-cyan-400 text-xs font-bold font-mono tracking-widest cursor-pointer hover:bg-cyan-950/80 transition-all active:scale-95 group overflow-hidden"
                        >
                            {/* Scanning Animation Background */}
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

            {/* TRENDING TOPICS */}
            {isOpen && !activeTag && !showMyMessagesOnly && trendingTags.length > 0 && (
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
                                onClick={(e) => { e.stopPropagation(); onTagClick(tItem.tag); }}
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
                const isBoosted = userVotes[msg.id] === 'up';
                const isMe = msg.sessionId === currentSessionId;
                const isHidden = hiddenIds.has(msg.id);
                const isGlobal = msg.postType === 'GLOBAL_EVENT';

                // BORDER & BG COLOR LOGIC
                // Priority: My Message (Cyan) > Critical (Red) > Weak (Orange) > Normal (White/Gray)
                let borderClass = 'border-white/5 hover:border-cyan-500/30'; 
                let bgClass = 'bg-white/5 hover:bg-white/10';

                if (isMe) {
                    borderClass = 'border-cyan-500/60 hover:border-cyan-400';
                    bgClass = 'bg-cyan-950/10 hover:bg-cyan-950/20';
                } else if (isCritical) {
                    borderClass = 'border-red-500/50 hover:border-red-500';
                    bgClass = 'bg-red-950/10';
                } else if (isWeak) {
                    borderClass = 'border-orange-500/30 hover:border-orange-500/60';
                    bgClass = 'bg-orange-950/5';
                }

                if (isHidden) {
                    bgClass = 'bg-gray-900/50';
                    borderClass = 'border-white/5';
                }

                return (
                <motion.div
                key={msg.id}
                layoutId={msg.id}
                onClick={() => !isHidden && onMessageClick(msg)}
                className={`group border rounded-xl p-4 cursor-pointer transition-all flex gap-4 ${borderClass} ${bgClass}`}
                >
                <div className="flex flex-col items-center justify-start gap-1 min-w-[30px] pt-1">
                    <button 
                        onClick={(e) => handleBoostClick(e, msg.id)}
                        className={`p-2 rounded-full transition-all ${isBoosted ? 'text-cyan-400 bg-cyan-400/10 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                        disabled={isBoosted || isHidden}
                    >
                        <Zap size={20} className={isBoosted ? "fill-cyan-400" : ""} />
                    </button>
                    {!isHidden && (
                        isGlobal ? (
                            <span className="text-[10px] text-red-500 font-mono font-bold animate-pulse tracking-widest bg-red-500/10 px-1 rounded border border-red-500/30">
                                SYS
                            </span>
                        ) : (
                            <span className={`text-xs font-bold font-mono ${isBoosted ? 'text-cyan-400' : 'text-gray-500'}`}>
                                {msg.score}
                            </span>
                        )
                    )}
                </div>

                <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-mono">
                            <MapPin size={10} className="text-cyan-500" />
                            <span className="font-bold text-gray-300 truncate max-w-[140px] sm:max-w-[200px] flex items-center gap-1">
                                {msg.city || 'UNKNOWN SECTOR'}
                                {/* COUNTRY FLAG for Global Events */}
                                {isGlobal && msg.country && (
                                    <span className="text-sm leading-none ml-1" role="img" aria-label={msg.country}>
                                        {getFlagEmoji(msg.country)}
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isHidden && renderVisitorBadge(msg)}

                            {/* "ME" BADGE */}
                            {isMe && (
                                <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30">
                                    ME
                                </span>
                            )}

                            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-gray-400">
                                <Clock size={10} />
                                {formatRelativeTime(msg.timestamp)}
                                {!isMe && !isHidden && isCritical && (
                                    <span className="text-red-500 ml-1 animate-pulse tracking-wider">FAILING</span>
                                )}
                            </div>

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
                    
                    {/* Render Text */}
                    <p className={`text-base leading-relaxed font-light break-words ${isHidden ? 'text-gray-600 italic select-none' : 'text-gray-100'}`}>
                        {isHidden ? "** CONTENT HIDDEN **" : renderMessageText(msg.text)}
                    </p>

                    {/* Render Image Attachment */}
                    {!isHidden && msg.imageUrl && (
                        <ImageAttachment src={msg.imageUrl} />
                    )}
                    
                    {!isHidden && (
                        <div className="mt-3 flex justify-between items-center border-t border-white/5 pt-2">
                            <span className="text-[10px] text-gray-600 font-mono">ID: {msg.sessionId.slice(0, 8)}</span>
                            
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
            
            {/* ANONYMOUS TYPING INDICATOR (GHOST) */}
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
            
            {/* Gradient Fade for Peek Mode - Visual Hint to scroll/open */}
            {!isOpen && displayMessages.length > 2 && (
                <div 
                    onClick={(e) => {
                        e.stopPropagation();
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