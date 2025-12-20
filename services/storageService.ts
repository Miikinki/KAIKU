import { ChatMessage, RateLimitStatus, UserProfile, LootDrop } from '../types';
import { supabase } from './supabaseClient';
import { MAX_POSTS_PER_WINDOW, RATE_LIMIT_WINDOW_MS, BASE_LIFESPAN_MS, BOOST_EXTENSION_MS, SPAM_RATE_LIMIT_MS, THEME_COLOR } from '../constants';
import { getCityName, moderateContent } from './moderationService';
import { RealtimeChannel } from '@supabase/supabase-js';
import { fetchAgentStats, awardXp } from './statsService'; // Import awardXp

export const STORAGE_KEY = 'kaiku_local_data'; 
export const USER_ID_KEY = 'kaiku_session_id'; 
export const USER_PROFILE_KEY = 'kaiku_user_profile';
export const USER_VOTES_KEY = 'kaiku_user_votes';
export const LAST_POST_TIMESTAMP_KEY = 'kaiku_last_post_ts';
export const DELETED_IDS_KEY = 'kaiku_deleted_ids'; 
export const HIDDEN_IDS_KEY = 'kaiku_hidden_ids';

// ... (Existing constants and seed data helpers remain unchanged) ...

const SEED_MESSAGES: ChatMessage[] = []; 

// --- UTILS ---

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const getAnonymousID = (): string => {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
};

// Helper for Identity Restoration
export const restoreSession = (sessionId: string, profile: UserProfile | null) => {
    localStorage.setItem(USER_ID_KEY, sessionId);
    if (profile) {
        localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
    }
    // Clear local cache to force refresh with new identity
    localStorage.removeItem(STORAGE_KEY);
    // Reload page to apply changes cleanly
    window.location.reload();
};

const extractTags = (text: string) => {
    const regex = /#[\p{L}\p{N}_]+/gu;
    const matches = text.match(regex);
    return matches ? Array.from(new Set(matches)) : [];
};

// --- PROFILE MANAGEMENT ---

export const getUserProfile = (): UserProfile => {
    try {
        const stored = localStorage.getItem(USER_PROFILE_KEY);
        if (stored) {
            const profile = JSON.parse(stored);
            if (!profile.unlockedBadges) profile.unlockedBadges = ['founder'];
            if (!profile.equippedBadges) profile.equippedBadges = [];
            if (profile.isAdmin === undefined) profile.isAdmin = false; 
            return profile;
        }
    } catch (e) {}
    
    return {
        displayName: null,
        avatar: 'radar',
        color: THEME_COLOR,
        hideLevel: false,
        isPrime: false,
        isAdmin: false, 
        streak: 0,
        lastLogin: Date.now(),
        notificationsEnabled: false,
        unlockedBadges: ['founder'], 
        equippedBadges: []
    };
};

export const saveUserProfile = (profile: UserProfile) => {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
};

// --- ADMIN & LOOT DROP SERVICES ---

export const fetchLootDrops = async (): Promise<LootDrop[]> => {
    const { data, error } = await supabase
        .from('kaiku_loot_drops')
        .select('*')
        .is('claimed_by', null); 

    if (error || !data) return [];

    return data.map((d: any) => {
        let lat = 0, lng = 0;
        if (d.location && typeof d.location === 'string') {
             const matches = d.location.match(/POINT\(([-0-9\.]+) ([-0-9\.]+)\)/);
             if (matches) {
                 lng = parseFloat(matches[1]);
                 lat = parseFloat(matches[2]);
             }
        }

        return {
            id: d.id,
            lat,
            lng,
            message: d.message,
            rewardCode: undefined, 
            claimedBy: d.claimed_by,
            createdAt: new Date(d.created_at).getTime()
        };
    });
};

