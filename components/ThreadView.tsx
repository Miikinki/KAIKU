import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
// Added Shield icon to imports
import { X, Send, Loader2, MessageSquare, MapPin, AlertCircle, Trash2, Satellite, Zap, Flag, Clock, Crown, Eye, EyeOff, Image as ImageIcon, Newspaper, ExternalLink, Sparkles, Languages, Shield, ChevronUp, ChevronDown } from 'lucide-react';
import { ChatMessage } from '../types';
import { fetchReplies, getUserVotes, getAnonymousID, getFlagUrl, getFlagEmoji } from '../services/storageService';
import { translateText } from '../services/translationService';
import { triggerHaptic } from '../services/hapticService';
import { useTranslation } from 'react-i18next';
import ImageAttachment from './ImageAttachment';
import { getHumanizedDistance } from '../services/locationService';
import { AVATAR_ICONS, HIGH_SIGNAL_THRESHOLD, LOW_SIGNAL_THRESHOLD } from '../constants';

interface ThreadViewProps {
  parentMessage: ChatMessage;
  onClose: () => void;
  onReply: (text: string, parentId: string) => Promise<void>;
  onVote: (msgId: string, direction: 'up' | 'down') => void;
  onDelete: (msgId: string, parentId?: string) => void;
  onTagClick: (tag: string) => void;
  hiddenIds: Set<string>;
  onToggleHidden: (msgId: string) => void;
  currentUserCountry?: string | null;
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

const getSignalHealth = (msg: ChatMessage) => {
    const expiry = msg.expiresAt || (msg.timestamp + 24 * 60 * 60 * 1000);
    const diff = expiry - Date.now();
    const hoursLeft = diff / (1000 * 60 * 60);
    
    return {
        isCritical: hoursLeft < 1, 
        isWeak: hoursLeft < 4
    };
};

const ThreadView: React.FC<ThreadViewProps> = ({ parentMessage, onClose, onReply, onVote, onDelete, onTagClick, hiddenIds, onToggleHidden, currentUserCountry, userLocation }) => {
  const { t, i18n } = useTranslation();
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  
  // Translation state
  const [translatedMessages, setTranslatedMessages] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState<Record<string, boolean>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const currentSessionId = getAnonymousID();

  useEffect(() => {
    const loadReplies = async () => {
      setIsLoading(true);
      const data = await fetchReplies(parentMessage.id);
      setReplies(data);
      setIsLoading(false);
    };
    loadReplies();
    setUserVotes(getUserVotes());
  }, [parentMessage.id]);

  useEffect(() => {
      if (replies.length > 0 && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [replies]);

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      await onReply(replyText, parentMessage.id);
      setReplyText('');
      const data = await fetchReplies(parentMessage.id);
      setReplies(data);
      triggerHaptic('success');
    } catch (e: any) {
      console.error(e);
      setError(e.message || t('thread.error_send_reply'));
      triggerHaptic('error');
    } finally {
      setIsSending(false);
    }
  };

  const handleVoteClick = (e: React.MouseEvent, msgId: string, direction: 'up' | 'down') => {
    e.stopPropagation();
    triggerHaptic('heavy');
    onVote(msgId, direction);

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
    onToggleHidden(msgId);
  };

  const handleDeleteClick = (e: React.MouseEvent, msgId: string, isParent: boolean) => {
    e.stopPropagation();
    triggerHaptic('error');
    if (window.confirm(t('feed.delete_confirm'))) {
        if (isParent) {
            onDelete(msgId);
            onClose();
        } else {
            setReplies(prev => prev.filter(r => r.id !== msgId));
            onDelete(msgId, parentMessage.id);
        }
    }
  };

  const handleTranslate = async (e: React.MouseEvent, msg: ChatMessage) => {
    e.stopPropagation();
    if (translatedMessages[msg.id]) {
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

  const renderMessageText = (text: string) => {
      const parts = text.split(/(#[\p{L}\p{N}_]+)/gu);
      
      return parts.map((part, index) => {
          if (part.startsWith('#')) {
              return (
                  <span 
                    key={index}
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        onTagClick(part); 
                    }}
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
    // 1. GLOBAL EVENTS ALWAYS SHOW BADGE
    if (msg.postType === 'GLOBAL_EVENT') {
        return (
            <div className="text-amber-400 flex items-center gap-1.5" title={`Global Event: ${msg.country}`}>
                <Satellite size={12} />
                {msg.country && (
                    <span className="text-sm leading-none" role="img" aria-label={msg.country}>
                        {getFlagEmoji(msg.country)}
                    </span>
                )}
            </div>
        );
    }
    
    const threadCountry = parentMessage.country || parentMessage.originCountry;
    
    if (msg.originCountry && threadCountry) {
        if (msg.originCountry.toUpperCase() !== threadCountry.toUpperCase()) {
             return (
                <div className="text-amber-400 flex items-center gap-1.5" title={`Signal from ${msg.originCountry}`}>
                    <Satellite size={12} />
                    <span className="text-sm leading-none" role="img" aria-label={msg.originCountry}>
                        {getFlagEmoji(msg.originCountry)}
                    </span>
                </div>
            );
        }
    }

    if (currentUserCountry && msg.originCountry) {
        if (currentUserCountry.toUpperCase() !== msg.originCountry.toUpperCase()) {
            return (
                <div className="text-amber-400 flex items-center gap-1.5" title={`Signal from ${msg.originCountry}`}>
                    <Satellite size={12} />
                    <span className="text-sm leading-none" role="img" aria-label={msg.originCountry}>
                        {getFlagEmoji(msg.originCountry)}
                    </span>
                </div>
            );
        }
    }

    return null;
  };

  const renderMessageCard = (msg: ChatMessage, isParent: boolean) => {
      const userVote = userVotes[msg.id];
      const { isCritical, isWeak } = getSignalHealth(msg);
      const isHidden = hiddenIds.has(msg.id);
      const isNews = msg.postType === 'GLOBAL_EVENT' || msg.postType === 'SCAN_RESULT';
      const isOp = !isParent && msg.sessionId === parentMessage.sessionId;

      const isTranslated = !!translatedMessages[msg.id];
      const activeText = translatedMessages[msg.id] || msg.text;

      // Signal Strength Logic (Using new constants)
      const isHighSignal = msg.score >= HIGH_SIGNAL_THRESHOLD;
      const isLowSignal = msg.score <= LOW_SIGNAL_THRESHOLD;
      const isBlurred = isLowSignal;

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

      let borderClass = isParent ? 'border-b border-white/10' : 'border-l-2 border-white/10 ml-4 pl-4';
      
      if (isOp) {
          borderClass = 'border-l-2 border-cyan-500/40 ml-4 pl-4 bg-cyan-500/5';
      }

      if (isParent) {
         if (isCritical && !isNews) borderClass += ' border-red-500/50';
         else if (isWeak && !isNews) borderClass += ' border-orange-500/30';
      }
      
      const displayName = msg.userDisplayName || (isNews ? 'SYSTEM' : t('dossier.anonymous'));
      const identityColor = isNews ? '#ef4444' : (msg.userColor || '#9ca3af');

      return (
        <div className={`p-4 ${isParent ? 'bg-white/10' : 'bg-transparent'} ${borderClass} ${isHidden ? 'opacity-70' : ''}`}>
        <div className="flex gap-3">
             {/* VOTING COLUMN (Left) */}
             <div className="flex flex-col items-center justify-start gap-1 min-w-[24px]">
                <button 
                    onClick={(e) => handleVoteClick(e, msg.id, 'up')}
                    className={`p-1 rounded transition-colors ${userVote === 'up' ? 'text-cyan-400' : 'text-gray-600 hover:text-cyan-400'}`}
                >
                    <ChevronUp size={20} strokeWidth={3} />
                </button>
                
                <span className={`text-xs font-mono font-bold ${
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
                    <ChevronDown size={20} strokeWidth={3} />
                </button>
            </div>
            
            {/* Content */}
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

                        {isNews ? (
                           <>
                             {sourceName && (
                                <div className="bg-white/5 text-gray-300 px-2 py-0.5 rounded-full border border-white/10 text-[9px] font-bold tracking-widest flex items-center gap-1 uppercase">
                                    <span className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse"></span>
                                    {sourceName}
                                </div>
                             )}
                           </>
                        ) : (
                            <span className="font-mono font-bold tracking-wide uppercase text-[10px]" style={{ color: identityColor }}>
                                {displayName}
                            </span>
                        )}
                        
                        {/* LEVEL BADGE */}
                        {!isNews && msg.userLevel && !msg.hideLevel && (
                            <div className="px-1.5 py-0.5 rounded border border-white/10 bg-cyan-900/30 text-cyan-400 text-[9px] font-mono font-black">
                                LVL {msg.userLevel}
                            </div>
                        )}
                        
                        {isOp && (
                            <span className="flex items-center gap-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1 py-px rounded-[3px] font-bold tracking-wider text-[9px]" title="Original Poster">
                                <Crown size={10} strokeWidth={2.5} />
                                <span>OP</span>
                            </span>
                        )}

                        <span>•</span>
                        <div className="flex items-center gap-1 font-mono font-bold">
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

                        {msg.sessionId === currentSessionId ? (
                            <button 
                                onClick={(e) => handleDeleteClick(e, msg.id, isParent)}
                                className="text-gray-600 hover:text-red-400 transition-colors p-1"
                                title={t('thread.delete_signal_tooltip')}
                            >
                                <Trash2 size={12} />
                            </button>
                        ) : (
                             <button 
                                onClick={(e) => handleToggleHiddenClick(e, msg.id)}
                                className={`p-1 transition-colors ${isHidden ? 'text-cyan-400 hover:text-white' : 'text-gray-600 hover:text-white'}`}
                                title={isHidden ? "Unhide Signal" : "Hide Signal"}
                            >
                                {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                        )}
                        {isParent && (
                            <div className="flex items-center gap-1 text-[12px] text-gray-400 font-medium">
                                <MapPin size={10} className={userLocation ? 'text-cyan-500' : 'text-gray-600'} /> 
                                <span className={distanceLabel.style}>
                                    {distanceLabel.text}
                                    {isNews && msg.country && (
                                        <span className="text-sm leading-none ml-1 grayscale-0" role="img" aria-label={msg.country}>
                                            {getFlagEmoji(msg.country)}
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {isHidden ? (
                    <p className="text-sm text-gray-500 italic leading-relaxed font-light break-words">
                        ** CONTENT HIDDEN **
                    </p>
                ) : isNews && headline ? (
                    <div className="space-y-3 mt-1">
                        <h3 className={`font-bold text-white leading-snug flex items-start gap-2 ${isParent ? 'text-xl' : 'text-base'}`}>
                            {isTranslated && <Sparkles size={isParent ? 18 : 14} className="text-cyan-400 shrink-0 mt-1" />}
                            {headline}
                        </h3>
                        <p className={`text-[#D1D5DB] font-normal leading-relaxed break-words ${isParent ? 'text-base' : 'text-sm'}`}>
                            {renderMessageText(body)}
                        </p>
                        
                        <div className="flex items-center justify-between">
                            {isParent && sourceUrl && (
                                <a 
                                    href={sourceUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                                >
                                    {t('news.read_original', { source: sourceName })}
                                    <ExternalLink size={10} />
                                </a>
                            )}

                            {isTranslated && (
                                <span className="text-[9px] font-mono text-cyan-500/50 flex items-center gap-1 uppercase tracking-tighter">
                                    <Shield size={10} />
                                    {t('feed.translated_by_ai')}
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className={`leading-relaxed break-words ${isHidden ? 'text-gray-500 italic' : 'text-gray-200'} ${isParent && !isHidden ? 'font-medium text-base' : 'font-normal text-sm'} ${isNews ? 'text-[#D1D5DB]' : ''}`}>
                         {renderMessageText(body)}
                    </p>
                )}

                {!isHidden && msg.imageUrl && (
                    <ImageAttachment src={msg.imageUrl} />
                )}
            </div>
        </div>
        </div>
      );
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg h-[80vh] flex flex-col bg-[#0f0f18] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-[#0f0f18]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare size={16} className="text-cyan-400" />
            {t('thread.title')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {renderMessageCard(parentMessage, true)}
          
          <div className="px-4 py-2">
             <div className="h-px bg-white/5 my-2" />
             <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-4">{t('thread.replies_label')}</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-gray-500" />
            </div>
          ) : replies.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
              {t('thread.no_replies')}
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {replies.map(reply => (
                  <div key={reply.id}>
                    {renderMessageCard(reply, false)}
                  </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 bg-[#0a0a12] border-t border-white/10">
          
          {error && (
             <div className="mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-2 text-red-200 text-xs">
                 <AlertCircle size={12} />
                 {error}
             </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t('thread.post_reply_placeholder')}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50"
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={isSending || !replyText.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg px-4 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ThreadView;