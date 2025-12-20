import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Activity, Radio, MapPin, Zap, MessageSquare, Radar, Edit2, Save, Check, User, Eye, EyeOff, Key, Copy, AlertTriangle, Loader2, Crown, Bell, BellOff, Calendar, Info, Medal, ChevronRight, Lock, Package, CheckCircle2 } from 'lucide-react';
import { AgentStats } from '../types';
import { fetchAgentStats } from '../services/statsService';
import { getUserProfile, saveUserProfile } from '../services/storageService';
import { generateTransferKey } from '../services/identityService';
import { NotificationService } from '../services/notificationService';
import { AVATAR_COLORS, AVATAR_ICONS, BADGES } from '../constants';
import { useTranslation } from 'react-i18next';
import { triggerHaptic } from '../services/hapticService';
import PrimeModal from './PrimeModal';

interface AgentDossierProps {
    isOpen: boolean;
    onClose: () => void;
    onGameMasterToggle?: (enabled: boolean) => void;
    isGameMasterMode?: boolean;
}

const StatCard = ({ label, value, icon, delay, className = "" }: { label: string, value: string | number, icon: any, delay: number, className?: string }) => (
    <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay * 0.1 }}
        className={`bg-[#0f0f18] p-3 rounded-lg border border-white/5 relative overflow-hidden group ${className}`}
    >
        <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
            {icon}
        </div>
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
        <div className="text-xl font-mono font-bold text-white relative z-10">{value}</div>
    </motion.div>
);

