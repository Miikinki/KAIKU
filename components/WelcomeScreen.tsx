import React, { useState, useEffect } from 'react';
import { Radio, Shield, Loader2, ChevronRight, Globe, Lock, EyeOff, AlertTriangle, Key, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getIpLocation } from '../services/moderationService';
import { getPreciseLocation } from '../services/locationService';
import { useTranslation } from 'react-i18next';
import { restoreIdentity } from '../services/identityService';
import { triggerHaptic } from '../services/hapticService';

interface WelcomeScreenProps {
  onStart: (location: { lat: number; lng: number }, isFallback: boolean) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Restore Flow
  const [view, setView] = useState<'intro' | 'restore'>('intro');
  const [restoreCode, setRestoreCode] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  // Intro animation sequence
  const [showContent, setShowContent] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    triggerHaptic('light');
    
    try {
        // Attempt high precision first
        const result = await getPreciseLocation();
        
        // Brief pause for "establishing connection" feeling
        await new Promise(r => setTimeout(r, 1200));

        onStart({ lat: result.lat, lng: result.lng }, result.isFallback);
        return;
    } catch (err: any) {
        console.warn("Location Service Failed:", err.message);
        
        if (err.message.includes("permission denied")) {
             setIsLoading(false);
             setError(t('welcome.error_permission'));
             return;
        }
        // Show actual error for debugging
        if (err.message && err.message.length < 50) {
             setError(err.message.toUpperCase());
        }
    }

    // --- STRATEGY 2: LOCAL STORAGE (LAST KNOWN) ---
    const savedLoc = localStorage.getItem('kaiku_last_loc');
    if (savedLoc) {
        try {
            const parsed = JSON.parse(savedLoc);
            if (parsed.lat && parsed.lng) {
                setTimeout(() => {
                    onStart(parsed, true);
                }, 1000);
                return;
            }
        } catch (e) {}
    }

    // --- STRATEGY 3: IP GEOLOCATION (LAST RESORT) ---
    try {
        const ipLoc = await getIpLocation();
        if (ipLoc) {
            setTimeout(() => onStart(ipLoc, true), 1000);
            return;
        }
    } catch (e) {
        console.warn("IP Fallback failed", e);
    }

