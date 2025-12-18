import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Activity, Radio, MapPin, Zap, MessageSquare, Radar, Edit2, Save, Check, User, Eye, EyeOff, Key, Copy, AlertTriangle, Loader2, Crown, Bell, BellOff, Calendar } from 'lucide-react';
import { AgentStats } from '../types';
import { fetchAgentStats } from '../services/statsService';
import { getUserProfile, saveUserProfile } from '../services/storageService';
import { generateTransferKey } from '../services/identityService';
import { NotificationService } from '../services/notificationService';
import { AVATAR_COLORS, AVATAR_ICONS } from '../constants';
import { useTranslation } from 'react-i18next';
import { triggerHaptic } from '../services/hapticService';
import PrimeModal from './PrimeModal';

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
    initialName, initialIcon, initialColor, initialHideLevel, initialNotifications, onSave 
}: { 
    initialName: string | null, 
    initialIcon: string, 
    initialColor: string, 
    initialHideLevel: boolean,
    initialNotifications: boolean,
    onSave: (name: string | null, icon: string, color: string, hideLevel: boolean, notifications: boolean) => void 
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState(initialName || '');
    const [icon, setIcon] = useState(initialIcon);
    const [color, setColor] = useState(initialColor);
    const [hideLevel, setHideLevel] = useState(initialHideLevel);
    const [notifications, setNotifications] = useState(initialNotifications);
    
    // Transfer Key State
    const [transferKey, setTransferKey] = useState<string | null>(null);
    const [isGeneratingKey, setIsGeneratingKey] = useState(false);
    const [keyError, setKeyError] = useState<string | null>(null);

    const handleSave = () => {
        triggerHaptic('success');
        onSave(name.trim() || null, icon, color, hideLevel, notifications);
    };

    const handleGenerateKey = async () => {
        setIsGeneratingKey(true);
        setKeyError(null);
        try {
            const code = await generateTransferKey();
            setTransferKey(code);
            triggerHaptic('heavy');
        } catch (e: any) {
            setKeyError(e.message);
            triggerHaptic('error');
        } finally {
            setIsGeneratingKey(false);
        }
    };

    const toggleNotifications = async () => {
        triggerHaptic('light');
        if (!notifications) {
            const granted = await NotificationService.requestPermission();
            if (granted) setNotifications(true);
            else alert("Notifications blocked by browser settings.");
        } else {
            setNotifications(false);
        }
    };

    const copyToClipboard = () => {
        if (transferKey) {
            navigator.clipboard.writeText(transferKey);
            triggerHaptic('light');
            alert("Code copied to clipboard");
        }
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
                        placeholder={t('dossier.anonymous', 'UNKNOWN')}
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
                        {name || t('dossier.anonymous', 'UNKNOWN')}
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

            {/* SETTINGS TOGGLES */}
            <div className="space-y-2">
                {/* Privacy Toggle */}
                <div className="bg-white/5 rounded-lg p-3 flex items-center justify-between border border-white/5">
                    <div className="flex items-center gap-2">
                        {hideLevel ? <EyeOff size={16} className="text-cyan-400" /> : <Eye size={16} className="text-gray-500" />}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">
                            {t('dossier.hide_level', 'HIDE LEVEL PUBLICLY')}
                        </span>
                    </div>
                    <button 
                        onClick={() => { triggerHaptic('light'); setHideLevel(!hideLevel); }}
                        className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${hideLevel ? 'bg-cyan-500' : 'bg-gray-700'}`}
                    >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-md ${hideLevel ? 'left-6' : 'left-1'}`} />
                    </button>
                </div>

                {/* Notifications Toggle */}
                <div className="bg-white/5 rounded-lg p-3 flex items-center justify-between border border-white/5">
                    <div className="flex items-center gap-2">
                        {notifications ? <Bell size={16} className="text-cyan-400" /> : <BellOff size={16} className="text-gray-500" />}
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">
                                {t('dossier.notifications')}
                            </span>
                            <span className="text-[8px] text-gray-500">
                                {t('dossier.notifications_desc')}
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={toggleNotifications}
                        className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${notifications ? 'bg-cyan-500' : 'bg-gray-700'}`}
                    >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-md ${notifications ? 'left-6' : 'left-1'}`} />
                    </button>
                </div>
            </div>

            <button 
                onClick={handleSave}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-widest uppercase rounded-lg shadow-lg flex items-center justify-center gap-2 transition-colors mt-2"
            >
                <Save size={16} />
                {t('dossier.save_identity', 'SAVE IDENTITY')}
            </button>

            {/* TRANSFER KEY SECTION */}
            <div className="pt-6 border-t border-white/10">
                <h3 className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
                    <Key size={12} />
                    {t('dossier.transfer_title')}
                </h3>
                
                {transferKey ? (
                    <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-amber-500 mb-2">
                            <AlertTriangle size={16} />
                            <span className="text-[10px] font-bold uppercase">{t('dossier.key_generated')}</span>
                        </div>
                        <p className="text-[10px] text-amber-200/80 mb-3 leading-relaxed">
                            {t('dossier.key_warning')}
                        </p>
                        <div 
                            onClick={copyToClipboard}
                            className="bg-black/50 border border-amber-500/50 rounded-lg p-3 text-center cursor-pointer hover:bg-black/70 transition-colors flex items-center justify-center gap-2 group"
                        >
                            <span className="text-xl font-mono font-black text-amber-400 tracking-widest break-all">
                                {transferKey}
                            </span>
                            <Copy size={16} className="text-amber-600 group-hover:text-amber-400" />
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={handleGenerateKey}
                        disabled={isGeneratingKey}
                        className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-lg text-xs font-mono tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                        {isGeneratingKey ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                        {t('dossier.generate_key')}
                    </button>
                )}
                {keyError && (
                    <p className="text-[10px] text-red-400 mt-2 font-mono text-center">
                        ERROR: {keyError}
                    </p>
                )}
            </div>
        </div>
    );
};

