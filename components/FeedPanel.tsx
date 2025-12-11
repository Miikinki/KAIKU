
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Shield, MapPin, ChevronUp, ChevronDown, RotateCcw, Trash2, Clock, XCircle, Satellite } from 'lucide-react';
import { ChatMessage } from '../types';
import { THEME_COLOR } from '../constants';
import { getUserVotes, getAnonymousID, getFlagEmoji } from '../services/storageService';

interface FeedPanelProps {
  visibleMessages: ChatMessage[];
  onMessageClick: (msg: ChatMessage) => void;
  isOpen: boolean;
  toggleOpen: () => void;
  onVote: (msgId: string, direction: 'up' | 'down') => void;
  onDelete: (msgId: string, parentId?: string) => void;
  onRefresh?: () => void;
  
  // New props for cluster filtering
  isFilteredByCluster?: boolean;
  onClearFilter?: () => void;
}

const FeedPanel: React.FC<FeedPanelProps> = ({ 
    visibleMessages, onMessageClick, isOpen, toggleOpen, onVote, onDelete, onRefresh,
    isFilteredByCluster, onClearFilter 
}) => {
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  return (
    <>
      <button
        onClick={toggleOpen}
        className="fixed top-24 right-4 z-[400] bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-full text-white shadow-lg hover:bg-white/10 transition-all"
      >
        <MessageSquare size={20} style={{ color: THEME_COLOR }} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full sm:w-96 bg-[#0a0a12]/90 backdrop-blur-xl border-l border-white/10 z-[450] shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: THEME_COLOR }} />
                  {isFilteredByCluster ? 'CITY HUB' : 'LOCAL FEED'}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-400 uppercase tracking-widest">
                    {visibleMessages.length} Signals
                    </p>
                    {onRefresh && !isFilteredByCluster && (
                        <button 
                            onClick={handleRefresh} 
                            className={`p-1 hover:bg-white/10 rounded-full transition-all ${isRefreshing ? 'animate-spin' : ''}`}
                            title="Refresh Signals"
                        >
                            <RotateCcw size={12} className="text-gray-400" />
                        </button>
                    )}
                </div>
              </div>
              <button onClick={toggleOpen} className="p-2 hover:bg-white/10 rounded-full">
                <span className="sr-only">Close</span>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Cluster Filter Indicator */}
            {isFilteredByCluster && onClearFilter && (
                <div className="bg-cyan-500/10 border-b border-cyan-500/20 px-4 py-2 flex justify-between items-center">
                    <span className="text-xs text-cyan-200 font-mono flex items-center gap-2">
                        <MapPin size={12} /> Viewing specific cluster
                    </span>
                    <button 
                        onClick={onClearFilter} 
                        className="text-xs flex items-center gap-1 text-cyan-300 hover:text-white transition-colors"
                    >
                        <XCircle size={12} /> View All
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {visibleMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-center">
                  <Shield size={48} className="mb-4 opacity-20" />
                  <p>No signals detected in this sector.</p>
                  <p className="text-xs mt-2">Pan the map or add a new signal.</p>
                </div>
              ) : (
                visibleMessages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    layoutId={msg.id}
                    onClick={() => onMessageClick(msg)}
                    className="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-xl p-4 cursor-pointer transition-all flex gap-3"
                  >
                    <div className="flex flex-col items-center justify-center gap-1 min-w-[30px]">
                        <button 
                            onClick={(e) => handleVoteClick(e, msg.id, 'up')}
                            className={`p-1 rounded-full transition-colors ${userVotes[msg.id] === 'up' ? 'text-orange-400 bg-orange-400/10' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                        >
                            <ChevronUp size={20} />
                        </button>
                        <span className={`text-sm font-bold font-mono ${msg.score > 0 ? 'text-white' : msg.score < 0 ? 'text-gray-400' : 'text-gray-500'}`}>
                            {msg.score > 0 ? '+' : ''}{msg.score}
                        </span>
                        <button 
                            onClick={(e) => handleVoteClick(e, msg.id, 'down')}
                            className={`p-1 rounded-full transition-colors ${userVotes[msg.id] === 'down' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white hover:bg-white/10'}`}
                        >
                            <ChevronDown size={20} />
                        </button>
                    </div>

                    <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-mono">
                                <MapPin size={10} style={{ color: THEME_COLOR }} />
                                <span className="font-bold text-gray-300 truncate max-w-[140px]">
                                {msg.city || 'UNKNOWN LOCATION'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {msg.isRemote && (
                                    <div className="text-amber-400 flex items-center gap-1" title="Posted remotely">
                                        <Satellite size={12} />
                                        {msg.originCountry && <span className="text-[10px] grayscale-0">{getFlagEmoji(msg.originCountry)}</span>}
                                    </div>
                                )}
                                {msg.sessionId === currentSessionId && (
                                    <button 
                                        onClick={(e) => handleDeleteClick(e, msg.id, msg.parentId)}
                                        className="relative z-10 p-1.5 bg-red-500/10 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                        title="Delete your signal"
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
                        
                        <p className="text-sm text-gray-200 leading-relaxed font-light break-words">
                        {msg.text}
                        </p>
                        
                        <div className="mt-3 flex justify-between items-center">
                            <span className="text-[10px] text-gray-600 font-mono">ID: {msg.sessionId.slice(0, 8)}...</span>
                            
                            <div className="flex items-center gap-1 text-xs text-gray-400 bg-black/20 px-2 py-1 rounded-full">
                                <MessageSquare size={12} />
                                <span>{msg.replyCount || 0} Replies</span>
                            </div>
                        </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
            
            <div className="p-4 border-t border-white/5 text-[10px] text-center text-gray-500">
              Filtered by visible map area • Posts score &lt; -5 removed
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FeedPanel;