export const deployLootDrop = async (lat: number, lng: number, message: string, rewardCode: string) => {
    const sessionId = getAnonymousID();
    const profile = getUserProfile();
    if (!profile.isAdmin) throw new Error("Unauthorized");

    const point = `POINT(${lng} ${lat})`;

    const { error } = await supabase
        .from('kaiku_loot_drops')
        .insert({
            location: point,
            message,
            reward_code: rewardCode
        });

    if (error) throw new Error(error.message);
};

export const claimLootDrop = async (dropId: string, userLat: number, userLng: number): Promise<string> => {
    const sessionId = getAnonymousID();
    
    const { data: drop, error: fetchError } = await supabase
        .from('kaiku_loot_drops')
        .select('*')
        .eq('id', dropId)
        .single();
        
    if (fetchError || !drop) throw new Error("Drop not found");
    if (drop.claimed_by) throw new Error("Already claimed");

    let dropLat = 0, dropLng = 0;
    const matches = drop.location.match(/POINT\(([-0-9\.]+) ([-0-9\.]+)\)/);
    if (matches) {
         dropLng = parseFloat(matches[1]);
         dropLat = parseFloat(matches[2]);
    }

    const distKm = calculateDistance(userLat, userLng, dropLat, dropLng);
    if (distKm > 0.1) { 
        throw new Error(`Too far away! Get closer (${Math.round(distKm * 1000)}m)`);
    }

    const { data, error: updateError } = await supabase
        .from('kaiku_loot_drops')
        .update({ claimed_by: sessionId })
        .eq('id', dropId)
        .is('claimed_by', null)
        .select('reward_code')
        .single();

    if (updateError || !data) throw new Error("Claim failed. Someone might have beaten you.");
    
    return data.reward_code;
};

export const getFlagUrl = (countryCode?: string) => {
  if (!countryCode) return null;
  return `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`;
};

export const getFlagEmoji = (countryCode?: string) => {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char =>  127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

export const getDeletedIds = (): Set<string> => {
    try {
        const stored = localStorage.getItem(DELETED_IDS_KEY);
        return new Set(stored ? JSON.parse(stored) : []);
    } catch (e) {
        return new Set();
    }
};

const markAsDeleted = (id: string) => {
    const deleted = getDeletedIds();
    deleted.add(id);
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(deleted)));
};

export const getUserVotes = (): Record<string, 'up' | 'down'> => {
    const stored = localStorage.getItem(USER_VOTES_KEY);
    return stored ? JSON.parse(stored) : {};
};

export const getHiddenIds = (): Set<string> => {
    try {
        const stored = localStorage.getItem(HIDDEN_IDS_KEY);
        return new Set(stored ? JSON.parse(stored) : []);
    } catch (e) {
        return new Set();
    }
};

export const toggleHiddenMessage = (id: string): Set<string> => {
    const hidden = getHiddenIds();
    if (hidden.has(id)) {
        hidden.delete(id);
    } else {
        hidden.add(id);
    }
    localStorage.setItem(HIDDEN_IDS_KEY, JSON.stringify(Array.from(hidden)));
    return hidden;
};

export const canSendImages = (): boolean => {
    return true;
};

export const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${generateUUID()}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;
    const { error: uploadError } = await supabase.storage.from('chat-images').upload(filePath, file);
    if (uploadError) throw new Error(uploadError.message);
    const { data } = supabase.storage.from('chat-images').getPublicUrl(filePath);
    return data.publicUrl;
};

// --- CORE MESSAGING LOGIC ---

