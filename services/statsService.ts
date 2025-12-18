import { supabase } from './supabaseClient';
import { getAnonymousID, getUserProfile, saveUserProfile } from './storageService';
import { AgentStats } from '../types';

const SCANS_KEY = 'kaiku_stats_scans';
const SCAN_HISTORY_KEY = 'kaiku_scan_history';
const COOLDOWN_MS = 60 * 60 * 1000; // 1 Hour

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

    const current = parseInt(localStorage.getItem(SCANS_KEY) || '0', 10);
    localStorage.setItem(SCANS_KEY, (current + 1).toString());
    
    return true; 
};

const getLocalScanCount = () => {
    return parseInt(localStorage.getItem(SCANS_KEY) || '0', 10);
};

// --- XP SYSTEM ---

const XP_RULES = {
    POST: 10,
    REPLY: 15,
    SCAN: 20,
    UPVOTE_RECEIVED: 5,
    REPLY_RECEIVED: 2,
    DAILY_LOGIN: 10,
    STREAK_BONUS_7: 100
};

const LEVELS = [
    { level: 1, min: 0, titleKey: '1' },
    { level: 2, min: 101, titleKey: '2' },
    { level: 3, min: 501, titleKey: '3' },
    { level: 4, min: 1501, titleKey: '4' }
];

export const calculateLevel = (xp: number) => {
    let current = LEVELS[0];
    let next = LEVELS[1];

    for (let i = 0; i < LEVELS.length; i++) {
        if (xp >= LEVELS[i].min) {
            current = LEVELS[i];
            next = LEVELS[i + 1] || null; 
        } else {
            break;
        }
    }

    // Calculate progress (0.0 - 1.0)
    let progress = 0;
    if (next) {
        progress = (xp - current.min) / (next.min - current.min);
    } else {
        progress = 1; // Max level
    }

    return {
        level: current.level,
        titleKey: current.titleKey,
        progress,
        nextLevelXp: next ? next.min : xp // Cap if max
    };
};

export const fetchAgentStats = async (): Promise<AgentStats> => {
    const sessionId = getAnonymousID();
    const profile = getUserProfile();

    // Fetch user's posts to calculate stats
    const { data: posts, error } = await supabase
        .from('kaiku_posts')
        .select('id, score, parent_post_id, city_name, replies:kaiku_posts!parent_post_id(count)')
        .eq('session_id', sessionId);

    if (error) {
        console.error("Stats fetch failed", error);
        return {
            id: sessionId,
            rankTitle: 'OFFLINE',
            rankLevel: 0,
            xp: 0,
            nextLevelXp: 100,
            progress: 0,
            totalTransmissions: 0,
            signalImpact: 0,
            repliesReceived: 0,
            sectorsActive: 0,
            newsScanned: getLocalScanCount()
        };
    }

    // 1. Calculate Raw Counts
    let postCount = 0;
    let replyCount = 0;
    let totalScore = 0;
    let repliesReceived = 0;
    const sectors = new Set<string>();

    posts.forEach((p: any) => {
        if (p.parent_post_id) {
            replyCount++;
        } else {
            postCount++;
        }
        
        totalScore += (p.score || 0);
        
        // Count replies received (Array of object due to Supabase join)
        const rCount = p.replies?.[0]?.count || 0;
        repliesReceived += rCount;

        if (p.city_name) sectors.add(p.city_name);
    });

    const scanCount = getLocalScanCount();

    // 2. Calculate XP
    const scoreXp = Math.max(0, totalScore * XP_RULES.UPVOTE_RECEIVED); 
    
    // Streak XP: Simplistic calculation (persisted in profile, added here for total)
    // NOTE: In a real backend, this would be a transaction log. Here we assume 'profile.streak' * constant roughly.
    // Ideally, we'd store a separate "bonusXp" field in profile.
    // For now, let's assume streak bonuses are stored in a local storage key to be safe.
    const bonusXp = parseInt(localStorage.getItem('kaiku_bonus_xp') || '0', 10);

    const xp = (postCount * XP_RULES.POST) + 
               (replyCount * XP_RULES.REPLY) + 
               (scanCount * XP_RULES.SCAN) + 
               scoreXp + 
               (repliesReceived * XP_RULES.REPLY_RECEIVED) + 
               bonusXp;

    // 3. Determine Level
    const levelData = calculateLevel(xp);

    return {
        id: sessionId,
        rankTitle: levelData.titleKey, 
        rankLevel: levelData.level,
        xp,
        nextLevelXp: levelData.nextLevelXp,
        progress: levelData.progress,
        totalTransmissions: postCount + replyCount,
        signalImpact: totalScore,
        repliesReceived,
        sectorsActive: sectors.size,
        newsScanned: scanCount
    };
};

// --- DAILY SUPPLY DROP ---

export interface DailyLoginResult {
    xpGained: number;
    newStreak: number;
    message?: string;
}

export const processDailyLogin = (): DailyLoginResult | null => {
    const profile = getUserProfile();
    const now = new Date();
    const lastLogin = new Date(profile.lastLogin);
    
    // Normalize to midnight for day comparison
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const lastLoginMidnight = new Date(lastLogin.getFullYear(), lastLogin.getMonth(), lastLogin.getDate()).getTime();
    
    const oneDay = 24 * 60 * 60 * 1000;
    
    // If logged in today, do nothing
    if (todayMidnight === lastLoginMidnight) {
        return null;
    }

    let newStreak = profile.streak;
    let xpGained = 0;
    let message = "Daily Uplink Established";

    // If logged in yesterday (diff is 1 day), increment
    if (todayMidnight - lastLoginMidnight === oneDay) {
        newStreak += 1;
        xpGained = XP_RULES.DAILY_LOGIN;
        
        // 7 Day Bonus
        if (newStreak % 7 === 0) {
            xpGained += XP_RULES.STREAK_BONUS_7;
            message = "WEEKLY STREAK BONUS!";
        }
    } else {
        // Streak broken
        newStreak = 1;
        xpGained = XP_RULES.DAILY_LOGIN;
        message = "Uplink Restored";
    }

    // Update Profile
    profile.lastLogin = now.getTime();
    profile.streak = newStreak;
    saveUserProfile(profile);

    // Persist Bonus XP (since we don't have a backend to store event logs)
    const currentBonus = parseInt(localStorage.getItem('kaiku_bonus_xp') || '0', 10);
    localStorage.setItem('kaiku_bonus_xp', (currentBonus + xpGained).toString());

    return { xpGained, newStreak, message };
};