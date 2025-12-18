import React, { useState, useEffect } from 'react';
import { Activity, X, Bug, Wifi, Globe, Key } from 'lucide-react';
import { getAnonymousID } from '../services/storageService';

interface DebugOverlayProps {
  gpsAccuracy: number | null;
  userLocation: { lat: number, lng: number } | null;
  lastError: string | null;
}

const DebugOverlay: React.FC<DebugOverlayProps> = ({ gpsAccuracy, userLocation, lastError }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Monkey-patch console.log to show on screen
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const addLog = (type: string, args: any[]) => {
      const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      setLogs(prev => [`[${type}] ${msg}`, ...prev].slice(0, 20));
    };

    console.log = (...args) => { addLog('LOG', args); originalLog(...args); };
    console.warn = (...args) => { addLog('WRN', args); originalWarn(...args); };
    console.error = (...args) => { addLog('ERR', args); originalError(...args); };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 left-4 z-[9999] p-2 bg-red-900/50 text-red-200 text-xs rounded-full border border-red-500/30 backdrop-blur-md font-mono"
      >
        <Bug size={16} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 text-green-400 font-mono text-[10px] p-4 overflow-auto flex flex-col gap-4">
      <div className="flex justify-between items-center border-b border-green-900 pb-2">
        <h3 className="font-bold text-lg flex items-center gap-2"><Activity /> DEBUG CONSOLE</h3>
        <button onClick={() => setIsOpen(false)}><X size={24} /></button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 border border-green-900 rounded">
          <div className="text-gray-500 mb-1 flex items-center gap-1"><Wifi size={10} /> GPS ACCURACY</div>
          <div className="text-xl">{gpsAccuracy ? `${Math.round(gpsAccuracy)}m` : 'N/A'}</div>
        </div>
        <div className="p-2 border border-green-900 rounded">
          <div className="text-gray-500 mb-1 flex items-center gap-1"><Globe size={10} /> LOCATION</div>
          <div>{userLocation ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}` : 'WAITING'}</div>
        </div>
        <div className="p-2 border border-green-900 rounded col-span-2">
           <div className="text-gray-500 mb-1 flex items-center gap-1"><Key size={10} /> SESSION ID</div>
           <div className="break-all">{getAnonymousID()}</div>
        </div>
      </div>

      {lastError && (
        <div className="p-2 bg-red-900/20 border border-red-500 text-red-400 rounded">
          <strong>LAST ERROR:</strong> {lastError}
        </div>
      )}

      <div className="flex-1 overflow-auto border border-green-900 rounded p-2 bg-black">
        {logs.map((log, i) => (
          <div key={i} className={`mb-1 border-b border-white/5 pb-1 ${log.includes('[ERR]') ? 'text-red-400' : 'text-gray-300'}`}>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DebugOverlay;