export const fetchMessages = async (onlyRoot: boolean = true): Promise<ChatMessage[]> => {
    let query = supabase
        .from('kaiku_posts')
        .select('*')
        .order('created_at', { ascending: false });

    // FILTER: Only Root Messages (No Replies) - CRITICAL for Map Accuracy
    if (onlyRoot) {
        query = query.is('parent_post_id', null);
    }
    
    // FILTER: STRICT FRESHNESS (Last 48 Hours)
    const cutOffTime = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
    query = query.gt('created_at', cutOffTime);
    
    // LIMIT: Apply limit AFTER filters to ensure we get a full set of root messages
    query = query.limit(50);

    const { data, error } = await query;
    if (error) throw error;
    if (!data) return [];

    return data.map((row: any) => ({
        id: row.id,
        text: row.text,
        timestamp: new Date(row.created_at).getTime(),
        expiresAt: new Date(row.expires_at).getTime(),
        location: { lat: row.latitude, lng: row.longitude },
        city: row.city_name || "Unknown",
        country: row.target_country,
        sessionId: row.session_id,
        score: row.score || 0,
        parentId: row.parent_post_id,
        isRemote: row.is_remote,
        originCountry: row.origin_country,
        tags: row.tags || [],
        postType: row.post_type || 'USER',
        eventMetadata: row.event_metadata || {},
        isMasked: false, 
        
        // Identity
        userDisplayName: row.user_display_name,
        userAvatar: row.user_avatar,
        userColor: row.user_color,
        userLevel: row.user_level,
        userBadges: row.user_badges,
        hideLevel: row.hide_level,
        isPrime: row.is_prime,
        imageUrl: row.image_url,
        replyCount: 0 
    }));
};

