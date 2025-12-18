import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, X, Zap, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { triggerHaptic } from '../services/hapticService';

interface TerminalScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (query: string) => Promise<void>;
  isScanning: boolean;
}

const TerminalScanner: React.FC<TerminalScannerProps> = ({ isOpen, onClose, onScan, isScanning }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isScanning) return;
    triggerHaptic('light');
    await onScan(query.trim());
    setQuery('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          className="absolute top-5 left-5 z-[500] pointer-events-auto"
        >
          <form 
            onSubmit={handleSubmit}
            className="flex items-center bg-[#0a0a12]/90 backdrop-blur-xl rounded-sm border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)] overflow-hidden h-10 font-mono"
          >
            <div className="pl-3 pr-1 text-cyan-500 flex items-center gap-1.5">
              <Terminal size={14} className={isScanning ? "animate-pulse" : ""} />
              <span className="text-[10px] font-bold opacity-40">#</span>
            </div>
            
            <input 
              ref={inputRef}
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isScanning ? "SCANNING..." : "TARGET SECTOR"}
              className="bg-transparent text-cyan-400 text-xs px-2 w-32 md:w-48 focus:outline-none placeholder-cyan-900 font-bold uppercase tracking-widest"
              disabled={isScanning}
            />

            <div className="flex h-full">
              <button 
                type="submit" 
                disabled={isScanning || !query.trim()} 
                className={`px-3 flex items-center gap-1.5 transition-all active:scale-95 group
                  ${isScanning ? 'bg-cyan-900/20 text-cyan-700' : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-black'}
                `}
              >
                {isScanning ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <>
                    <Zap size={12} className="group-hover:fill-black" />
                    <span className="text-[9px] font-black tracking-tighter">EXE</span>
                  </>
                )}
              </button>
              
              <button 
                type="button" 
                onClick={() => { triggerHaptic('light'); onClose(); }} 
                className="px-2 text-red-500/40 hover:text-red-400 transition-colors border-l border-white/5"
              >
                <X size={14} />
              </button>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TerminalScanner;