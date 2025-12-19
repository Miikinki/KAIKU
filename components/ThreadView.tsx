import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Loader2, MessageSquare, MapPin, AlertCircle, Trash2, Satellite, Zap, Flag, Clock, Crown, Eye, EyeOff, Image as ImageIcon, Newspaper, ExternalLink, Sparkles, Languages, Shield, ChevronUp, ChevronDown } from 'lucide-react';
import { ChatMessage } from '../types';
import { fetchReplies, getUserVotes, getAnonymousID, getFlagUrl, getFlagEmoji } from '../services/storageService';
import { translateText } from '../services/translationService';
import { triggerHaptic } from '../services/hapticService';
import { useTranslation } from 'react-i18next';
import ImageAttachment from './ImageAttachment';
import { getHumanizedDistance } from '../services/locationService';
import { AVATAR_ICONS, HIGH_SIGNAL_THRESHOLD, LOW_SIGNAL_THRESHOLD, BADGES } from '../constants';

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
    triggerHaptic('light');
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

  const renderMessageCard = (msg: ChatMessage, isParent: boolean) => {
      const isNews = msg.postType === 'GLOBAL_EVENT' || msg.postType === 'SCAN_RESULT';
      const isMe = msg.sessionId === currentSessionId;
      const isHidden = hiddenIds.has(msg.id);
      const userVote = userVotes[msg.id];
      const isTranslated = !!translatedMessages[msg.id];
      const activeText = translatedMessages[msg.id] || msg.text;
      
      const { isCritical } = getSignalHealth(msg);
      
      const displayName = msg.userDisplayName || (isNews ? 'SYSTEM' : t('dossier.anonymous'));
      const identityColor = isNews ? '#ef4444' : (msg.userColor || (isMe ? '#06b6d4' : '#9ca3af'));

      let distanceLabel = { text: msg.city || 'UNKNOWN', style: 'text-gray-500' };
      if (userLocation) {
          distanceLabel = getHumanizedDistance(
              userLocation.lat, userLocation.lng,
              msg.location.lat, msg.location.lng,
              msg.city,
              t
          );
      }

      // News handling
      const textParts = isNews ? activeText.split('\n\n') : [activeText];
      const headline = isNews ? textParts[0] : null;
      const body = isNews ? textParts.slice(1).join('\n\n') : activeText;
      const sourceName = isNews ? getSourceName(msg.eventMetadata?.source_url) : null;
      const sourceUrl = isNews ? msg.eventMetadata?.source_url : null;
      const needsTranslation = isNews && msg.language && msg.language !== i18n.language;

      return (
        <div 
            key={msg.id} 
            className={`p-4 border-b border-white/5 transition-colors ${
                isParent ? 'bg-white/5' : 'hover:bg-white/5'
            } ${isHidden ? 'opacity-50' : ''}`}
        >
            <div className="flex gap-4">
                {/* VOTE COLUMN */}
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
                        msg.score >= HIGH_SIGNAL_THRESHOLD ? 'text-cyan-200' :
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

                {/* CONTENT COLUMN */}
                <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center flex-wrap gap-2 text-[12px] text-gray-500 font-medium">
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

                            {/* BADGES RENDER */}
                            {!isNews && msg.userBadges && msg.userBadges.length > 0 && (
                                <div className="flex items-center gap-0.5 ml-1">
                                    {msg.userBadges.map(bid => BADGES[bid] ? (
                                        <span key={bid} title={t(BADGES[bid].translationKey)} className="text-xs filter drop-shadow-md cursor-help">
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

                        {/* ACTIONS */}
                        <div className="flex items-center gap-2">
                            {msg.sessionId === currentSessionId ? (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); triggerHaptic('error'); onDelete(msg.id, msg.parentId || undefined); }}
                                    className="p-1.5 bg-red-500/10 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-all"
                                >
                                    <Trash2 size={12} />
                                </button>
                            ) : (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); onToggleHidden(msg.id); }}
                                    className={`p-1.5 transition-colors ${isHidden ? 'text-cyan-400 hover:text-white' : 'text-gray-600 hover:text-white'}`}
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
                        <div className="space-y-2">
                            <h3 className="text-lg font-bold text-white leading-snug flex items-start gap-2">
                                {isTranslated && <Sparkles size={14} className="text-cyan-400 shrink-0 mt-1" />}
                                {headline}
                            </h3>
                            <p className="text-base text-[#D1D5DB] font-normal leading-relaxed break-words whitespace-pre-wrap">
                                {renderMessageText(body)}
                            </p>
                            {sourceUrl && (
                                <div className="pt-2">
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
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className={`text-base leading-relaxed font-normal break-words whitespace-pre-wrap ${isNews ? 'text-[#D1D5DB]' : 'text-gray-100'}`}>
                             {renderMessageText(activeText)}
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
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-[600] flex flex-col bg-[#0a0a12]"
    >
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0a0a12]/95 backdrop-blur shadow-xl z-20">
        <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors">
                <ChevronDown size={24} />
            </button>
            <h2 className="text-lg font-bold tracking-wide text-white">{t('thread.title')}</h2>
        </div>
        <div className="text-xs text-gray-500 font-mono">
            {replies.length} {t('thread.replies_label')}
        </div>
      </div>

      {/* SCROLL AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
        {renderMessageCard(parentMessage, true)}

        <div className="min-h-[200px]">
            {isLoading ? (
                <div className="flex justify-center items-center py-12 text-cyan-500/50">
                    <Loader2 size={32} className="animate-spin" />
                </div>
            ) : replies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                    <MessageSquare size={32} className="mb-2 opacity-20" />
                    <p className="text-sm font-mono">{t('thread.no_replies')}</p>
                </div>
            ) : (
                replies.map((reply) => renderMessageCard(reply, false))
            )}
            <div ref={bottomRef} />
        </div>
      </div>

      {/* REPLY INPUT */}
      <div className="border-t border-white/10 bg-[#0f0f18] p-4 z-20 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
        {error && (
            <div className="mb-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={12} />
                {error}
            </div>
        )}
        <div className="flex gap-2 items-end">
            <div className="relative flex-1">
                <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t('thread.post_reply_placeholder')}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 resize-none min-h-[50px] max-h-[120px]"
                    rows={1}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                />
            </div>
            <button
                onClick={handleSend}
                disabled={isSending || !replyText.trim()}
                className="p-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
            >
                {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
            </button>
        </div>
      </div>
    </motion.div>
  );
};

export default ThreadView;