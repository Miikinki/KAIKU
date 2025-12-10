import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Activity, Hash, Globe2 } from 'lucide-react';
import { CountryStats, DreamCategory } from '../types';
import { CATEGORY_COLORS } from '../constants';

interface CountryStatsPopupProps {
  stats: CountryStats | null;
  onClose: () => void;
}

const CountryStatsPopup: React.FC<CountryStatsPopupProps> = ({ stats, onClose }) => {
  if (!stats) return null;

  // Determine mood color
  const getMoodColor = (score: number) => {
    if (score > 50) return '#4ade80'; // Green
    if (score > 20) return '#22d3ee'; // Cyan
    if (score > -20) return '#9ca3af'; // Grey
    if (score > -50) return '#facc15'; // Yellow
    return '#f87171'; // Red
  };

  const moodColor = getMoodColor(stats.moodScore);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/20 pointer-events-auto"
          onClick={onClose}
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-[#0a0a12]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl pointer-events-auto overflow-hidden"
        >
          {/* Decorative Gradient Background */}
          <div className="absolute top-[-50%] right-[-50%] w-[100%] h-[100%] bg-blue-500/10 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute bottom-[-50%] left-[-50%] w-[100%] h-[100%] bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />

          {/* Header */}
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 text-blue-400 mb-1">
                <Globe2 size={16} />
                <span className="text-xs font-mono tracking-widest uppercase">Regional Data</span>
              </div>
              <h2 className="text-3xl font-light text-white tracking-wide">{stats.countryName}</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {stats.totalDreams === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity size={48} className="mx-auto mb-4 opacity-20" />
              <p>No dream signals detected in this region yet.</p>
            </div>
          ) : (
            <div className="space-y-6 relative z-10">
              
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Dominant Theme */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Dominant Theme</span>
                  <div 
                    className="text-xl font-bold mb-1"
                    style={{ color: stats.dominantTheme !== 'N/A' ? CATEGORY_COLORS[stats.dominantTheme as DreamCategory] : '#fff' }}
                  >
                    {stats.dominantTheme}
                  </div>
                  <div className="h-1 w-12 rounded-full opacity-50" 
                     style={{ backgroundColor: stats.dominantTheme !== 'N/A' ? CATEGORY_COLORS[stats.dominantTheme as DreamCategory] : '#fff' }}
                  />
                </div>

                {/* Mood Score */}
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Mood Score</span>
                  <div className="text-3xl font-bold mb-1" style={{ color: moodColor }}>
                    {stats.moodScore > 0 ? '+' : ''}{stats.moodScore}%
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {stats.moodScore > 20 ? 'Positive' : stats.moodScore < -20 ? 'Negative' : 'Neutral'} Resonance
                  </span>
                </div>
              </div>

              {/* Trending Symbols */}
              {stats.trendingSymbols.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-gray-400">
                    <TrendingUp size={14} />
                    <span className="text-xs font-medium uppercase tracking-wider">Trending Symbols</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {stats.trendingSymbols.map((sym, i) => (
                      <span 
                        key={i}
                        className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-200 text-sm font-medium flex items-center gap-1.5"
                      >
                        <Hash size={12} className="opacity-50" />
                        {sym.word.replace('#', '')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="pt-4 border-t border-white/5 text-center">
                 <p className="text-[10px] text-gray-500">
                   Aggregated from <span className="text-white font-mono">{stats.totalDreams}</span> anonymized dream logs in the last 24h.
                 </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CountryStatsPopup;