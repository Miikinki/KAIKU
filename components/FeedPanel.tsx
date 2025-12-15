import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Shield, MapPin, ChevronUp, ChevronDown, RotateCcw, Trash2, Clock, Satellite, Radar, ScanLine, X, Hash, TrendingUp, Zap, Flag, Activity } from 'lucide-react';
import { ChatMessage } from '../types';
import { getUserVotes, getAnonymousID, getFlagUrl } from '../services/storageService';
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
    activeTag, onTagClick, onClearTag
}) => {
  const { t } = useTranslation();
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  
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

  // --- TRENDING CALCULATION ---
  const trendingTags = useMemo(() => {
      if (activeTag) return []; 

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
  }, [visibleMessages, activeTag, now]);


  const handleBoostClick = (e: React.MouseEvent, msgId: string) => {
    e.stopPropagation();
    if (userVotes[msgId] === 'up') return; // Already boosted

    onVote(msgId, 'up');
    setUserVotes(prev => ({ ...prev, [msgId]: 'up' }));
  };

  const handleReportClick = (e: React.MouseEvent, msgId: string) => {
      e.stopPropagation();
      if (window.confirm("Report this signal as spam/offensive? It will be removed from your view.")) {
          onDelete(msgId);
      }
  };

  const handleDeleteClick = (e: React.MouseEvent, msgId: string, parentId?: string | null) => {
      e.stopPropagation();
      if (window.confirm(t('feed.delete_confirm'))) {
          onDelete(msgId, parentId || undefined);
      }
  };

  const handleRefresh = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onRefresh) {
          setIsRefreshing(true);
          onRefresh();
          setTimeout(() => setIsRefreshing(false), 1000);
      }
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

  const displayMessages = activeTag 
    ? visibleMessages.filter(msg => msg.tags?.includes(activeTag) || msg.text.includes(activeTag))
    : visibleMessages;

  const renderVisitorBadge = (msg: ChatMessage) => {
    if (!msg.isRemote) return null;

    const isDomestic = msg.country && msg.originCountry === msg.country;
    const flagUrl = getFlagUrl(msg.originCountry);
    const title = isDomestic 
        ? t('feed.visitor_remote', { country: msg.originCountry })
        : t('feed.visitor_global', { country: msg.originCountry });

    return (
        <div className="text-amber-400 flex items-center gap-1.5" title={title}>
            <Satellite size={12} />
            {!isDomestic && flagUrl && (
                <img src={flagUrl} alt={msg.originCountry} className="w-4 h-3 rounded-[2px] object-cover" />
            )}
        </div>
    );
  };

  const feedTitle = (zoomLevel && zoomLevel < 9) ? t('feed.regional_intercept') : t('feed.local_signals');
  
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
                         <div className={`p-1.5 rounded-full bg-cyan-500/10 ${isRefreshing ? 'animate-spin' : ''}`}>
                             <ScanLine size={18} className="text-cyan-400" />
                         </div>
                         <div className="flex flex-col">
                             <span className="text-sm font-bold tracking-widest uppercase text-white">
                                {feedTitle}
                             </span>
                             <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-mono ${displayMessages.length === 0 ? 'text-gray-500' : 'text-cyan-400'}`}>
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

                {isOpen && onRefresh && (
                    <button 
                        onClick={handleRefresh} 
                        className={`p-1 hover:bg-white/10 rounded-full transition-all ${isRefreshing ? 'animate-spin' : ''}`}
                    >
                        <RotateCcw size={12} className="text-gray-400" />
                    </button>
                )}
            </div>
            
            <button 
                onClick={(e) => { e.stopPropagation(); toggleOpen(); }} 
                className="p-2 hover:bg-white/10 rounded-full text-gray-400"
            >
               {isOpen ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
            </button>
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-gradient-to-b from-[#0a0a12] to-[#050508]">
            
            {/* TRENDING TOPICS */}
            {isOpen && !activeTag && trendingTags.length > 0 && (
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

                // BORDER COLOR LOGIC: Strong (Default) -> Weak (Orange) -> Critical (Red)
                // This communicates signal strength visually.
                let borderClass = 'border-white/5 hover:border-cyan-500/30'; // Strong
                let bgClass = 'bg-white/5 hover:bg-white/10';

                if (isCritical) {
                    borderClass = 'border-red-500/50 hover:border-red-500';
                    bgClass = 'bg-red-950/10';
                } else if (isWeak) {
                    borderClass = 'border-orange-500/30 hover:border-orange-500/60';
                    bgClass = 'bg-orange-950/5';
                }

                return (
                <motion.div
                key={msg.id}
                layoutId={msg.id}
                onClick={() => onMessageClick(msg)}
                className={`group border rounded-xl p-4 cursor-pointer transition-all flex gap-4 ${borderClass} ${bgClass}`}
                >
                <div className="flex flex-col items-center justify-start gap-1 min-w-[30px] pt-1">
                    <button 
                        onClick={(e) => handleBoostClick(e, msg.id)}
                        className={`p-2 rounded-full transition-all ${isBoosted ? 'text-cyan-400 bg-cyan-400/10 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                        disabled={isBoosted}
                    >
                        <Zap size={20} className={isBoosted ? "fill-cyan-400" : ""} />
                    </button>
                    <span className={`text-xs font-bold font-mono ${isBoosted ? 'text-cyan-400' : 'text-gray-500'}`}>
                        {msg.score}
                    </span>
                </div>

                <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-mono">
                            <MapPin size={10} className="text-cyan-500" />
                            <span className="font-bold text-gray-300 truncate max-w-[140px] sm:max-w-[200px]">
                            {msg.city || 'UNKNOWN SECTOR'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {renderVisitorBadge(msg)}

                            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-gray-400">
                                <Clock size={10} />
                                {formatRelativeTime(msg.timestamp)}
                                {isCritical && (
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
                                    onClick={(e) => handleReportClick(e, msg.id)}
                                    className="relative z-10 p-1.5 text-gray-600 hover:text-red-400 transition-colors"
                                    title="Report"
                                >
                                    <Flag size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* Render Text */}
                    <p className="text-base text-gray-100 leading-relaxed font-light break-words">
                        {renderMessageText(msg.text)}
                    </p>

                    {/* Render Image Attachment */}
                    {msg.imageUrl && (
                        <ImageAttachment src={msg.imageUrl} />
                    )}
                    
                    <div className="mt-3 flex justify-between items-center border-t border-white/5 pt-2">
                        <span className="text-[10px] text-gray-600 font-mono">ID: {msg.sessionId.slice(0, 8)}</span>
                        
                        <div className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                            <MessageSquare size={14} />
                            <span>{msg.replyCount || 0} {t('feed.replies')}</span>
                        </div>
                    </div>
                </div>
                </motion.div>
            )})
            )}
            <div className="h-20" /> 
        </div>
      </motion.div>
    </>
  );
};

export default FeedPanel;