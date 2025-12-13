import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MapPin, AlertCircle, Loader2, Clock } from 'lucide-react';
import { THEME_COLOR } from '../constants';

interface ChatInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
  cooldownUntil: number | null;
  targetLocationName?: string;
}

const ChatInputModal: React.FC<ChatInputModalProps> = ({ isOpen, onClose, onSave, cooldownUntil, targetLocationName }) => {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!cooldownUntil || !isOpen) return;
    const interval = setInterval(() => {
      const diff = cooldownUntil - Date.now();
      if (diff <= 0) setTimeLeft('');
      else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        if (h > 0) {
            setTimeLeft(`${h}h ${m}m`);
        } else {
            setTimeLeft(`${m}m ${s}s`);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil, isOpen]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSave(text);
      setText('');
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Transmission failed.");
    } finally {
      setIsSubmitting(false);
    }
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
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-6">
                 {targetLocationName ? (
                    <>
                        <span>To:</span>
                        <span className="text-cyan-400 font-bold flex items-center gap-1">
                            <MapPin size={10} /> {targetLocationName}
                        </span>
                    </>
                 ) : (
                    <span className="animate-pulse">Locating...</span>
                 )}
            </div>

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

                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-200 text-xs">
                    <AlertCircle size={16} className="shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !text.trim() || !targetLocationName}
                  className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                  BROADCAST
                </button>
              </>
            )}
            
            <div className="mt-4 flex items-start gap-2 text-[10px] text-gray-500">
               <MapPin size={12} className="mt-0.5" />
               <p>Your signal will be aggregated into the regional grid for privacy. No precise location is ever displayed.</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ChatInputModal;