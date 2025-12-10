import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Languages, Loader2, Sparkles } from 'lucide-react';
import { Dream } from '../types';
import { CATEGORY_COLORS } from '../constants';
import { translateDream } from '../services/geminiService';

interface DreamDetailPopupProps {
  dream: Dream | null;
  onClose: () => void;
}

const DreamDetailPopup: React.FC<DreamDetailPopupProps> = ({ dream, onClose }) => {
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);
  const [translatedData, setTranslatedData] = useState<{ text: string; interpretation: string } | null>(null);

  // Reset state when dream changes
  useEffect(() => {
    setIsTranslating(false);
    setShowTranslated(false);
    setTranslatedData(null);
  }, [dream]);

  if (!dream) return null;

  const handleTranslate = async () => {
    // If we already toggled to translation, just toggle back to original
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }

    // If we have cached translation, show it
    if (translatedData) {
      setShowTranslated(true);
      return;
    }

    // Fetch translation
    setIsTranslating(true);
    const userLang = navigator.language || 'en';
    const result = await translateDream(dream.text, dream.interpretation, userLang);
    
    setIsTranslating(false);
    
    if (result) {
      setTranslatedData({
        text: result.translatedText,
        interpretation: result.translatedInterpretation
      });
      setShowTranslated(true);
    }
  };

  const displayText = showTranslated && translatedData ? translatedData.text : dream.text;
  const displayInterpretation = showTranslated && translatedData ? translatedData.interpretation : dream.interpretation;

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[450] w-full max-w-sm px-4 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        className="pointer-events-auto bg-[#0a0a12]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5"
      >
        {/* Color Strip */}
        <div 
          className="h-1.5 w-full shadow-[0_0_15px_currentColor]"
          style={{ backgroundColor: CATEGORY_COLORS[dream.category], color: CATEGORY_COLORS[dream.category] }}
        />
        
        <div className="p-6 relative">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {/* Translate Button */}
            <button
              onClick={handleTranslate}
              disabled={isTranslating}
              className="p-1.5 text-gray-500 hover:text-white transition-colors hover:bg-white/10 rounded-full"
              title="Translate"
            >
               {isTranslating ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-white transition-colors hover:bg-white/10 rounded-full"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span 
              className="text-xs font-bold px-2 py-0.5 rounded border border-white/10 uppercase tracking-wide"
              style={{ color: CATEGORY_COLORS[dream.category] }}
            >
              {dream.category}
            </span>
            <span className="text-xs text-gray-500 font-mono">
              {new Date(dream.timestamp).toLocaleDateString()}
            </span>
            {showTranslated && (
               <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded border border-green-400/20">
                 <Sparkles size={8} /> AI Translated
               </span>
            )}
          </div>

          <AnimatePresence mode="wait">
             <motion.div
               key={showTranslated ? 'trans' : 'orig'}
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 0.2 }}
             >
                <p className="text-lg font-light leading-snug mb-4 text-gray-100 italic">
                  "{displayText}"
                </p>

                <div className="space-y-3 bg-white/5 rounded-lg p-3">
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Interpretation</h4>
                    <p className="text-xs text-blue-200/80 leading-relaxed">
                      {displayInterpretation}
                    </p>
                  </div>
                </div>
             </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default DreamDetailPopup;