import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Loader2, MessageSquare, ChevronUp, ChevronDown, MapPin, Clock } from 'lucide-react';
import { ChatMessage } from '../types';
import { THEME_COLOR } from '../constants';
import { fetchReplies, getUserVotes } from '../services/storageService';

interface ThreadViewProps {
  parentMessage: ChatMessage;
  onClose: () => void;
  onReply: (text: string, parentId: string) => Promise<void>;
  onVote: (msgId: string, direction: 'up' | 'down') => void;
}

const ThreadView: React.FC<ThreadViewProps> = ({ parentMessage, onClose, onReply, onVote }) => {
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down'>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

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
      // Scroll to bottom when replies load or new reply added
      if (replies.length > 0 && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [replies]);

  const handleSend = async () => {
    if (!replyText.trim()) return;
    setIsSending(true);
    await onReply(replyText, parentMessage.id);
    setReplyText('');
    setIsSending(false);
    // Refresh replies
    const data = await fetchReplies(parentMessage.id);
    setReplies(data);
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
                {isParent && (
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 uppercase">
                        <MapPin size={10} /> {msg.city}
                    </div>
                )}
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
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-[#0f0f18]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare size={16} className="text-cyan-400" />
            THREAD
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
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

        {/* Input Area */}
        <div className="p-4 bg-[#0a0a12] border-t border-white/10">
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