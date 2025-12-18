import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Activity, Radio, MapPin, Zap, MessageSquare, Radar } from 'lucide-react';
import { AgentStats } from '../types';
import { fetchAgentStats } from '../services/statsService';
import { useTranslation } from 'react-i18next';
import { triggerHaptic } from '../services/hapticService';

interface AgentDossierProps {
    isOpen: boolean;
    onClose: () => void;
}

const StatCard = ({ label, value, icon, delay }: { label: string, value: number, icon: any, delay: number }) => (
    <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay, type: "spring" }}
        className="bg-[#0f0f18] border border-cyan-900/40 p-3 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group"
    >
        <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="text-cyan-500 mb-1 opacity-80">{icon}</div>
        <motion.span 
            className="text-2xl font-black text-white font-mono tracking-tighter"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: delay + 0.2 }}
        >
            {value}
        </motion.span>
        <span className="text-[9px] font-bold text-cyan-700 uppercase tracking-widest">{label}</span>
    </motion.div>
);

const AgentDossier: React.FC<AgentDossierProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<AgentStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            fetchAgentStats().then(data => {
                setStats(data);
                setLoading(false);
            });
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-md bg-[#0a0a12] border border-cyan-500/30 rounded-xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] relative"
                    >
                        {/* DECORATIVE LINES */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
                        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-20" />
                        
                        {/* HEADER */}
                        <div className="p-6 pb-4 border-b border-white/10 relative">
                            <button 
                                onClick={onClose} 
                                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                            
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-cyan-950/50 border border-cyan-500/50 rounded-lg">
                                    <Shield size={24} className="text-cyan-400" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-cyan-400 tracking-[0.2em] uppercase mb-0.5">
                                        {t('dossier.title', 'AGENT DOSSIER')}
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                        <p className="text-xs font-mono text-gray-400">
                                            ID: {stats?.id.slice(0, 8) || '????????'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* RANK BANNER */}
                            <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-2 relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-50" />
                                <div className="relative z-10 flex justify-between items-end mb-2">
                                    <span className="text-[10px] text-gray-400 font-mono uppercase">{t('dossier.clearance', 'CLEARANCE LEVEL')}</span>
                                    <span className="text-xl font-black text-white tracking-widest italic">
                                        {stats?.rankTitle || '...'}
                                    </span>
                                </div>
                                {/* PROGRESS BAR */}
                                <div className="h-1.5 bg-black/50 rounded-full overflow-hidden flex">
                                    <motion.div 
                                        className="h-full bg-cyan-400 shadow-[0_0_10px_cyan]"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(stats?.progress || 0) * 100}%` }}
                                        transition={{ duration: 1, ease: "easeOut" }}
                                    />
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span className="text-[9px] text-cyan-700 font-mono">LVL {stats?.rankLevel || 0}</span>
                                    <span className="text-[9px] text-cyan-700 font-mono">LVL {(stats?.rankLevel || 0) + 1}</span>
                                </div>
                            </div>
                        </div>

                        {/* STATS GRID */}
                        <div className="p-6 grid grid-cols-2 gap-3">
                            {loading ? (
                                <div className="col-span-2 py-10 flex justify-center text-cyan-500/50">
                                    <Activity className="animate-pulse" />
                                </div>
                            ) : (
                                <>
                                    <StatCard 
                                        label={t('dossier.transmissions', 'TRANSMISSIONS')} 
                                        value={stats?.totalTransmissions || 0} 
                                        icon={<Radio size={18} />} 
                                        delay={0.1} 
                                    />
                                    <StatCard 
                                        label={t('dossier.impact', 'SIGNAL IMPACT')} 
                                        value={stats?.signalImpact || 0} 
                                        icon={<Zap size={18} />} 
                                        delay={0.2} 
                                    />
                                    <StatCard 
                                        label={t('dossier.replies', 'REPLIES RECD')} 
                                        value={stats?.repliesReceived || 0} 
                                        icon={<MessageSquare size={18} />} 
                                        delay={0.3} 
                                    />
                                    <StatCard 
                                        label={t('dossier.sectors', 'ACTIVE SECTORS')} 
                                        value={stats?.sectorsActive || 0} 
                                        icon={<MapPin size={18} />} 
                                        delay={0.4} 
                                    />
                                    <StatCard 
                                        label={t('dossier.scans', 'NEWS SCANNED')} 
                                        value={stats?.newsScanned || 0} 
                                        icon={<Radar size={18} />} 
                                        delay={0.5} 
                                    />
                                </>
                            )}
                        </div>

                        <div className="p-4 bg-black/40 border-t border-white/5 text-center">
                            <p className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">
                                {t('dossier.footer', 'DATA ENCRYPTED • EYES ONLY')}
                            </p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default AgentDossier;