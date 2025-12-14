import React, { useState } from 'react';
import { Radio, MapPin, Zap, Shield, Loader2, ChevronRight, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface WelcomeScreenProps {
  onStart: (location: { lat: number; lng: number }) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("Käynnistetään GPS...");
  const [error, setError] = useState<string | null>(null);

  const handleConnect = () => {
    setIsLoading(true);
    setError(null);
    setStatusText("Haetaan sijaintia...");

    if (!navigator.geolocation) {
      setError("Laitteesi ei tue GPS-paikannusta.");
      setIsLoading(false);
      return;
    }

    // STRATEGY: SPEED FIRST ("Salamannopeasti")
    // We use enableHighAccuracy: FALSE for the Welcome Screen.
    // This uses Wifi/Cell towers which is instant (ms) vs GPS (10s+).
    // The main app (App.tsx) upgrades to High Accuracy in the background automatically.
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
          onStart({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
      },
      (err) => {
          console.warn("GPS Start Error:", err.code, err.message);
          setIsLoading(false);
          
          if (err.code === 1) {
              setError("Sijainti estetty. Salli GPS selaimen asetuksista.");
          } else if (err.code === 2) {
              setError("Sijaintia ei löydy. Tarkista verkkoyhteys.");
          } else if (err.code === 3) {
              setError("Haku aikakatkaistiin. Yritä uudelleen.");
          } else {
              setError(`GPS Virhe: ${err.message}`);
          }
      },
      {
        enableHighAccuracy: false, // <--- CHANGED: False ensures instant network location
        timeout: 15000, 
        maximumAge: Infinity // <--- Accept any cached position immediately
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-[#050508] flex flex-col items-center justify-center p-6 text-center z-[9999]">
      
      {/* Background Ambience & Textures */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Subtle Cyber Grid */}
          <div 
            className="absolute inset-0 opacity-[0.15]" 
            style={{ 
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm1 1h38v38H1V1z' fill='%2306b6d4' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E")` 
            }} 
          />
          
          {/* Digital Noise */}
          <div 
             className="absolute inset-0 opacity-[0.04]"
             style={{
                 backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
             }}
          />

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] animate-pulse" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 max-w-md w-full flex flex-col items-center"
      >
        {/* Logo */}
        <div className="mb-8 relative">
            <div className="w-24 h-24 rounded-full border border-cyan-500/30 flex items-center justify-center bg-[#0a0a12] shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                <Radio size={48} className="text-cyan-400 animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-[spin_10s_linear_infinite]" />
        </div>

        <h1 className="text-4xl font-black tracking-[0.2em] text-white mb-2">KAIKU</h1>
        <p className="text-cyan-500/80 font-mono text-sm tracking-[0.3em] uppercase mb-8">
            HYPERLOCAL SIGNAL GRID
        </p>

        <div className="space-y-5 mb-10 text-left bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-md relative overflow-hidden">
            {/* Tech Scan Line decoration */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent animate-[scan_4s_linear_infinite]" />

            <div className="flex items-start gap-4">
                <div className="mt-1 p-1 bg-cyan-500/10 rounded border border-cyan-500/20">
                    <MapPin className="text-cyan-400" size={16} />
                </div>
                <div>
                    <h3 className="text-white font-bold text-xs font-mono tracking-widest uppercase">Hyper-paikallinen</h3>
                    <p className="text-gray-400 text-xs mt-1 leading-relaxed">Vain kantaman sisällä. 140km säde. Ei poikkeuksia.</p>
                </div>
            </div>
            <div className="flex items-start gap-4">
                 <div className="mt-1 p-1 bg-cyan-500/10 rounded border border-cyan-500/20">
                    <Shield className="text-cyan-400" size={16} />
                </div>
                <div>
                    <h3 className="text-white font-bold text-xs font-mono tracking-widest uppercase">Yksityisyys edellä</h3>
                    <p className="text-gray-400 text-xs mt-1 leading-relaxed">Ei tallennusta. Ei seurantaa.</p>
                </div>
            </div>
            <div className="flex items-start gap-4">
                 <div className="mt-1 p-1 bg-cyan-500/10 rounded border border-cyan-500/20">
                    <Zap className="text-cyan-400" size={16} />
                </div>
                <div>
                    <h3 className="text-white font-bold text-xs font-mono tracking-widest uppercase">Anonyymi</h3>
                    <p className="text-gray-400 text-xs mt-1 leading-relaxed">Ei tunnuksia. Ei jälkiä. Olet vain signaali pimeydessä.</p>
                </div>
            </div>
        </div>

        {error && (
            <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 text-sm flex items-center gap-3 font-mono"
            >
                <Shield className="shrink-0" size={20} />
                {error}
            </motion.div>
        )}

        <button
            onClick={handleConnect}
            disabled={isLoading}
            className="group relative w-full py-4 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold tracking-widest uppercase rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] overflow-hidden"
        >
            <div className="flex items-center justify-center gap-3 relative z-10">
                {isLoading ? (
                    <>
                        <Loader2 className="animate-spin" />
                        <span className="font-mono">{statusText}</span>
                    </>
                ) : (
                    <>
                        {error ? <RefreshCw size={20} className="fill-white" /> : <Zap size={20} className="fill-white" />}
                        <span className="font-mono tracking-[0.2em]">{error ? "YRITÄ UUDELLEEN" : "MUODOSTA YHTEYS"}</span>
                        <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                    </>
                )}
            </div>
            
            {/* Button Shine Effect */}
            {!isLoading && (
                <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0" />
            )}
        </button>

        <p className="mt-6 text-[10px] text-gray-600 font-mono tracking-widest">
            v1.1.0 • SECURE CONNECTION
        </p>

      </motion.div>
    </div>
  );
};

export default WelcomeScreen;