import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
  type?: 'success' | 'info';
}

export const Toast: React.FC<ToastProps> = ({ message, onClose, type = 'success' }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div 
          initial={{ opacity: 0, y: -20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          className="fixed top-28 left-1/2 z-[10000] flex items-center gap-3 px-5 py-3 bg-[#0a0a12]/95 border border-cyan-500/50 rounded-full shadow-[0_0_25px_rgba(6,182,212,0.3)] backdrop-blur-xl pointer-events-none"
        >
          <div className="bg-cyan-500/20 p-1 rounded-full">
             <ShieldCheck size={16} className="text-cyan-400" />
          </div>
          <span className="text-xs font-bold text-white font-mono tracking-widest uppercase">
            {message}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};