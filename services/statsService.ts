import { supabase } from './supabaseClient';
import { getAnonymousID } from './storageService';
import { AgentStats } from '../types';

const SCANS_KEY = 'kaiku_stats_scans';

export const incrementScanCount = () => {
    const current = parseInt(localStorage.getItem(SCANS_KEY) || '0', 10);
    localStorage.setItem(SCANS_KEY, (current + 1).toString());
};

const getLocalScanCount = () => {
    return parseInt(localStorage.getItem(SCANS_KEY) || '0', 10);
};

const calculateRank = (transmissions: number, impact: number) => {
    // Simple XP formula: Transmissions * 10 + Impact * 5
    const xp = (transmissions * 10) + (impact * 5);
    
    if (xp < 50) return { level: 1, title: 'OBSERVER', next: 50 };
    if (xp < 200) return { level: 2, title: 'SCOUT', next: 200 };
    if (xp < 500) return { level: 3, title: 'OPERATOR', next: 500 };
    if (xp < 1000) return { level: 4, title: 'BROADCASTER', next: 1000 };
    return { level: 5, title: 'NODE COMMANDER', next: 2500 };
};

export const fetchAgentStats = async (): Promise<AgentStats> => {
    const sessionId = getAnonymousID();

    // 1. Fetch User's Posts from Supabase (to count and sum score)
    // We fetch basic info to calculate client side to avoid complex RPC for now
    const { data: posts, error } = await supabase
        .from('kaiku_posts')
        .select('id, score, city_name, replies:kaiku_posts!parent_post_id(count)')
        .eq('session_id', sessionId);

    if (error) {
        console.error("Stats fetch failed", error);
        // Fallback to empty stats
        return {
            id: sessionId,
            rankTitle: 'OFFLINE',
            rankLevel: 0,
            progress: 0,
            totalTransmissions: 0,
            signalImpact: 0,
            repliesReceived: 0,
            sectorsActive: 0,
            newsScanned: getLocalScanCount()
        };
    }

    const totalTransmissions = posts.length;
    
    // Sum scores
    const signalImpact = posts.reduce((acc, curr) => acc + (curr.score || 0), 0);
    
    // Sum replies (Supabase returns count as an object array due to join)
    const repliesReceived = posts.reduce((acc, curr) => {
        const countObj = curr.replies as unknown as { count: number }[];
        return acc + (countObj?.[0]?.count || 0);
    }, 0);

    // Unique cities
    const sectors = new Set(posts.map(p => p.city_name).filter(Boolean));

    const rank = calculateRank(totalTransmissions, signalImpact);
    
    // Calculate progress to next level
    // Previous threshold logic needed for accurate progress bar
    const prevThreshold = rank.level === 1 ? 0 : 
                          rank.level === 2 ? 50 :
                          rank.level === 3 ? 200 :
                          rank.level === 4 ? 500 : 1000;
                          
    const xp = (totalTransmissions * 10) + (signalImpact * 5);
    const progress = Math.min(1, Math.max(0, (xp - prevThreshold) / (rank.next - prevThreshold)));

    return {
        id: sessionId,
        rankTitle: rank.title,
        rankLevel: rank.level,
        progress,
        totalTransmissions,
        signalImpact,
        repliesReceived,
        sectorsActive: sectors.size,
        newsScanned: getLocalScanCount()
    };
};