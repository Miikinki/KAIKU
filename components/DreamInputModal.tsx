import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MapPin, AlertCircle, Loader2, Clock, Moon, MapPinOff } from 'lucide-react';
import { Dream } from '../types';
import { analyzeDream } from '../services/geminiService';
import { applyFuzzyLogic, getRandomLocation, generateUUID } from '../services/storageService';

interface DreamInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dream: Dream) => Promise<void>;
  cooldownUntil: number | null;
}

const DreamInputModal: React.FC<DreamInputModalProps> = ({ isOpen, onClose, onSave, cooldownUntil }) => {
  const [text, setText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  // Countdown timer logic
  useEffect(() => {
    if (!cooldownUntil || !isOpen) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = cooldownUntil - now;

      if (diff <= 0) {
        setTimeLeft('');
        // We could technically trigger a re-check here, but closing/re-opening is safe enough for MVP
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil, isOpen]);

  const handleSubmit = async () => {
    if (!text.trim()) return;

    setIsLocating(true);
    setIsAnalyzing(false);
    setError(null);

    try {
      let lat: number;
      let lng: number;

      // 1. Get Location
      try {
        if (!navigator.geolocation) throw new Error("No Geolocation");

        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
             timeout: 15000, // Increased to 15s for mobile permissions
             enableHighAccuracy: false, // Use wifi/cell towers for speed
             maximumAge: 60000 // Accept cached location up to 1 min old
          });
        });

        lat = position.coords.latitude;
        lng = position.coords.longitude;
      } catch (locError) {
        console.warn("Geolocation failed or timed out, using random location:", locError);
        const randomLoc = getRandomLocation();
        lat = randomLoc.lat;
        lng = randomLoc.lng;
        // Optional: Notify user we fell back to random, or just stay silent as per "Anonymity" theme
      }

      setIsLocating(false);
      setIsAnalyzing(true);

      // 2. Fuzzy Logic & Analysis
      const fuzzyLocation = applyFuzzyLogic(lat, lng);
      const analysis = await analyzeDream(text);

      const newDream: Dream = {
        id: generateUUID(),
        text: text,
        category: analysis.category,
        summary: analysis.summary,
        interpretation: analysis.interpretation,
        timestamp: Date.now(),
        location: fuzzyLocation
      };

      await onSave(newDream);
      setText('');
      onClose();

    } catch (err: any) {
      console.error(err);
      setError("Failed to transmit dream. Please try again.");
    } finally {
      setIsLocating(false);
      setIsAnalyzing(false);
    }
  };

  const isLocked = !!cooldownUntil && timeLeft !== '';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-[#0f0f18]/90 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl p-6 text-white overflow-hidden"
          >
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10 pointer-events-none" />

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-light tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-white">
                  {isLocked ? 'TRANSMISSION LOCKED' : 'LOG TRANSMISSION'}
                </h2>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {isLocked ? (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-2">
                    <Moon size={32} className="text-blue-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white">Rest Required</h3>
                  <p className="text-sm text-gray-400 max-w-xs mx-auto">
                    You've shared 2 dreams today. The collective mind needs you to rest well and return tomorrow!
                  </p>
                  <div className="flex items-center gap-2 text-2xl font-mono text-blue-200 mt-4 bg-black/40 px-6 py-3 rounded-lg border border-white/5">
                    <Clock size={20} className="animate-pulse" />
                    {timeLeft}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-widest">
                      Dream Content
                    </label>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Describe what you saw in the void..."
                      className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-gray-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 resize-none placeholder-gray-600"
                    />
                  </div>

                  <div className="flex items-start gap-2 mb-6 text-xs text-gray-500">
                    <MapPin size={12} className="mt-0.5 shrink-0" />
                    <p>
                      Your precise coordinates will be scrambled by 10-50km for anonymity. 
                      If location is unavailable, a random location will be assigned.
                    </p>
                  </div>

                  {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-200 text-sm">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={isAnalyzing || isLocating || !text.trim()}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium text-white shadow-lg shadow-purple-900/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isLocating ? (
                      <>
                        <MapPin className="animate-pulse" size={18} />
                        ACQUIRING COORDINATES...
                      </>
                    ) : isAnalyzing ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        ANALYZING SIGNAL...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        TRANSMIT TO VOID
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DreamInputModal;
