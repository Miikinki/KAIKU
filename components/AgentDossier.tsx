import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Activity, Radio, MapPin, Zap, MessageSquare, Radar, Edit2, Save, Check, User } from 'lucide-react';
import { AgentStats } from '../types';
import { fetchAgentStats } from '../services/statsService';
import { getUserProfile, saveUserProfile } from '../services/storageService';
import { AVATAR_COLORS, AVATAR_ICONS } from '../constants';
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

const IdentityEditor = ({ 
    initialName, initialIcon, initialColor, onSave 
}: { 
    initialName: string | null, 
    initialIcon: string, 
    initialColor: string, 
    onSave: (name: string | null, icon: string, color: string) => void 
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState(initialName || '');
    const [icon, setIcon] = useState(initialIcon);
    const [color, setColor] = useState(initialColor);

    const handleSave = () => {
        triggerHaptic('success');
        onSave(name.trim() || null, icon, color);
    };

    return (
        <div className="p-4 space-y-5">
            {/* CALLSIGN */}
            <div className="space-y-2">
                <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                    {t('dossier.callsign', 'CALLSIGN')}
                </label>
                <div className="relative">
                    <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => setName(e.target.value.slice(0, 15))}
                        placeholder={t('dossier.anonymous', 'ANONYMOUS')}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white font-mono font-bold tracking-widest focus:outline-none focus:border-cyan-500/50 uppercase placeholder-gray-700"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 font-mono">
                        {name.length}/15
                    </div>
                </div>
            </div>

            {/* PREVIEW */}
            <div className="flex items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/5">
                <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-white/20"
                    style={{ backgroundColor: color, color: '#000' }}
                >
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                        <path d={AVATAR_ICONS[icon]} />
                     </svg>
                </div>
                <div>
                    <div className="text-xs font-bold font-mono tracking-wider" style={{ color: color }}>
                        {name || t('dossier.anonymous', 'ANONYMOUS')}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">
                        ID: 8F3...A19
                    </div>
                </div>
            </div>

            {/* ICON GRID */}
            <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">
                    {t('dossier.icon', 'ICON')}
                </label>
                <div className="grid grid-cols-6 gap-2">
                    {Object.keys(AVATAR_ICONS).map((iconKey) => (
                        <button 
                            key={iconKey}
                            onClick={() => { triggerHaptic('light'); setIcon(iconKey); }}
                            className={`aspect-square rounded-lg flex items-center justify-center border transition-all
                                ${icon === iconKey 
                                    ? 'bg-white/10 border-cyan-400 text-white shadow-[0_0_10px_rgba(34,211,238,0.2)]' 
                                    : 'bg-black/20 border-white/5 text-gray-500 hover:bg-white/5'
                                }
                            `}
                        >
                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <path d={AVATAR_ICONS[iconKey]} />
                             </svg>
                        </button>
                    ))}
                </div>
            </div>

            {/* COLOR GRID */}
            <div>
                 <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2 block">
                    {t('dossier.color', 'COLOR')}
                </label>
                <div className="flex justify-between gap-1">
                    {AVATAR_COLORS.map((c) => (
                        <button 
                            key={c}
                            onClick={() => { triggerHaptic('light'); setColor(c); }}
                            className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-95
                                ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}
                            `}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </div>

            <button 
                onClick={handleSave}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-widest uppercase rounded-lg shadow-lg flex items-center justify-center gap-2 transition-colors mt-2"
            >
                <Save size={16} />
                {t('dossier.save_identity', 'SAVE IDENTITY')}
            </button>
        </div>
    );
};

const AgentDossier: React.FC<AgentDossierProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<AgentStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    
    // Profile State
    const [profile, setProfile] = useState(getUserProfile());

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setIsEditing(false); // Reset to stats view on open
            fetchAgentStats().then(data => {
                setStats(data);
                setLoading(false);
            });
            setProfile(getUserProfile());
        }
    }, [isOpen]);

    const handleProfileSave = (name: string | null, icon: string, color: string) => {
        const newProfile = { displayName: name, avatar: icon, color };
        saveUserProfile(newProfile);
        setProfile(newProfile);
        setIsEditing(false);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-md bg-[#0a0a12] border border-cyan-500/30 rounded-xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] relative max-h-[90vh] overflow-y-auto custom-scrollbar"
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
                                <div className="flex-1">
                                    <h2 className="text-sm font-bold text-cyan-400 tracking-[0.2em] uppercase mb-0.5">
                                        {isEditing ? t('dossier.edit_identity', 'EDIT IDENTITY') : t('dossier.title', 'AGENT DOSSIER')}
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        {isEditing ? (
                                            <p className="text-xs text-gray-400 font-mono">
                                                {t('dossier.configure_visuals', 'Configure visual signature')}
                                            </p>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                                <p className="text-xs font-mono text-gray-400">
                                                    ID: {stats?.id.slice(0, 8) || '????????'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                {/* TOGGLE EDIT BUTTON */}
                                {!isEditing && (
                                    <button 
                                        onClick={() => { triggerHaptic('light'); setIsEditing(true); }}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors border border-white/5"
                                        title="Edit Identity"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                )}
                                {isEditing && (
                                     <button 
                                        onClick={() => { triggerHaptic('light'); setIsEditing(false); }}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors border border-white/5"
                                        title="Cancel"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            {/* IDENTITY CARD (Only shown in Stat Mode) */}
                            {!isEditing && (
                                <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-2 relative overflow-hidden flex items-center justify-between">
                                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-50" />
                                    <div className="relative z-10 flex items-center gap-3">
                                        <div 
                                            className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-white/20"
                                            style={{ backgroundColor: profile.color, color: '#000' }}
                                        >
                                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                                                <path d={AVATAR_ICONS[profile.avatar]} />
                                             </svg>
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold font-mono tracking-wider uppercase" style={{ color: profile.color }}>
                                                {profile.displayName || t('dossier.anonymous', 'ANONYMOUS')}
                                            </div>
                                            <div className="text-[9px] text-gray-400 font-mono uppercase">
                                                {stats?.rankTitle || 'OBSERVER'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* PROGRESS BAR (Only in Stat Mode) */}
                            {!isEditing && (
                                <>
                                    <div className="h-1.5 bg-black/50 rounded-full overflow-hidden flex mt-2">
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
                                </>
                            )}
                        </div>

                        {/* CONTENT SWITCHER */}
                        {isEditing ? (
                            <IdentityEditor 
                                initialName={profile.displayName} 
                                initialIcon={profile.avatar} 
                                initialColor={profile.color} 
                                onSave={handleProfileSave} 
                            />
                        ) : (
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
                        )}

                        {!isEditing && (
                            <div className="p-4 bg-black/40 border-t border-white/5 text-center">
                                <p className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">
                                    {t('dossier.footer', 'DATA ENCRYPTED • EYES ONLY')}
                                </p>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default AgentDossier;