const IdentityEditor = ({ initialName, initialIcon, initialColor, initialHideLevel, initialNotifications, onSave }: any) => {
    const { t } = useTranslation();
    const [name, setName] = useState(initialName || '');
    const [icon, setIcon] = useState(initialIcon);
    const [color, setColor] = useState(initialColor);
    const [hideLevel, setHideLevel] = useState(initialHideLevel);
    const [notifications, setNotifications] = useState(initialNotifications);

    // Permission check for notifications
    const toggleNotifications = async () => {
        if (!notifications) {
            const granted = await NotificationService.requestPermission();
            if (granted) {
                setNotifications(true);
                triggerHaptic('success');
            } else {
                alert("Notification permission denied by browser.");
                triggerHaptic('error');
            }
        } else {
            setNotifications(false);
            triggerHaptic('light');
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">{t('dossier.callsign')}</label>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-black/40 border border-white/20" style={{ color: color }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                                <path d={AVATAR_ICONS[icon]} />
                            </svg>
                        </div>
                    </div>
                    <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => setName(e.target.value.slice(0, 15))}
                        placeholder={t('dossier.anonymous')}
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-cyan-500/50"
                    />
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">{t('dossier.icon')}</label>
                <div className="grid grid-cols-6 gap-2">
                    {Object.keys(AVATAR_ICONS).map((key) => (
                        <button 
                            key={key}
                            onClick={() => { setIcon(key); triggerHaptic('light'); }}
                            className={`aspect-square rounded-lg flex items-center justify-center transition-all ${icon === key ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-400' : 'bg-black/40 border border-white/5 text-gray-600 hover:bg-white/5'}`}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <path d={AVATAR_ICONS[key]} />
                            </svg>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 block">{t('dossier.color')}</label>
                <div className="flex flex-wrap gap-3">
                    {AVATAR_COLORS.map((c) => (
                        <button 
                            key={c}
                            onClick={() => { setColor(c); triggerHaptic('light'); }}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-white/5">
                <button 
                    onClick={() => { setHideLevel(!hideLevel); triggerHaptic('light'); }}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 transition-colors border border-white/5"
                >
                    <div className="flex items-center gap-3 text-gray-300">
                        {hideLevel ? <EyeOff size={18} /> : <Eye size={18} />}
                        <span className="text-xs font-bold uppercase">{t('dossier.hide_level')}</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${hideLevel ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${hideLevel ? 'translate-x-5' : ''}`} />
                    </div>
                </button>

                <button 
                    onClick={toggleNotifications}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-black/20 hover:bg-black/40 transition-colors border border-white/5"
                >
                    <div className="flex items-center gap-3 text-gray-300">
                        {notifications ? <Bell size={18} /> : <BellOff size={18} />}
                        <div className="text-left">
                            <div className="text-xs font-bold uppercase">{t('dossier.notifications')}</div>
                            <div className="text-[9px] text-gray-500">{t('dossier.notifications_desc')}</div>
                        </div>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${notifications ? 'bg-green-600' : 'bg-gray-700'}`}>
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${notifications ? 'translate-x-5' : ''}`} />
                    </div>
                </button>
            </div>

            <button 
                onClick={() => { triggerHaptic('success'); onSave(name, icon, color, hideLevel, notifications); }}
                className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 mt-4"
            >
                <Save size={18} />
                {t('dossier.save_identity')}
            </button>
        </div>
    );
};

const BadgeSelector = ({ unlocked, equipped, onEquip, max = 3 }: { unlocked: string[], equipped: string[], onEquip: (badges: string[]) => void, max?: number }) => {
    const { t } = useTranslation();
    
    const handleToggle = (id: string) => {
        if (equipped.includes(id)) {
            triggerHaptic('light');
            onEquip(equipped.filter(b => b !== id));
        } else {
            if (equipped.length >= max) {
                triggerHaptic('error');
                return;
            }
            triggerHaptic('success');
            onEquip([...equipped, id]);
        }
    };

    return (
        <div className="p-6 h-full overflow-y-auto custom-scrollbar pb-20">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('dossier.badges_title')}</h3>
                <span className="text-[10px] font-mono text-cyan-500">{equipped.length}/{max}</span>
            </div>
            
            <div className="space-y-3">
                {Object.keys(BADGES).map(key => {
                    const isUnlocked = unlocked.includes(key);
                    const isEquipped = equipped.includes(key);
                    const badge = BADGES[key];

                    return (
                        <button 
                            key={key}
                            onClick={() => isUnlocked && handleToggle(key)}
                            disabled={!isUnlocked}
                            className={`w-full flex items-center gap-4 p-3 rounded-xl border text-left transition-all ${
                                isEquipped ? 'bg-cyan-950/30 border-cyan-500/50' : 
                                isUnlocked ? 'bg-white/5 border-white/10 hover:bg-white/10' : 
                                'bg-black/20 border-white/5 opacity-50 cursor-not-allowed'
                            }`}
                        >
                            {/* Icon Box */}
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0 ${
                                isEquipped ? 'bg-cyan-500/20 text-white shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 
                                'bg-black/30 text-gray-400'
                            }`}>
                                {badge.icon}
                            </div>

                            {/* Text Info */}
                            <div className="flex-1 min-w-0">
                                <div className={`text-sm font-bold uppercase tracking-wide flex items-center gap-2 ${
                                    isEquipped ? 'text-cyan-400' : isUnlocked ? 'text-gray-200' : 'text-gray-600'
                                }`}>
                                    {t(badge.translationKey)}
                                    {isEquipped && <CheckCircle2 size={14} className="text-cyan-400" />}
                                    {!isUnlocked && <Lock size={12} />}
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono leading-tight mt-1 truncate">
                                    {t(badge.translationKey + '_desc')}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
            <div className="mt-6 text-[10px] text-gray-600 font-mono text-center">
                {t('dossier.badges_max')}
            </div>
        </div>
    );
};

const AgentDossier: React.FC<AgentDossierProps> = ({ isOpen, onClose, onGameMasterToggle, isGameMasterMode = false }) => {
    const { t } = useTranslation();
    const [stats, setStats] = useState<AgentStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isPrimeModalOpen, setIsPrimeModalOpen] = useState(false);
    const [showXpRules, setShowXpRules] = useState(false);
    const [isBadgeSelectorOpen, setIsBadgeSelectorOpen] = useState(false);
    const [transferKey, setTransferKey] = useState<string | null>(null);
    const [isKeyGenerating, setIsKeyGenerating] = useState(false);
    
    // Profile State
    const [profile, setProfile] = useState(getUserProfile());

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setIsEditing(false); 
            setShowXpRules(false);
            setIsBadgeSelectorOpen(false);
            setTransferKey(null);
            
            fetchAgentStats()
                .then(({ stats }) => {
                    setStats(stats);
                    setLoading(false);
                })
                .catch(e => {
                    console.error("Dossier load failed", e);
                    setLoading(false); // Force stop loading even on error
                });
                
            setProfile(getUserProfile());
        }
    }, [isOpen]);

    const handleProfileSave = (name: string | null, icon: string, color: string, hideLevel: boolean, notifications: boolean) => {
        const newProfile = { ...profile, displayName: name, avatar: icon, color, hideLevel, notificationsEnabled: notifications };
        saveUserProfile(newProfile);
        setProfile(newProfile);
        setIsEditing(false);
        // Refresh stats to ensure any name dependencies update
        fetchAgentStats().then(({ stats }) => setStats(stats)).catch(() => {});
    };

    const handleGenerateKey = async () => {
        setIsKeyGenerating(true);
        try {
            const key = await generateTransferKey();
            setTransferKey(key);
            triggerHaptic('heavy');
        } catch (e) {
            alert("Error generating key. Try again.");
        } finally {
            setIsKeyGenerating(false);
        }
    };

    const handleCopyKey = () => {
        if (transferKey) {
            navigator.clipboard.writeText(transferKey);
            triggerHaptic('success');
            alert("Key copied to clipboard");
        }
    };

    const handleBadgesUpdate = (badges: string[]) => {
        const newProfile = { ...profile, equippedBadges: badges };
        saveUserProfile(newProfile);
        setProfile(newProfile);
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
                        {/* HEADER */}
                        <div className="p-6 pb-4 border-b border-white/10 relative">
                            <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20} /></button>
                            <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-cyan-400 mb-4">{t('dossier.title')}</h2>
                            
                            {/* ADMIN TOGGLE */}
                            {profile.isAdmin && !isEditing && (
                                <div className="mb-4 bg-red-950/30 border border-red-500/30 p-3 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-500/20 rounded text-red-400">
                                            <Package size={18} />
                                        </div>
                                        <div>
                                            <div className="text-xs font-black text-red-400 tracking-widest">GAME MASTER</div>
                                            <div className="text-[9px] text-red-300/70">Deploy Supply Drops</div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => onGameMasterToggle && onGameMasterToggle(!isGameMasterMode)}
                                        className={`px-3 py-1.5 rounded text-[10px] font-bold tracking-widest transition-colors ${isGameMasterMode ? 'bg-red-500 text-white' : 'bg-black/40 text-gray-500'}`}
                                    >
                                        {isGameMasterMode ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                            )}

                            {!isEditing && !isBadgeSelectorOpen && (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-cyan-950/30 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.2)]" style={{ color: profile.color }}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                                                    <path d={AVATAR_ICONS[profile.avatar] || AVATAR_ICONS['radar']} />
                                                </svg>
                                            </div>
                                            {profile.isPrime && (
                                                <div className="absolute -top-1 -right-1 bg-yellow-500 text-black p-1 rounded-full border border-black shadow-lg">
                                                    <Crown size={12} fill="black" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-white tracking-wide" style={{ color: profile.color }}>
                                                {profile.displayName || t('dossier.anonymous')}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-mono text-gray-400 border border-white/5">
                                                    {stats?.rankLevel ? `${t('dossier.ranks.' + stats.rankLevel)}` : 'UNKNOWN'}
                                                </div>
                                                {profile.streak > 1 && (
                                                    <div className="flex items-center gap-1 text-[10px] font-mono text-orange-400 font-bold bg-orange-950/30 px-2 py-0.5 rounded border border-orange-500/20">
                                                        <Calendar size={10} />
                                                        {profile.streak} {t('dossier.days')}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => { triggerHaptic('light'); setIsEditing(true); }}
                                        className="p-2 text-gray-500 hover:text-white bg-white/5 rounded-full hover:bg-white/10 transition-colors"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                </div>
                            )}

                            {/* LEVEL PROGRESS BAR */}
                            {!isEditing && !isBadgeSelectorOpen && stats && (
                                <div className="mt-6">
                                    <div className="flex justify-between text-[10px] font-mono text-gray-500 mb-1">
                                        <span>LVL {stats.rankLevel}</span>
                                        <div className="flex items-center gap-2">
                                            <span>{Math.floor(stats.xp)} / {stats.nextLevelXp} XP</span>
                                            <button onClick={() => setShowXpRules(!showXpRules)} className="text-cyan-500 hover:text-white transition-colors">
                                                <Info size={12} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${stats.progress * 100}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            className={`h-full ${profile.isPrime ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' : 'bg-gradient-to-r from-cyan-900 to-cyan-400'}`}
                                        />
                                    </div>
                                    
                                    <AnimatePresence>
                                        {showXpRules && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="mt-3 bg-black/40 p-3 rounded text-[10px] text-gray-400 font-mono border border-white/5 overflow-hidden"
                                            >
                                                <div className="font-bold text-gray-300 mb-1">{t('dossier.xp_info')}</div>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                    <div>{t('dossier.xp_post')}</div>
                                                    <div>{t('dossier.xp_reply')}</div>
                                                    <div>{t('dossier.xp_scan')}</div>
                                                    <div>{t('dossier.xp_vote')}</div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
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
                        ) : isBadgeSelectorOpen ? (
                            <>
                                <div className="px-6 pt-4 flex items-center gap-2">
                                    <button onClick={() => setIsBadgeSelectorOpen(false)} className="text-gray-500 hover:text-white">
                                        <ChevronRight size={20} className="rotate-180" />
                                    </button>
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('dossier.edit_badges')}</span>
                                </div>
                                <BadgeSelector 
                                    unlocked={profile.unlockedBadges || []}
                                    equipped={profile.equippedBadges || []}
                                    onEquip={handleBadgesUpdate}
                                />
                            </>
                        ) : (
                            <div className="p-6">
                                {/* STATS GRID */}
                                {loading ? (
                                    <div className="h-40 flex items-center justify-center text-cyan-500/50">
                                        <Loader2 className="animate-spin" size={32} />
                                    </div>
                                ) : stats ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-3 mb-6">
                                            <StatCard label={t('dossier.transmissions')} value={stats.totalTransmissions} icon={<Radio />} delay={1} />
                                            <StatCard label={t('dossier.impact')} value={stats.signalImpact} icon={<Activity />} delay={2} className="border-cyan-500/30 bg-cyan-900/10" />
                                            <StatCard label={t('dossier.replies')} value={stats.repliesReceived} icon={<MessageSquare />} delay={3} />
                                            <StatCard label={t('dossier.scans')} value={stats.newsScanned} icon={<Radar />} delay={4} />
                                        </div>

                                        {/* BADGE SHOWCASE */}
                                        <div className="mb-6">
                                            <div className="flex justify-between items-center mb-3">
                                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                    <Medal size={12} />
                                                    {t('dossier.badges_title')}
                                                </h3>
                                                <button 
                                                    onClick={() => { triggerHaptic('light'); setIsBadgeSelectorOpen(true); }}
                                                    className="text-[10px] text-cyan-500 hover:text-cyan-400 font-mono"
                                                >
                                                    {t('dossier.edit_badges')}
                                                </button>
                                            </div>
                                            <div className="flex gap-3 bg-white/5 p-3 rounded-xl border border-white/5 min-h-[60px] items-center">
                                                {profile.equippedBadges && profile.equippedBadges.length > 0 ? (
                                                    profile.equippedBadges.map(id => (
                                                        <div key={id} className="text-2xl filter drop-shadow-lg" title={BADGES[id]?.translationKey}>
                                                            {BADGES[id]?.icon}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <span className="text-[10px] text-gray-600 italic w-full text-center">No badges equipped</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* PRIME CTA */}
                                        {!profile.isPrime && (
                                            <button 
                                                onClick={() => setIsPrimeModalOpen(true)}
                                                className="w-full py-4 bg-gradient-to-r from-yellow-900/20 to-yellow-600/10 border border-yellow-500/30 rounded-xl text-yellow-500 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 mb-6 hover:bg-yellow-900/30 transition-all group"
                                            >
                                                <Crown size={14} className="group-hover:scale-110 transition-transform" />
                                                {t('dossier.btn_get_prime')}
                                            </button>
                                        )}

                                        {/* DEVICE TRANSFER */}
                                        <div className="border-t border-white/5 pt-6">
                                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('dossier.transfer_title')}</h3>
                                            
                                            {!transferKey ? (
                                                <button 
                                                    onClick={handleGenerateKey}
                                                    disabled={isKeyGenerating}
                                                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-300 font-mono text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                                >
                                                    {isKeyGenerating ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                                                    {t('dossier.generate_key')}
                                                </button>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="p-3 bg-red-900/20 border border-red-500/30 rounded flex items-start gap-2 text-red-400 text-[10px]">
                                                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                                        {t('dossier.key_warning')}
                                                    </div>
                                                    <div 
                                                        onClick={handleCopyKey}
                                                        className="p-4 bg-black border border-cyan-500/50 rounded-lg text-cyan-400 font-mono text-center font-bold tracking-widest text-lg cursor-pointer hover:bg-cyan-900/10 transition-colors relative group"
                                                    >
                                                        {transferKey}
                                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Copy size={16} />
                                                        </div>
                                                    </div>
                                                    <div className="text-center text-[10px] text-green-500 font-mono uppercase tracking-widest">
                                                        {t('dossier.key_generated')}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )}

                        <div className="p-4 bg-black/40 border-t border-white/5 text-[9px] text-gray-600 font-mono text-center uppercase tracking-widest">
                            {t('dossier.footer')}
                        </div>
                    </motion.div>
                </div>
            )}
            
            <PrimeModal 
                isOpen={isPrimeModalOpen} 
                onClose={() => setIsPrimeModalOpen(false)}
                onActivate={() => {
                    const newProfile = getUserProfile();
                    setProfile(newProfile); // Refresh UI immediately
                }}
            />
        </AnimatePresence>
    );
};

export default AgentDossier;