import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, MapPin, X, Gift, Send, Loader2, Lock, Unlock, CheckCircle } from 'lucide-react';
import { LootDrop } from '../types';
import { deployLootDrop, claimLootDrop } from '../services/storageService';
import { triggerHaptic } from '../services/hapticService';
import { SoundService } from '../services/soundService';

interface DeployLootModalProps {
    isOpen: boolean;
    onClose: () => void;
    location: { lat: number, lng: number } | null;
}

export const DeployLootModal: React.FC<DeployLootModalProps> = ({ isOpen, onClose, location }) => {
    const [message, setMessage] = useState('');
    const [code, setCode] = useState('');
    const [isDeploying, setIsDeploying] = useState(false);

    const handleDeploy = async () => {
        if (!location || !message || !code) return;
        setIsDeploying(true);
        try {
            await deployLootDrop(location.lat, location.lng, message, code);
            triggerHaptic('success');
            SoundService.playSuccess();
            onClose();
            setMessage('');
            setCode('');
        } catch (e) {
            alert("Deployment Failed: " + e);
            triggerHaptic('error');
        } finally {
            setIsDeploying(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-sm bg-amber-950/90 border border-amber-500/50 rounded-xl p-6 text-amber-100"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-amber-500 tracking-widest uppercase flex items-center gap-2">
                        <Package size={20} />
                        DEPLOY SUPPLY DROP
                    </h3>
                    <button onClick={onClose}><X size={20} /></button>
                </div>

                <div className="space-y-4">
                    <div className="bg-black/40 p-3 rounded border border-amber-500/20 text-xs font-mono">
                        TARGET: {location?.lat.toFixed(5)}, {location?.lng.toFixed(5)}
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">Public Message</label>
                        <input 
                            value={message} 
                            onChange={e => setMessage(e.target.value)}
                            placeholder="e.g. FREE COFFEE AT CAFE X"
                            className="w-full bg-black/30 border border-amber-500/30 rounded p-3 text-white focus:outline-none focus:border-amber-500"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">Secret Reward Code</label>
                        <input 
                            value={code} 
                            onChange={e => setCode(e.target.value)}
                            placeholder="e.g. KAIKU-FREE-123"
                            className="w-full bg-black/30 border border-amber-500/30 rounded p-3 text-white focus:outline-none focus:border-amber-500 font-mono"
                        />
                    </div>

                    <button 
                        onClick={handleDeploy}
                        disabled={isDeploying || !message || !code}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-black font-black uppercase tracking-widest rounded flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isDeploying ? <Loader2 className="animate-spin" /> : <Send size={16} />}
                        CONFIRM DROP
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

interface ClaimLootModalProps {
    drop: LootDrop | null;
    onClose: () => void;
    userLocation: { lat: number, lng: number } | null;
}

export const ClaimLootModal: React.FC<ClaimLootModalProps> = ({ drop, onClose, userLocation }) => {
    const [isClaiming, setIsClaiming] = useState(false);
    const [reward, setReward] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleClaim = async () => {
        if (!drop || !userLocation) return;
        setIsClaiming(true);
        setError(null);
        try {
            const code = await claimLootDrop(drop.id, userLocation.lat, userLocation.lng);
            setReward(code);
            triggerHaptic('success');
            SoundService.playSuccess();
        } catch (e: any) {
            setError(e.message);
            triggerHaptic('error');
        } finally {
            setIsClaiming(false);
        }
    };

    if (!drop) return null;

    return (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full max-w-sm bg-[#0f0f18] border border-amber-500/50 rounded-xl p-6 relative overflow-hidden"
            >
                {reward ? (
                    <div className="text-center py-6">
                        <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4 text-green-400">
                            <Unlock size={32} />
                        </div>
                        <h2 className="text-2xl font-black text-white mb-2">ACCESS GRANTED</h2>
                        <p className="text-gray-400 text-xs mb-6">Here is your reward code:</p>
                        
                        <div className="bg-amber-500/20 border border-amber-500 text-amber-400 p-4 rounded-lg font-mono text-xl font-bold tracking-widest break-all select-all">
                            {reward}
                        </div>
                        
                        <button onClick={onClose} className="mt-6 w-full py-3 bg-white/10 hover:bg-white/20 rounded text-white font-bold uppercase">
                            Close
                        </button>
                    </div>
                ) : (
                    <>
                        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20} /></button>
                        
                        <div className="flex justify-center mb-6">
                            <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center animate-pulse border border-amber-500/50">
                                <Package size={40} className="text-amber-500" />
                            </div>
                        </div>

                        <h2 className="text-center text-xl font-bold text-white mb-2">SUPPLY DROP DETECTED</h2>
                        <p className="text-center text-amber-400 font-mono text-sm mb-6 border-b border-white/10 pb-4">
                            "{drop.message}"
                        </p>

                        <div className="bg-white/5 p-4 rounded-lg mb-6 flex items-center gap-3">
                            <MapPin className={userLocation ? "text-green-400" : "text-red-400"} />
                            <div className="text-xs">
                                <div className="text-gray-400 font-bold uppercase">Distance Check</div>
                                <div className="text-white">
                                    {userLocation ? "GPS LOCKED" : "WAITING FOR GPS..."}
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded text-red-400 text-xs text-center">
                                {error}
                            </div>
                        )}

                        <button 
                            onClick={handleClaim}
                            disabled={isClaiming || !userLocation}
                            className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-black font-black uppercase tracking-widest rounded-lg shadow-[0_0_20px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isClaiming ? <Loader2 className="animate-spin" /> : <Gift size={18} />}
                            CLAIM REWARD
                        </button>
                        <p className="text-center text-[9px] text-gray-600 mt-3 font-mono">
                            MUST BE WITHIN 100M TO CLAIM
                        </p>
                    </>
                )}
            </motion.div>
        </div>
    );
};
