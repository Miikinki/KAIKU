import { supabase } from './supabaseClient';
import { getAnonymousID, getUserProfile, saveUserProfile } from './storageService';
import { AgentStats, UserProfile } from '../types';

const SCANS_KEY = 'kaiku_stats_scans';
const SCAN_HISTORY_KEY = 'kaiku_scan_history';
const COOLDOWN_MS = 60 * 60 * 1000; // 1 Hour

// --- MANUAL ADMIN TOOL ---
if (typeof window !== 'undefined') {
    (window as any).kaikuAdmin = {
        grantBadge: (badgeId: string) => grantBadge(badgeId)
    };
}

// Helper to calculate level curve (Matches SQL function)
export const calculateLevel = (xp: number) => {
    // Formula: Level = FLOOR(SQRT(xp / 100)) + 1
    const level = Math.floor(Math.sqrt(Math.max(xp, 0) / 100)) + 1;
    
    // Calculate progress to next level
    // Next Level XP = (Level)^2 * 100
    const currentLevelBaseXp = Math.pow(level - 1, 2) * 100;
    const nextLevelBaseXp = Math.pow(level, 2) * 100;
    const progress = (xp - currentLevelBaseXp) / (nextLevelBaseXp - currentLevelBaseXp);

    return {
        level,
        titleKey: level.toString(), // Simplified title key for now
        progress: Math.min(Math.max(progress, 0), 1),
        nextLevelXp: nextLevelBaseXp
    };
};

export const awardXp = async (amount: number, actionType: 'scan' | 'vote' | 'misc') => {
    const sessionId = getAnonymousID();
    
    try {
        const { error } = await supabase.rpc('award_xp', {
            user_session_id: sessionId,
            xp_amount: amount,
            action_type: actionType
        });
        
        if (error) console.error("XP Award Failed:", error);
    } catch (e) {
        console.error("XP Award Exception:", e);
    }
};

export const incrementScanCount = (city: string = "Global"): boolean => {
    const now = Date.now();
    let history: Record<string, number> = {};
    try {
        const stored = localStorage.getItem(SCAN_HISTORY_KEY);
        if (stored) history = JSON.parse(stored);
    } catch(e) {
        console.warn("Failed to parse scan history", e);
    }

    const cityKey = city.trim().toLowerCase();
    const lastScan = history[cityKey];

    if (lastScan && (now - lastScan < COOLDOWN_MS)) {
        return false; 
    }

    history[cityKey] = now;
    localStorage.setItem(SCAN_HISTORY_KEY, JSON.stringify(history));

    // Update Local Counter
    const current = parseInt(localStorage.getItem(SCANS_KEY) || '0', 10);
    localStorage.setItem(SCANS_KEY, (current + 1).toString());
    
    // AWARD DB XP (+50 XP for Scan)
    awardXp(50, 'scan');
    
    return true; 
};

/**
 * CORE LOGIC: checkAndUnlockBadges
 */
const checkAndUnlockBadges = (stats: AgentStats, profile: UserProfile): string[] => {
    const unlockedSet = new Set(profile.unlockedBadges || []);
    const newlyUnlocked: string[] = [];

    const check = (badgeId: string, condition: boolean) => {
        if (condition && !unlockedSet.has(badgeId)) {
            unlockedSet.add(badgeId);
            newlyUnlocked.push(badgeId);
        }
    };

    check('founder', true); 
    check('prime', profile.isPrime);
    check('influencer', stats.signalImpact >= 1000); // Need to decide if Impact tracks persisting votes or active
    check('scout', stats.newsScanned >= 50);
    check('veteran', stats.totalTransmissions >= 500);

    if (newlyUnlocked.length > 0) {
        const newProfile = { ...profile, unlockedBadges: Array.from(unlockedSet) };
        saveUserProfile(newProfile);
    }

    return newlyUnlocked;
};

export const grantBadge = (badgeId: string): boolean => {
    const profile = getUserProfile();
    const unlockedSet = new Set(profile.unlockedBadges || []);

    if (unlockedSet.has(badgeId)) return false;

    unlockedSet.add(badgeId);
    const newProfile = { ...profile, unlockedBadges: Array.from(unlockedSet) };
    saveUserProfile(newProfile);
    return true;
};

/**
 * Fetch stats from PERSISTENT DB COLUMNS.
 */
export const fetchAgentStats = async (): Promise<{ stats: AgentStats, newBadges: string[] }> => {
    const sessionId = getAnonymousID();
    const profile = getUserProfile();

    // 1. Fetch Persistent Stats from Identity Table
    const { data: identityData, error: identityError } = await supabase
        .from('kaiku_identities')
        .select('total_xp, stats_messages_sent, stats_news_scanned, stats_signals_boosted')
        .eq('session_id', sessionId)
        .single();

    // 2. Fetch Active Impact (Sum of score of currently alive posts)
    // NOTE: Impact is dynamic based on current reputation, so we still calculate this live.
    const { data: activePosts } = await supabase
        .from('kaiku_posts')
        .select('score')
        .eq('session_id', sessionId);

    let currentImpact = 0;
    if (activePosts) {
        currentImpact = activePosts.reduce((sum, p) => sum + (p.score || 0), 0);
    }

    // Default values if no identity exists yet
    const dbXp = identityData?.total_xp || 0;
    const dbMessages = identityData?.stats_messages_sent || 0;
    const dbScans = identityData?.stats_news_scanned || 0;
    
    // Calculate Level based on Persistent XP
    const levelData = calculateLevel(dbXp);

    const calculatedStats: AgentStats = {
        id: sessionId,
        rankTitle: levelData.titleKey, 
        rankLevel: levelData.level,
        xp: dbXp,
        nextLevelXp: levelData.nextLevelXp,
        progress: levelData.progress,
        totalTransmissions: dbMessages,
        signalImpact: currentImpact, // Still dynamic
        repliesReceived: 0, // Deprecated or needs new column
        sectorsActive: 1, // Placeholder
        newsScanned: dbScans
    };

    // 4. Check Badges
    const newBadges = checkAndUnlockBadges(calculatedStats, profile);

    return { stats: calculatedStats, newBadges };
};

export const processDailyLogin = (): { xpGained: number, newStreak: number, message: string } | null => {
    const profile = getUserProfile();
    const now = new Date();
    const lastLogin = new Date(profile.lastLogin);
    
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const lastLoginMidnight = new Date(lastLogin.getFullYear(), lastLogin.getMonth(), lastLogin.getDate()).getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (todayMidnight === lastLoginMidnight) return null;

    let newStreak = profile.streak;
    let xpGained = 0;
    let message = "Daily Uplink Established";

    if (todayMidnight - lastLoginMidnight === oneDay) {
        newStreak += 1;
        xpGained = 10;
        if (newStreak % 7 === 0) {
            xpGained += 100;
            message = "WEEKLY STREAK BONUS!";
        }
    } else {
        newStreak = 1;
        xpGained = 10;
        message = "Uplink Restored";
    }

    profile.lastLogin = now.getTime();
    profile.streak = newStreak;
    saveUserProfile(profile);

    // Award Persistent XP for Login
    awardXp(xpGained, 'misc');

    return { xpGained, newStreak, message };
};