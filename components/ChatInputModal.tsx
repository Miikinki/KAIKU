import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MapPin, AlertCircle, Loader2, Clock } from 'lucide-react';
import { THEME_COLOR } from '../constants';

interface ChatInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
  cooldownUntil: number | null;
}

const ChatInputModal: React.FC<ChatInputModalProps> = ({ isOpen, onClose, onSave, cooldownUntil }) => {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!cooldownUntil || !isOpen) return;
    const interval = setInterval(() => {
      const diff = cooldownUntil - Date.now();
      if (diff <= 0) setTimeLeft('');
      else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        setTimeLeft(`${h}h ${m}m`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil, isOpen]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setIsSubmitting(true);
    await onSave(text);
    setIsSubmitting(false);
    setText('');
    onClose();
  };

  const isLocked = !!cooldownUntil && timeLeft !== '';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-[#0f0f18] border border-white/10 rounded-2xl shadow-2xl p-6 text-white"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold mb-1 text-white">Broadcast Signal</h2>
            <p className="text-xs text-gray-400 mb-6">Anonymous. Local. Encrypted.</p>

            {isLocked ? (
              <div className="bg-white/5 rounded-xl p-6 text-center border border-white/10">
                <Clock className="mx-auto mb-2 text-yellow-500" size={32} />
                <h3 className="text-white font-medium">Rate Limit Exceeded</h3>
                <p className="text-sm text-gray-400 mt-1">Please wait {timeLeft} before broadcasting again.</p>
              </div>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What's happening nearby?"
                  className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-gray-200 focus:outline-none focus:border-cyan-500/50 resize-none mb-4"
                />
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !text.trim()}
                  className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                  BROADCAST
                </button>
              </>
            )}
            
            <div className="mt-4 flex items-start gap-2 text-[10px] text-gray-500">
               <MapPin size={12} className="mt-0.5" />
               <p>Your location will be fuzzed by 5-50km based on observer zoom level.</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ChatInputModal;
