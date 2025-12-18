import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Satellite, Zap, Crown, CheckCircle2, Loader2, BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { triggerHaptic } from '../services/hapticService';
import { getUserProfile, saveUserProfile } from '../services/storageService';

interface PrimeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onActivate: () => void;
}

const PrimeModal: React.FC<PrimeModalProps> = ({ isOpen, onClose, onActivate }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const profile = getUserProfile();

    const handleActivate = () => {
        setIsLoading(true);
        triggerHaptic('heavy');
        
        // Simulating Payment Processing
        setTimeout(() => {
            const updated = { ...profile, isPrime: true };
            saveUserProfile(updated);
            setIsLoading(false);
            onActivate(); // Callback to refresh app state
            triggerHaptic('success');
            onClose();
        }, 2000);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative w-full max-w-sm bg-gradient-to-br from-[#0f0f18] to-[#1a1a24] border border-yellow-500/30 rounded-2xl shadow-[0_0_50px_rgba(234,179,8,0.2)] overflow-hidden"
                >
                    {/* Golden Glow Effect */}
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-yellow-500/20 rounded-full blur-3xl pointer-events-none" />
                    
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white z-10">
                        <X size={24} />
                    </button>

                    <div className="p-8 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mb-4 border border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                            <Crown size={32} className="text-yellow-400" strokeWidth={1.5} />
                        </div>

                        <h2 className="text-xl font-black text-white tracking-widest uppercase mb-1">{t('prime.title')}</h2>
                        <p className="text-[10px] font-mono text-yellow-500 tracking-[0.2em] uppercase mb-8">{t('prime.subtitle')}</p>

                        <div className="w-full space-y-4 mb-8">
                            <FeatureRow 
                                icon={<Satellite size={18} />}
                                title={t('prime.feature_teleport')}
                                desc={t('prime.feature_teleport_desc')}
                            />
                            <FeatureRow 
                                icon={<Zap size={18} />}
                                title={t('prime.feature_gold')}
                                desc={t('prime.feature_gold_desc')}
                            />
                            <FeatureRow 
                                icon={<BellRing size={18} />}
                                title={t('prime.feature_alert')}
                                desc={t('prime.feature_alert_desc')}
                            />
                        </div>

                        {profile.isPrime ? (
                            <div className="w-full py-4 bg-yellow-900/20 border border-yellow-500/30 rounded-xl text-yellow-400 font-mono font-bold tracking-widest flex items-center justify-center gap-2">
                                <CheckCircle2 size={18} />
                                {t('prime.active')}
                            </div>
                        ) : (
                            <button
                                onClick={handleActivate}
                                disabled={isLoading}
                                className="w-full py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-black font-black tracking-widest uppercase rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out skew-x-12" />
                                {isLoading ? <Loader2 className="animate-spin" /> : t('prime.btn_activate')}
                            </button>
                        )}
                        
                        {!profile.isPrime && (
                            <p className="mt-3 text-[10px] text-gray-500 font-mono">{t('prime.price')}</p>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

const FeatureRow = ({ icon, title, desc }: { icon: any, title: string, desc: string }) => (
    <div className="flex items-start gap-3 text-left">
        <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-400 border border-yellow-500/10">
            {icon}
        </div>
        <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wide">{title}</h3>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{desc}</p>
        </div>
    </div>
);

export default PrimeModal;