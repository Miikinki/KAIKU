import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
// Added Shield icon to imports
import { X, Send, Loader2, MessageSquare, MapPin, AlertCircle, Trash2, Satellite, Zap, Flag, Clock, Crown, Eye, EyeOff, Image as ImageIcon, Newspaper, ExternalLink, Sparkles, Languages, Shield } from 'lucide-react';
import { ChatMessage } from '../types';
import { fetchReplies, getUserVotes, getAnonymousID, getFlagUrl, getFlagEmoji } from '../services/storageService';
import { translateText } from '../services/translationService';
import { triggerHaptic } from '../services/hapticService';
import { useTranslation } from 'react-i18next';
import ImageAttachment from './ImageAttachment';

interface ThreadViewProps {
  parentMessage: ChatMessage;
  onClose: () => void;
  onReply: (text: string, parentId: string) => Promise<void>;
  onVote: (msgId: string, direction: 'up' | 'down') => void;
  onDelete: (msgId: string, parentId?: string) => void;
  onTagClick: (tag: string) => void;
  hiddenIds: Set<string>;
  onToggleHidden: (msgId: string) => void;
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

const ThreadView: React.FC<ThreadViewProps> = ({ parentMessage, onClose, onReply, onVote, onDelete, onTagClick, hiddenIds, onToggleHidden }) => {
  const { t, i18n } = useTranslation();
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const [localReactions, setLocalReactions] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('kaiku_reactions');
    return saved ? JSON.parse(saved) : {};
  });
  
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

  const handleBoostClick = (e: React.MouseEvent, msgId: string) => {
    e.stopPropagation();
    if (userVotes[msgId] === 'up') return; 
    triggerHaptic('heavy');
    onVote(msgId, 'up');
    setUserVotes(prev => ({ ...prev, [msgId]: 'up' }));
  };

  const handleReaction = (msgId: string, emoji: string) => {
    triggerHaptic('light');
    setLocalReactions(prev => {
        const updated = { ...prev, [msgId]: emoji === prev[msgId] ? '' : emoji };
        localStorage.setItem('kaiku_reactions', JSON.stringify(updated));
        return updated;
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
    if (!msg.isRemote && msg.postType !== 'GLOBAL_EVENT') return null;

    const isDomestic = msg.country && msg.originCountry === msg.country;
    const title = isDomestic 
        ? t('feed.visitor_remote', { country: msg.originCountry })
        : t('feed.visitor_global', { country: msg.originCountry });

    return (
        <div className="text-amber-400 flex items-center gap-1.5" title={title}>
            <Satellite size={12} />
            {!isDomestic && msg.originCountry && msg.originCountry !== 'SYSTEM' && (
                <span className="text-sm leading-none" role="img" aria-label={msg.originCountry}>
                    {getFlagEmoji(msg.originCountry)}
                </span>
            )}
            {msg.postType === 'GLOBAL_EVENT' && msg.country && msg.originCountry === 'SYSTEM' && (
                 <span className="text-sm leading-none" role="img" aria-label={msg.country}>
                    {getFlagEmoji(msg.country)}
                </span>
            )}
        </div>
    );
  };

  const renderMessageCard = (msg: ChatMessage, isParent: boolean) => {
      const isBoosted = userVotes[msg.id] === 'up';
      const { isCritical, isWeak } = getSignalHealth(msg);
      const isHidden = hiddenIds.has(msg.id);
      const isNews = msg.postType === 'GLOBAL_EVENT' || msg.postType === 'SCAN_RESULT';
      const isOp = !isParent && msg.sessionId === parentMessage.sessionId;

      const isTranslated = !!translatedMessages[msg.id];
      const activeText = translatedMessages[msg.id] || msg.text;

      const textParts = isNews ? activeText.split('\n\n') : [activeText];
      const headline = isNews ? textParts[0] : null;
      const body = isNews ? textParts.slice(1).join('\n\n') : activeText;
      const sourceName = isNews ? getSourceName(msg.eventMetadata?.source_url) : null;
      const sourceUrl = isNews ? msg.eventMetadata?.source_url : null;

      const needsTranslation = isNews && msg.language && msg.language !== i18n.language;

      let borderClass = isParent ? 'border-b border-white/10' : 'border-l-2 border-white/10 ml-4 pl-4';
      
      if (isOp) {
          borderClass = 'border-l-2 border-cyan-500/40 ml-4 pl-4 bg-cyan-500/5';
      }

      if (isParent) {
         if (isCritical) borderClass += ' border-red-500/50';
         else if (isWeak) borderClass += ' border-orange-500/30';
      }

      return (
        <div className={`p-4 ${isParent ? 'bg-white/10' : 'bg-transparent'} ${borderClass} ${isHidden ? 'opacity-70' : ''}`}>
        <div className="flex gap-3">
            {/* Boost Column */}
            <div className="flex flex-col items-center gap-1 min-w-[24px]">
                <button 
                    onClick={(e) => handleBoostClick(e, msg.id)}
                    className={`p-1.5 rounded-full transition-all ${isBoosted ? 'text-cyan-400 bg-cyan-400/10 shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                    disabled={isBoosted || isHidden}
                >
                    <Zap size={18} className={isBoosted ? "fill-cyan-400" : ""} />
                </button>
                {!isHidden && (
                    isNews ? (
                        <Newspaper size={12} className="text-gray-600" />
                    ) : (
                        <span className={`text-xs font-mono font-bold ${isBoosted ? 'text-cyan-400' : 'text-gray-500'}`}>
                            {msg.score}
                        </span>
                    )
                )}
            </div>
            
            {/* Content */}
            <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center flex-wrap gap-2 text-[12px] text-gray-500">
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
                           <span className="font-mono text-cyan-400 font-bold">ID: {msg.sessionId.slice(0, 6)}</span>
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
                                <MapPin size={10} className="text-cyan-500" /> 
                                <span>{msg.city}</span>
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

                        {isParent && (
                            <div className="flex items-center gap-3 pt-2">
                                {['🔥', '😢', '🌍', '⚡'].map((emoji) => (
                                    <motion.button
                                        key={emoji}
                                        whileTap={{ scale: 0.9 }}
                                        whileHover={{ scale: 1.1 }}
                                        onClick={() => handleReaction(msg.id, emoji)}
                                        className={`w-10 h-10 flex items-center justify-center rounded-full border transition-all duration-300 ${
                                            localReactions[msg.id] === emoji
                                            ? 'bg-cyan-500 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.5)]'
                                            : 'bg-transparent border-white/10 text-white/60 hover:border-white/20'
                                        }`}
                                    >
                                        <span className="text-lg">{emoji}</span>
                                    </motion.button>
                                ))}
                            </div>
                        )}
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