export const fetchReplies = async (parentId: string): Promise<ChatMessage[]> => {
    const { data, error } = await supabase
        .from('kaiku_posts')
        .select('*')
        .eq('parent_post_id', parentId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    
    return (data || []).map((row: any) => ({
        id: row.id,
        text: row.text,
        timestamp: new Date(row.created_at).getTime(),
        expiresAt: new Date(row.expires_at).getTime(),
        location: { lat: row.latitude, lng: row.longitude },
        city: row.city_name || "Unknown",
        country: row.target_country,
        sessionId: row.session_id,
        score: row.score || 0,
        parentId: row.parent_post_id,
        isRemote: row.is_remote,
        originCountry: row.origin_country,
        tags: row.tags || [],
        postType: 'USER',
        userDisplayName: row.user_display_name,
        userAvatar: row.user_avatar,
        userColor: row.user_color,
        userLevel: row.user_level,
        userBadges: row.user_badges,
        hideLevel: row.hide_level,
        isPrime: row.is_prime,
        imageUrl: row.image_url
    }));
};

export const saveMessage = async (
    text: string, 
    lat: number, 
    lng: number, 
    realLat: number, 
    realLng: number, 
    parentId?: string,
    imageUrl?: string,
    isMasked: boolean = true
): Promise<any> => {
    const sessionId = getAnonymousID();
    const profile = getUserProfile();
    const stats = await fetchAgentStats(); // get current level
    const userLevel = stats.stats.rankLevel;
    
    const cityName = await getCityName(lat, lng);
    
    // Jitter for mask
    let finalLat = lat;
    let finalLng = lng;
    if (isMasked) {
        finalLat = lat + (Math.random() - 0.5) * 0.01;
        finalLng = lng + (Math.random() - 0.5) * 0.01;
    }
    
    const hashtags = extractTags(text);

    const row = {
        text: text,
        latitude: finalLat,
        longitude: finalLng,
        city_name: cityName.city,
        target_country: cityName.countryCode,
        session_id: sessionId,
        parent_post_id: parentId || null,
        origin_country: cityName.countryCode, 
        is_remote: false,
        image_url: imageUrl,
        
        user_display_name: profile.displayName,
        user_avatar: profile.avatar,
        user_color: profile.color,
        user_level: userLevel,
        user_badges: profile.equippedBadges, 
        hide_level: profile.hideLevel,
        is_prime: profile.isPrime,
        
        score: 0,
        post_type: 'USER',
        tags: hashtags 
    };

    const { data, error } = await supabase
        .from('kaiku_posts')
        .insert(row)
        .select()
        .single();

    if (error) throw new Error(error.message);
    
    localStorage.setItem(LAST_POST_TIMESTAMP_KEY, Date.now().toString());
    
    return data;
};

export const deleteMessage = async (id: string, parentId?: string) => {
    const sessionId = getAnonymousID();
    const { error } = await supabase
        .from('kaiku_posts')
        .delete()
        .eq('id', id)
        .eq('session_id', sessionId);

    if (error) throw new Error("Delete failed");
    markAsDeleted(id);
};

export const castVote = async (id: string, dir: string) => {
    const val = dir === 'up' ? 1 : -1;
    
    // Store locally to prevent UI spam
    const votes = getUserVotes();
    const currentVote = votes[id]; 
    
    if (currentVote === dir) return;
    
    votes[id] = dir as 'up' | 'down';
    localStorage.setItem(USER_VOTES_KEY, JSON.stringify(votes));

    // 1. Update Post Score (Server)
    const { error } = await supabase.rpc('vote_post', { 
        post_id: id, 
        increment: val 
    });
    
    if (error) console.warn("Vote RPC failed", error);

    // 2. Award persistent XP for engagement (+5 XP)
    // Only awarding for Upvotes to prevent spamming downvotes for XP
    if (dir === 'up') {
        awardXp(5, 'vote');
    }
};

export const getRateLimitStatus = async (): Promise<RateLimitStatus> => {
    const lastPost = parseInt(localStorage.getItem(LAST_POST_TIMESTAMP_KEY) || '0', 10);
    const now = Date.now();
    const diff = now - lastPost;
    
    if (diff < SPAM_RATE_LIMIT_MS) {
        return { isLimited: true, cooldownUntil: lastPost + SPAM_RATE_LIMIT_MS };
    }
    return { isLimited: false, cooldownUntil: null };
};

export const getLocalMessages = (onlyRoot: boolean = true): ChatMessage[] => {
    return [];
};

export const subscribeToMessages = (callback: (payload: { type: string, message?: ChatMessage, id: string }) => void) => {
    const channel = supabase
        .channel('public:kaiku_posts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kaiku_posts' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                const row = payload.new;
                const msg: ChatMessage = {
                    id: row.id,
                    text: row.text,
                    timestamp: new Date(row.created_at).getTime(),
                    expiresAt: new Date(row.expires_at).getTime(),
                    location: { lat: row.latitude, lng: row.longitude },
                    city: row.city_name || "Unknown",
                    country: row.target_country,
                    sessionId: row.session_id,
                    score: row.score || 0,
                    parentId: row.parent_post_id,
                    isRemote: row.is_remote,
                    originCountry: row.origin_country,
                    tags: row.tags || [],
                    postType: row.post_type || 'USER',
                    userDisplayName: row.user_display_name,
                    userAvatar: row.user_avatar,
                    userColor: row.user_color,
                    userLevel: row.user_level,
                    userBadges: row.user_badges,
                    hideLevel: row.hide_level,
                    isPrime: row.is_prime,
                    imageUrl: row.image_url,
                    eventMetadata: row.event_metadata || {}
                };
                callback({ type: 'INSERT', message: msg, id: row.id });
            } else if (payload.eventType === 'DELETE') {
                callback({ type: 'DELETE', id: payload.old.id });
            } else if (payload.eventType === 'UPDATE') {
                const row = payload.new;
                const msg: ChatMessage = {
                     id: row.id,
                     text: row.text,
                     timestamp: new Date(row.created_at).getTime(),
                     expiresAt: new Date(row.expires_at).getTime(),
                     location: { lat: row.latitude, lng: row.longitude },
                     city: row.city_name,
                     country: row.target_country,
                     sessionId: row.session_id,
                     score: row.score,
                     parentId: row.parent_post_id,
                     tags: row.tags,
                     isRemote: row.is_remote,
                     originCountry: row.origin_country,
                     userLevel: row.user_level, 
                     userBadges: row.user_badges,
                     imageUrl: row.image_url,
                     eventMetadata: row.event_metadata || {}
                };
                callback({ type: 'UPDATE', message: msg, id: row.id });
            }
        })
        .subscribe();

    return {
        unsubscribe: () => supabase.removeChannel(channel)
    };
};