const AgentDossier: React.FC<AgentDossierProps> = ({ isOpen, onClose }) => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<AgentStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isPrimeModalOpen, setIsPrimeModalOpen] = useState(false);
    
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

    const handleProfileSave = (name: string | null, icon: string, color: string, hideLevel: boolean, notifications: boolean) => {
        const newProfile = { ...profile, displayName: name, avatar: icon, color, hideLevel, notificationsEnabled: notifications };
        saveUserProfile(newProfile);
        setProfile(newProfile);
        setIsEditing(false);
        // Refresh stats to ensure sync
        fetchAgentStats().then(data => setStats(data));
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`w-full max-w-md bg-[#0a0a12] border rounded-xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.15)] relative max-h-[90vh] overflow-y-auto custom-scrollbar ${profile.isPrime ? 'border-yellow-500/50 shadow-[0_0_50px_rgba(234,179,8,0.2)]' : 'border-cyan-500/30'}`}
                    >
                        {/* DECORATIVE LINES */}
                        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent ${profile.isPrime ? 'via-yellow-500' : 'via-cyan-500'} to-transparent opacity-50`} />
                        <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent ${profile.isPrime ? 'via-yellow-500' : 'via-cyan-500'} to-transparent opacity-20`} />
                        
                        {/* HEADER */}
                        <div className="p-6 pb-4 border-b border-white/10 relative">
                            <button 
                                onClick={onClose} 
                                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                            
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`p-2 rounded-lg border ${profile.isPrime ? 'bg-yellow-950/50 border-yellow-500/50' : 'bg-cyan-950/50 border-cyan-500/50'}`}>
                                    {profile.isPrime ? <Crown size={24} className="text-yellow-400" /> : <Shield size={24} className="text-cyan-400" />}
                                </div>
                                <div className="flex-1">
                                    <h2 className={`text-sm font-bold tracking-[0.2em] uppercase mb-0.5 ${profile.isPrime ? 'text-yellow-400' : 'text-cyan-400'}`}>
                                        {isEditing ? t('dossier.edit_identity', 'EDIT IDENTITY') : t('dossier.title', 'IDENTITY')}
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        {isEditing ? (
                                            <p className="text-xs text-gray-400 font-mono">
                                                {t('dossier.configure_visuals', 'Configure visual signature')}
                                            </p>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${profile.isPrime ? 'bg-yellow-500' : 'bg-green-500'}`} />
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
                                    <div className={`absolute inset-0 bg-gradient-to-r ${profile.isPrime ? 'from-yellow-500/10' : 'from-cyan-500/10'} to-transparent opacity-50`} />
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
                                                {profile.displayName || t('dossier.anonymous', 'UNKNOWN')}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <div className="px-1.5 py-0.5 bg-black/40 rounded border border-white/10 text-[9px] font-black text-cyan-400 font-mono">
                                                    LVL {stats?.rankLevel || 1}
                                                </div>
                                                <div className="text-[9px] text-gray-400 font-mono uppercase tracking-wide">
                                                    {t(`dossier.ranks.${stats?.rankTitle || '1'}`)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {profile.isPrime && (
                                        <div className="relative z-10 bg-yellow-500/20 border border-yellow-500/30 px-2 py-1 rounded text-[8px] font-bold text-yellow-400 tracking-widest uppercase">
                                            PRIME
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* PROGRESS BAR (Only in Stat Mode) */}
                            {!isEditing && stats && (
                                <div className="mt-4">
                                    <div className="flex justify-between text-[9px] font-mono text-cyan-700 mb-1">
                                        <span>XP {Math.floor(stats.xp)}</span>
                                        <span>{stats.nextLevelXp} XP</span>
                                    </div>
                                    <div className="h-2 bg-black/50 rounded-full overflow-hidden flex relative border border-white/5">
                                        <motion.div 
                                            className={`h-full bg-gradient-to-r ${profile.isPrime ? 'from-yellow-600 to-yellow-400 shadow-[0_0_10px_gold]' : 'from-cyan-600 to-cyan-400 shadow-[0_0_10px_cyan]'}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(stats.progress || 0) * 100}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* CONTENT SWITCHER */}
                        {isEditing ? (
                            <IdentityEditor 
                                initialName={profile.displayName} 
                                initialIcon={profile.avatar} 
                                initialColor={profile.color} 
                                initialHideLevel={profile.hideLevel}
                                initialNotifications={profile.notificationsEnabled}
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
                                        {/* STREAK CARD */}
                                        <div className="col-span-2 bg-[#0f0f18] border border-white/10 p-3 rounded-lg flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-white/5 rounded-lg text-orange-400">
                                                    <Calendar size={18} />
                                                </div>
                                                <div>
                                                    <div className="text-xl font-black text-white font-mono leading-none">
                                                        {profile.streak} <span className="text-xs font-normal text-gray-500">{t('dossier.days')}</span>
                                                    </div>
                                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{t('dossier.streak')}</span>
                                                </div>
                                            </div>
                                            {/* Streak Dots */}
                                            <div className="flex gap-1">
                                                {[...Array(7)].map((_, i) => (
                                                    <div 
                                                        key={i} 
                                                        className={`w-1.5 h-1.5 rounded-full ${i < (profile.streak % 7) || (profile.streak > 0 && i === 0 && profile.streak % 7 === 0) ? 'bg-orange-500 shadow-[0_0_5px_orange]' : 'bg-white/10'}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>

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
                                        
                                        {!profile.isPrime && (
                                            <button 
                                                onClick={() => { triggerHaptic('light'); setIsPrimeModalOpen(true); }}
                                                className="col-span-2 mt-2 py-3 bg-gradient-to-r from-yellow-900/40 to-yellow-600/20 border border-yellow-500/30 rounded-lg text-yellow-400 font-bold tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-yellow-900/60 transition-colors"
                                            >
                                                <Crown size={16} />
                                                {t('dossier.prime_status')}
                                            </button>
                                        )}
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
            
            <PrimeModal 
                isOpen={isPrimeModalOpen} 
                onClose={() => setIsPrimeModalOpen(false)}
                onActivate={() => {
                    setProfile(getUserProfile()); // Refresh local profile
                    fetchAgentStats().then(data => setStats(data));
                }}
            />
        </AnimatePresence>
    );
};

export default AgentDossier;