import React, { useState, useEffect } from 'react';
import { Radio, Shield, Loader2, ChevronRight, Globe, Lock, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { getIpLocation } from '../services/moderationService';

interface WelcomeScreenProps {
  onStart: (location: { lat: number; lng: number }, isFallback: boolean) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("SYSTEM STANDBY");
  const [error, setError] = useState<string | null>(null);

  // Intro animation sequence
  const [showContent, setShowContent] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    
    // Helper to wrap geolocation in a Promise
    const getPosition = (options: PositionOptions): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    };

    // --- STRATEGY 1: HIGH ACCURACY GPS ---
    try {
        setStatusText("INITIALIZING GPS (PRECISION)...");
        
        // Increased timeout to 12s (was 6s) to allow devices more time to lock
        const pos = await getPosition({ 
            enableHighAccuracy: true, 
            timeout: 12000, 
            maximumAge: 0 
        });
        
        onStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }, false);
        return;

    } catch (err: any) {
        console.warn("High Accuracy GPS failed/timed out:", err.code, err.message);
        // Continue to Strategy 2...
    }

    // --- STRATEGY 2: LOW ACCURACY / CACHED GPS ---
    try {
        setStatusText("RETRYING (STANDARD SIGNAL)...");
        
        // Increased timeout to 15s (was 10s)
        const pos = await getPosition({ 
            enableHighAccuracy: false, 
            timeout: 15000, 
            maximumAge: Infinity 
        });
        
        onStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }, false);
        return;

    } catch (err: any) {
        console.warn("Low Accuracy GPS failed:", err.code, err.message);
        
        // If it was a permission denied error (Code 1), stop here.
        if (err.code === 1) {
            setIsLoading(false);
            setStatusText("PERMISSION DENIED");
            setError("LOCATION PERMISSION REQUIRED");
            return;
        }
        // Continue to Strategy 3...
    }

    // --- STRATEGY 3: LOCAL STORAGE (LAST KNOWN) ---
    const savedLoc = localStorage.getItem('kaiku_last_loc');
    if (savedLoc) {
        try {
            const parsed = JSON.parse(savedLoc);
            if (parsed.lat && parsed.lng) {
                setStatusText("USING LAST KNOWN VECTOR...");
                setTimeout(() => {
                    onStart(parsed, true); // Mark as fallback so App knows to keep looking for better signal
                }, 500);
                return;
            }
        } catch (e) {}
    }

    // --- STRATEGY 4: IP GEOLOCATION (LAST RESORT) ---
    try {
        setStatusText("TRIANGULATING VIA NETWORK NODE...");
        const ipLoc = await getIpLocation();
        
        if (ipLoc) {
            onStart(ipLoc, true); // Mark as fallback
            return;
        }
    } catch (e) {
        console.warn("IP Fallback failed", e);
    }

    // --- FAILURE ---
    setIsLoading(false);
    setStatusText("CONNECTION FAILED");
    setError("SIGNAL LOST. CHECK GPS/NETWORK.");
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
                    Hyperlocal Signal Grid
                </p>

                <div className="w-full space-y-6 mb-12">
                    <FeatureRow 
                        icon={<Globe size={18} />} 
                        title="SECTOR SCAN" 
                        desc="Visible only to those within 140km." 
                        delay={0.1}
                    />
                    <FeatureRow 
                        icon={<EyeOff size={18} />} 
                        title="GHOST PROTOCOL" 
                        desc="No names. No accounts. Total anonymity." 
                        delay={0.2}
                    />
                    <FeatureRow 
                        icon={<Lock size={18} />} 
                        title="SIGNAL DECAY" 
                        desc="Messages fade and vanish automatically." 
                        delay={0.3}
                    />
                </div>

                {error && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 px-4 py-3 w-full bg-red-950/30 border border-red-500/30 rounded-lg text-red-400 text-xs font-mono flex items-center justify-center gap-2"
                    >
                        <Shield size={14} />
                        {error}
                    </motion.div>
                )}

                <button
                    onClick={handleConnect}
                    disabled={isLoading}
                    className="relative w-full h-16 bg-white hover:bg-gray-100 text-black rounded-xl overflow-hidden transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:cursor-not-allowed group/btn"
                >
                    <div className="absolute inset-0 flex items-center justify-center gap-3 z-10">
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span className="font-mono font-bold tracking-widest text-sm">{statusText}</span>
                            </>
                        ) : (
                            <>
                                <span className="font-bold tracking-[0.2em] text-sm">INITIALIZE UPLINK</span>
                                <ChevronRight size={20} className="group-hover/btn:translate-x-1 transition-transform" />
                            </>
                        )}
                    </div>
                    
                    {isLoading && (
                        <motion.div 
                            className="absolute inset-0 bg-cyan-300/20 origin-left"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 6 }} 
                        />
                    )}
                </button>

                <p className="mt-6 text-[10px] text-gray-600 font-mono">
                    v2.0 • ENCRYPTED CONNECTION
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