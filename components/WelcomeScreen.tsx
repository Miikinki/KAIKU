import React, { useState } from 'react';
import { Radio, MapPin, Zap, Shield, Globe, Loader2, ChevronRight, RefreshCw } from 'lucide-react';
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

    // FIX: Relaxed constraints to prevent Timeouts
    // maximumAge: 10000 allows using a GPS fix from the last 10 seconds (much faster).
    // timeout: 15000 gives the device reasonable time without hanging forever.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onStart({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      (err) => {
        console.warn("GPS Error", err);
        setIsLoading(false);
        
        if (err.code === 1) {
            setError("Sijainti estetty. Salli GPS selaimen asetuksista.");
        } else if (err.code === 2) {
            setError("Sijaintia ei löydy. Tarkista GPS-asetukset.");
        } else if (err.code === 3) {
            setError("Haku aikakatkaistiin. Yritä uudelleen.");
        } else {
            setError(`GPS Virhe: ${err.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000, 
        maximumAge: 10000 
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-[#050508] flex flex-col items-center justify-center p-6 text-center z-[9999]">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
        <p className="text-cyan-500/80 font-mono text-sm tracking-widest uppercase mb-8">
            Global Local Chat Grid
        </p>

        <div className="space-y-4 mb-10 text-left bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex items-start gap-3">
                <MapPin className="text-cyan-400 shrink-0 mt-1" size={18} />
                <div>
                    <h3 className="text-white font-bold text-sm">Tarkka Sijainti</h3>
                    <p className="text-gray-400 text-xs mt-1">Vaadimme GPS-yhteyden toimiaksemme. Emme käytä epätarkkaa verkkopaikannusta.</p>
                </div>
            </div>
            <div className="flex items-start gap-3">
                <Shield className="text-cyan-400 shrink-0 mt-1" size={18} />
                <div>
                    <h3 className="text-white font-bold text-sm">Yksityisyys edellä</h3>
                    <p className="text-gray-400 text-xs mt-1">Tarkkaa sijaintiasi ei koskaan näytetä muille. Olet vain signaali kartalla.</p>
                </div>
            </div>
            <div className="flex items-start gap-3">
                <Zap className="text-cyan-400 shrink-0 mt-1" size={18} />
                <div>
                    <h3 className="text-white font-bold text-sm">Reaaliaikainen</h3>
                    <p className="text-gray-400 text-xs mt-1">Näe signaalit ja vastaukset välittömästi, kun ne tapahtuvat.</p>
                </div>
            </div>
        </div>

        {error && (
            <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 text-sm flex items-center gap-3"
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
                        <span>{statusText}</span>
                    </>
                ) : (
                    <>
                        {error ? <RefreshCw size={20} className="fill-white" /> : <Zap size={20} className="fill-white" />}
                        <span>{error ? "Yritä Uudelleen" : "Yhdistä Verkkoon"}</span>
                        <ChevronRight className="group-hover:translate-x-1 transition-transform" />
                    </>
                )}
            </div>
            
            {/* Button Shine Effect */}
            {!isLoading && (
                <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0" />
            )}
        </button>

        <p className="mt-6 text-[10px] text-gray-600 font-mono">
            v1.0.9 • GPS SIGNAL REQUIRED
        </p>

      </motion.div>
    </div>
  );
};

export default WelcomeScreen;