import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Loader2, MessageSquare, ChevronUp, ChevronDown, MapPin, AlertCircle, Trash2, Satellite } from 'lucide-react';
import { ChatMessage } from '../types';
import { fetchReplies, getUserVotes, getAnonymousID, getFlagUrl } from '../services/storageService';

interface ThreadViewProps {
  parentMessage: ChatMessage;
  onClose: () => void;
  onReply: (text: string, parentId: string) => Promise<void>;
  onVote: (msgId: string, direction: 'up' | 'down') => void;
  onDelete: (msgId: string, parentId?: string) => void;
}

const ThreadView: React.FC<ThreadViewProps> = ({ parentMessage, onClose, onReply, onVote, onDelete }) => {
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
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
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to send reply. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleVoteClick = (e: React.MouseEvent, msgId: string, direction: 'up' | 'down') => {
    e.stopPropagation();
    onVote(msgId, direction);
    setUserVotes(prev => {
        const next = { ...prev };
        if (next[msgId] === direction) delete next[msgId];
        else next[msgId] = direction;
        return next;
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, msgId: string, isParent: boolean) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this signal?")) {
        if (isParent) {
            onDelete(msgId);
            onClose();
        } else {
            setReplies(prev => prev.filter(r => r.id !== msgId));
            onDelete(msgId, parentMessage.id);
        }
    }
  };

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

  const renderMessageCard = (msg: ChatMessage, isParent: boolean) => (
    <div className={`p-4 ${isParent ? 'bg-white/10 border-b border-white/10' : 'bg-transparent border-l-2 border-white/10 ml-4 pl-4'}`}>
      <div className="flex gap-3">
        {/* Vote Column */}
        <div className="flex flex-col items-center gap-1 min-w-[24px]">
             <button 
                onClick={(e) => handleVoteClick(e, msg.id, 'up')}
                className={`p-0.5 rounded transition-colors ${userVotes[msg.id] === 'up' ? 'text-orange-400' : 'text-gray-500 hover:text-white'}`}
            >
                <ChevronUp size={18} />
            </button>
            <span className={`text-xs font-mono font-bold ${msg.score > 0 ? 'text-white' : 'text-gray-500'}`}>
                {msg.score > 0 ? '+' : ''}{msg.score}
            </span>
            <button 
                onClick={(e) => handleVoteClick(e, msg.id, 'down')}
                className={`p-0.5 rounded transition-colors ${userVotes[msg.id] === 'down' ? 'text-blue-400' : 'text-gray-500 hover:text-white'}`}
            >
                <ChevronDown size={18} />
            </button>
        </div>
        
        {/* Content */}
        <div className="flex-1">
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span className="font-mono text-cyan-400">ID: {msg.sessionId.slice(0, 6)}</span>
                    <span>•</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}</span>
                </div>
                <div className="flex items-center gap-2">
                    
                    {renderVisitorBadge(msg)}

                    {msg.sessionId === currentSessionId && (
                         <button 
                            onClick={(e) => handleDeleteClick(e, msg.id, isParent)}
                            className="text-gray-600 hover:text-red-400 transition-colors p-1"
                            title="Delete your signal"
                        >
                            <Trash2 size={12} />
                        </button>
                    )}
                    {isParent && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
                            <MapPin size={10} /> {msg.city}
                        </div>
                    )}
                </div>
            </div>
            <p className={`text-sm text-gray-200 leading-relaxed whitespace-pre-wrap ${isParent ? 'font-medium text-base' : 'font-light'}`}>
                {msg.text}
            </p>
        </div>
      </div>
    </div>
  );

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
            THREAD
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {renderMessageCard(parentMessage, true)}
          
          <div className="px-4 py-2">
             <div className="h-px bg-white/5 my-2" />
             <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-4">Replies</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-gray-500" />
            </div>
          ) : replies.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
              No replies yet. Be the first to respond.
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
              placeholder="Post a reply..."
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