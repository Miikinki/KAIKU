import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Shield, MapPin, ChevronUp, ChevronDown, RotateCcw, Trash2, Clock, Satellite, Radar, ScanLine, X, Hash } from 'lucide-react';
import { ChatMessage } from '../types';
import { THEME_COLOR } from '../constants';
import { getUserVotes, getAnonymousID, getFlagUrl } from '../services/storageService';

interface FeedPanelProps {
  visibleMessages: ChatMessage[];
  onMessageClick: (msg: ChatMessage) => void;
  isOpen: boolean;
  toggleOpen: () => void;
  onVote: (msgId: string, direction: 'up' | 'down') => void;
  onDelete: (msgId: string, parentId?: string) => void;
  onRefresh?: () => void;
  zoomLevel?: number;
}

const FeedPanel: React.FC<FeedPanelProps> = ({ 
    visibleMessages, onMessageClick, isOpen, toggleOpen, onVote, onDelete, onRefresh, zoomLevel
}) => {
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // -- TAG FILTER STATE --
  const [activeTag, setActiveTag] = useState<string | null>(null);
  
  const currentSessionId = getAnonymousID();

  useEffect(() => {
    setUserVotes(getUserVotes());
  }, [visibleMessages, isOpen]);

  const handleVoteClick = (e: React.MouseEvent, msgId: string, direction: 'up' | 'down') => {
    e.stopPropagation();
    onVote(msgId, direction);
    setUserVotes(prev => {
        const current = prev[msgId];
        const next = { ...prev };
        if (current === direction) delete next[msgId];
        else next[msgId] = direction;
        return next;
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, msgId: string, parentId?: string | null) => {
      e.stopPropagation();
      if (window.confirm("Are you sure you want to delete this signal?")) {
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

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
      e.stopPropagation();
      setActiveTag(tag);
  };

  // --- TEXT PARSER (Soft Tags) ---
  const renderMessageText = (text: string) => {
      // Split by hashtags (capturing the hashtag so it's in the array)
      // Regex detects # followed by letters, numbers, or underscores. Unicode compatible.
      const parts = text.split(/(#[\p{L}\p{N}_]+)/gu);
      
      return parts.map((part, index) => {
          if (part.startsWith('#')) {
              return (
                  <span 
                    key={index}
                    onClick={(e) => handleTagClick(e, part)}
                    className="text-cyan-400 font-bold hover:text-cyan-300 hover:underline cursor-pointer transition-colors"
                  >
                      {part}
                  </span>
              );
          }
          return <span key={index}>{part}</span>;
      });
  };

  // --- FILTER LOGIC ---
  const displayMessages = activeTag 
    ? visibleMessages.filter(msg => msg.tags?.includes(activeTag))
    : visibleMessages;

  // --- VISITOR ICON LOGIC ---
  const renderVisitorBadge = (msg: ChatMessage) => {
    if (!msg.isRemote) return null;

    const isDomestic = msg.country && msg.originCountry === msg.country;
    const flagUrl = getFlagUrl(msg.originCountry);

    if (isDomestic) {
        return (
            <div className="text-amber-400 flex items-center gap-1.5" title={`Remote signal from ${msg.originCountry}`}>
                <Satellite size={12} />
            </div>
        );
    } else {
        return (
            <div className="text-amber-400 flex items-center gap-1.5" title={`Global signal from ${msg.originCountry}`}>
                <Satellite size={12} />
                {flagUrl && (
                    <img src={flagUrl} alt={msg.originCountry} className="w-4 h-3 rounded-[2px] object-cover" />
                )}
            </div>
        );
    }
  };

  const feedTitle = (zoomLevel && zoomLevel < 9) ? "REGIONAL INTERCEPT" : "LOCAL SIGNALS";
  const hasSignals = displayMessages.length > 0;
  
  const variants = {
      open: { y: 0 },
      closed: { y: '100%' },
      peek: { y: 'calc(100% - 60px)' } 
  };

  const currentState = isOpen ? 'open' : (visibleMessages.length > 0 ? 'peek' : 'closed');

  return (
    <>
      {currentState === 'closed' && (
        <button
            onClick={toggleOpen}
            className="fixed bottom-8 left-8 z-[400] bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-full text-white shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:bg-white/10 transition-all animate-pulse"
        >
            <Radar size={24} style={{ color: THEME_COLOR }} />
        </button>
      )}

      <motion.div
        initial="closed"
        animate={currentState}
        variants={variants}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-x-0 bottom-0 top-[15vh] md:top-[10vh] bg-[#0a0a12]/95 backdrop-blur-xl border-t border-white/10 z-[450] shadow-2xl flex flex-col rounded-t-3xl overflow-hidden"
      >
        <div 
            className={`p-4 border-b border-white/5 flex flex-col items-center bg-white/5 cursor-pointer transition-colors hover:bg-white/10 ${!isOpen ? 'h-[60px] justify-center' : ''}`}
            onClick={toggleOpen}
        >
          {isOpen && <div className="w-12 h-1.5 bg-white/20 rounded-full mb-4" />}
          
          <div className="w-full flex justify-between items-center px-2">
            <div className="flex items-center gap-4">
                {!isOpen ? (
                    <div className="flex items-center gap-2 text-cyan-400 animate-pulse">
                         <ScanLine size={20} />
                         <span className="text-sm font-bold tracking-widest uppercase">
                            {displayMessages.length} Signals Detected
                         </span>
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
                    className="bg-cyan-900/30 border-b border-cyan-500/30 overflow-hidden"
                >
                    <div className="flex items-center justify-between px-6 py-2">
                        <div className="flex items-center gap-2 text-cyan-400 text-sm font-mono">
                            <Hash size={14} />
                            <span>Filtering: <span className="font-bold">{activeTag}</span></span>
                        </div>
                        <button 
                            onClick={() => setActiveTag(null)}
                            className="p-1 hover:bg-white/10 rounded-full text-cyan-200 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-gradient-to-b from-[#0a0a12] to-[#050508]">
            {displayMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 text-center pb-20">
                <Shield size={48} className="mb-4 opacity-20" />
                <p>No signals detected.</p>
                {activeTag ? (
                    <p className="text-xs mt-2 opacity-50">Try clearing the tag filter.</p>
                ) : (
                    <p className="text-xs mt-2 opacity-50">Move the radar to a new location.</p>
                )}
            </div>
            ) : (
            displayMessages.map((msg) => (
                <motion.div
                key={msg.id}
                layoutId={msg.id}
                onClick={() => onMessageClick(msg)}
                className="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 rounded-xl p-4 cursor-pointer transition-all flex gap-4"
                >
                <div className="flex flex-col items-center justify-start gap-1 min-w-[30px] pt-1">
                    <button 
                        onClick={(e) => handleVoteClick(e, msg.id, 'up')}
                        className={`p-1 rounded-full transition-colors ${userVotes[msg.id] === 'up' ? 'text-cyan-400 bg-cyan-400/10' : 'text-gray-500 hover:text-white'}`}
                    >
                        <ChevronUp size={24} />
                    </button>
                    <span className={`text-sm font-bold font-mono ${msg.score > 0 ? 'text-white' : msg.score < 0 ? 'text-gray-400' : 'text-gray-500'}`}>
                        {msg.score > 0 ? '+' : ''}{msg.score}
                    </span>
                    <button 
                        onClick={(e) => handleVoteClick(e, msg.id, 'down')}
                        className={`p-1 rounded-full transition-colors ${userVotes[msg.id] === 'down' ? 'text-purple-400 bg-purple-400/10' : 'text-gray-500 hover:text-white'}`}
                    >
                        <ChevronDown size={24} />
                    </button>
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

                            {msg.sessionId === currentSessionId && (
                                <button 
                                    onClick={(e) => handleDeleteClick(e, msg.id, msg.parentId)}
                                    className="relative z-10 p-1.5 bg-red-500/10 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                >
                                    <Trash2 size={12} />
                                </button>
                            )}
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                <Clock size={10} />
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                            </div>
                        </div>
                    </div>
                    
                    {/* Render Text with Clickable Tags */}
                    <p className="text-base text-gray-100 leading-relaxed font-light break-words">
                        {renderMessageText(msg.text)}
                    </p>
                    
                    <div className="mt-3 flex justify-between items-center border-t border-white/5 pt-2">
                        <span className="text-[10px] text-gray-600 font-mono">ID: {msg.sessionId.slice(0, 8)}</span>
                        
                        <div className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
                            <MessageSquare size={14} />
                            <span>{msg.replyCount || 0} Replies</span>
                        </div>
                    </div>
                </div>
                </motion.div>
            ))
            )}
            <div className="h-20" /> 
        </div>
      </motion.div>
    </>
  );
};

export default FeedPanel;