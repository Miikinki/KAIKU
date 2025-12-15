import React from 'react';
import QRCode from 'react-qr-code';
import { ShieldAlert, Smartphone } from 'lucide-react';

const DesktopLanding = () => {
  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://kaiku.app';

  const handleDevOverride = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('dev', 'true');
    window.location.href = url.toString();
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a12] text-white font-mono flex flex-col items-center justify-center p-4 overflow-hidden z-[99999]">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 2px, 3px 100%' }} 
      />
      
      <div className="max-w-md w-full border border-red-500/30 bg-red-950/10 p-8 rounded-xl shadow-[0_0_50px_rgba(239,68,68,0.1)] backdrop-blur-sm relative text-center">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
        
        <div className="flex justify-center mb-6">
           <div className="relative">
             <ShieldAlert size={64} className="text-red-500 animate-pulse" />
             <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full animate-pulse" />
           </div>
        </div>

        <h1 className="text-2xl font-black tracking-widest text-red-500 mb-2">ACCESS DENIED</h1>
        <h2 className="text-sm font-bold tracking-wider text-red-400/80 mb-6 border-b border-red-500/20 pb-4 inline-block">
          STATIONARY TERMINAL DETECTED
        </h2>

        <p className="text-gray-400 text-sm leading-relaxed mb-8">
          The <strong className="text-cyan-400">KAIKU Protocol</strong> requires active field operations. 
          Signal triangulation is not possible on stationary nodes.
        </p>

        <div className="bg-white p-4 rounded-lg inline-block mb-4 shadow-xl">
            <QRCode value={currentUrl} size={180} />
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-cyan-400 font-bold tracking-widest uppercase animate-pulse">
            <Smartphone size={14} />
            <span>Scan to Initialize Uplink</span>
        </div>
      </div>

      {/* Hidden Dev Override */}
      <button 
        onClick={handleDevOverride}
        className="fixed bottom-4 right-4 text-[10px] text-gray-800 hover:text-gray-600 font-mono opacity-20 hover:opacity-100 transition-all cursor-pointer"
        title="Developer Override"
      >
        [BYPASS_SECURITY]
      </button>
    </div>
  );
};

export default DesktopLanding;