    setIsLoading(false);
    // Generic error fallback
    if (!error) setError(t('welcome.error_signal_lost'));
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!restoreCode.trim()) return;
      
      setIsRestoring(true);
      setError(null);
      triggerHaptic('light');

      try {
          await restoreIdentity(restoreCode);
          // Success handled inside restoreIdentity via page reload, but just in case:
          triggerHaptic('success');
      } catch (err: any) {
          setError(err.message || "Failed to restore identity");
          triggerHaptic('error');
          setIsRestoring(false);
      }
  };

  return (
    <div className="fixed inset-0 bg-[#020203] flex items-center justify-center overflow-hidden font-sans text-white z-[9999]">
      
      {/* --- CINEMATIC BACKGROUND --- */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150vmax] h-[150vmax] bg-gradient-to-r from-cyan-900/10 via-transparent to-transparent opacity-50 rounded-full blur-3xl" />
          <div 
            className="absolute inset-0 opacity-[0.15]"
            style={{
                backgroundImage: `
                    linear-gradient(to right, rgba(6,182,212,0.1) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(6,182,212,0.1) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
                maskImage: 'radial-gradient(circle at center, black 40%, transparent 100%)'
            }}
          />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-cyan-500/10 rounded-full animate-[spin_60s_linear_infinite]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-dashed border-cyan-500/10 rounded-full animate-[spin_40s_linear_infinite_reverse]" />
      </div>

      {/* --- CONTENT CARD --- */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-lg mx-4"
      >
        <div className="bg-[#0a0a12]/60 backdrop-blur-xl border border-white/10 p-8 md:p-12 rounded-3xl shadow-2xl relative overflow-hidden group">
            
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50" />
            
            <div className="flex flex-col items-center text-center">
                
                <div className="mb-8 relative">
                    <div className="relative z-10 w-20 h-20 flex items-center justify-center bg-cyan-950/30 rounded-2xl border border-cyan-500/30 shadow-[0_0_40px_rgba(6,182,212,0.15)]">
                        <Radio size={40} className="text-cyan-400" />
                    </div>
                    <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl animate-ping" style={{ animationDuration: '3s' }} />
                </div>

                <h1 className="text-5xl font-black tracking-tighter text-white mb-2" style={{ textShadow: '0 0 20px rgba(255,255,255,0.1)' }}>
                    KAIKU
                </h1>
                <p className="text-cyan-500 font-mono text-xs tracking-[0.4em] uppercase mb-10">
                    {t('welcome.subtitle')}
                </p>

                <AnimatePresence mode="wait">
                    {view === 'intro' ? (
                        <motion.div 
                            key="intro"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="w-full space-y-6"
                        >
                            <div className="w-full space-y-6 mb-12">
                                <FeatureRow 
                                    icon={<Globe size={18} />} 
                                    title={t('welcome.feature_scan_title')}
                                    desc={t('welcome.feature_scan_desc')} 
                                    delay={0.1}
                                />
                                <FeatureRow 
                                    icon={<EyeOff size={18} />} 
                                    title={t('welcome.feature_ghost_title')}
                                    desc={t('welcome.feature_ghost_desc')} 
                                    delay={0.2}
                                />
                                <FeatureRow 
                                    icon={<Lock size={18} />} 
                                    title={t('welcome.feature_decay_title')}
                                    desc={t('welcome.feature_decay_desc')}
                                    delay={0.3}
                                />
                            </div>

                            <button
                                onClick={handleConnect}
                                disabled={isLoading}
                                className="relative w-full h-16 bg-white hover:bg-gray-100 text-black rounded-xl overflow-hidden transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                            >
                                <div className="absolute inset-0 flex items-center justify-center gap-3 z-10">
                                    {isLoading ? (
                                        <div className="flex items-center gap-3 font-mono text-xs font-bold tracking-widest uppercase">
                                            <Loader2 size={20} className="animate-spin text-cyan-500" />
                                            <span>INITIALIZING UPLINK...</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3 font-mono text-xs font-bold tracking-widest uppercase">
                                            <span>{t('welcome.btn_initialize')}</span>
                                            <ChevronRight size={20} className="group-hover/btn:translate-x-1 transition-transform" />
                                        </div>
                                    )}
                                </div>
                                {isLoading && (
                                    <motion.div 
                                        className="absolute inset-0 bg-cyan-300/10 origin-left"
                                        initial={{ scaleX: 0 }}
                                        animate={{ scaleX: 1 }}
                                        transition={{ duration: 1.2, ease: "linear" }} 
                                    />
                                )}
                            </button>

                            <button 
                                onClick={() => setView('restore')}
                                className="text-[10px] font-mono tracking-widest text-gray-500 hover:text-cyan-400 transition-colors uppercase flex items-center justify-center gap-2 mx-auto"
                            >
                                <Key size={12} />
                                {t('welcome.btn_restore')}
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="restore"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="w-full"
                        >
                            <div className="mb-6 flex items-center justify-between">
                                <button 
                                    onClick={() => { setView('intro'); setError(null); }}
                                    className="p-2 text-gray-500 hover:text-white transition-colors"
                                >
                                    <ArrowLeft size={20} />
                                </button>
                                <span className="text-xs font-bold font-mono text-cyan-500 uppercase tracking-widest">
                                    {t('welcome.btn_restore')}
                                </span>
                                <div className="w-9" />
                            </div>

                            <form onSubmit={handleRestoreSubmit} className="space-y-4">
                                <input 
                                    type="text" 
                                    value={restoreCode}
                                    onChange={(e) => setRestoreCode(e.target.value)}
                                    placeholder={t('welcome.restore_placeholder')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white font-mono text-center font-bold tracking-widest focus:outline-none focus:border-cyan-500/50 uppercase placeholder-gray-700"
                                />
                                <button
                                    type="submit"
                                    disabled={isRestoring || !restoreCode}
                                    className="w-full h-14 bg-cyan-900/40 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-400 rounded-xl font-mono text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isRestoring ? <Loader2 size={16} className="animate-spin" /> : t('welcome.restore_submit')}
                                </button>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                {error && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 px-4 py-3 w-full bg-red-950/30 border border-red-500/30 rounded-lg text-red-400 text-xs font-mono flex items-center justify-center gap-2"
                    >
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>{error}</span>
                    </motion.div>
                )}

                <p className="mt-6 text-[10px] text-gray-600 font-mono">
                    {t('welcome.footer_version')}
                </p>

            </div>
        </div>
      </motion.div>
    </div>
  );
};

const FeatureRow = ({ icon, title, desc, delay }: { icon: any, title: string, desc: string, delay: number }) => (
    <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5 + delay }}
        className="flex items-start gap-4 text-left group/row"
    >
        <div className="mt-0.5 p-2 rounded-lg bg-white/5 text-gray-400 group-hover/row:text-cyan-400 group-hover/row:bg-cyan-500/10 transition-colors duration-300">
            {icon}
        </div>
        <div>
            <h3 className="text-gray-200 font-bold text-xs tracking-wider uppercase mb-0.5 group-hover/row:text-white transition-colors">
                {title}
            </h3>
            <p className="text-gray-500 text-xs leading-relaxed group-hover/row:text-gray-400 transition-colors">
                {desc}
            </p>
        </div>
    </motion.div>
);

export default WelcomeScreen;