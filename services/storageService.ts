import { ChatMessage, RateLimitStatus } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { MAX_POSTS_PER_WINDOW, RATE_LIMIT_WINDOW_MS, MESSAGE_LIFESPAN_MS, SCORE_THRESHOLD_HIDE } from '../constants';
import { getCityName, moderateContent } from './moderationService';

const STORAGE_KEY = 'global_local_talk_data';
const USER_ID_KEY = 'global_local_talk_user_id';
const USER_VOTES_KEY = 'global_local_talk_user_votes';

// --- MASSIVE SEED DATA GENERATOR (For Local Mode) ---

const SAMPLE_TEXTS = [
  "Traffic is completely stopped here.",
  "Did anyone else see those lights in the sky?",
  "Quiet night in the city.",
  "Police activity near the main station.",
  "Just found a lost drone.",
  "The fog is getting really thick.",
  "Anyone want to meet up?",
  "Hearing sirens everywhere.",
  "Internet is down in the whole sector.",
  "Beautiful sunset tonight.",
  "Construction noise is unbearable.",
  "Is the bridge open?",
  "Signals are weird tonight."
];

const HUB_CITIES = [
  { name: "Porvoo", lat: 60.39, lng: 25.66, weight: 15 },
  { name: "Helsinki", lat: 60.16, lng: 24.93, weight: 10 },
  { name: "New York", lat: 40.71, lng: -74.00, weight: 12 },
  { name: "London", lat: 51.50, lng: -0.12, weight: 8 },
  { name: "Tokyo", lat: 35.67, lng: 139.65, weight: 10 }
];

const generateSeedData = (): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  let count = 0;

  HUB_CITIES.forEach(city => {
    for (let i = 0; i < city.weight; i++) {
      const latJitter = (Math.random() - 0.5) * 0.1;
      const lngJitter = (Math.random() - 0.5) * 0.1;
      const maxAge = MESSAGE_LIFESPAN_MS - 10000;
      const timeOffset = Math.floor(Math.random() * maxAge);
      const parentId = `seed-msg-${count}`;

      messages.push({
        id: parentId,
        text: SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)],
        timestamp: Date.now() - timeOffset,
        location: { 
          lat: city.lat + latJitter, 
          lng: city.lng + lngJitter 
        },
        city: city.name,
        sessionId: `seed-user-${Math.floor(Math.random() * 100)}`,
        score: Math.floor(Math.random() * 10) - 2,
        replyCount: Math.random() > 0.7 ? Math.floor(Math.random() * 5) : 0
      });
      count++;
    }
  });

  return messages.sort((a, b) => b.timestamp - a.timestamp);
};

const SEED_MESSAGES: ChatMessage[] = generateSeedData();

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

export const getRandomLocation = () => {
  const lat = (Math.random() * 130) - 60;
  const lng = (Math.random() * 360) - 180;
  return { lat, lng };
};

export const applyFuzzyLogic = (lat: number, lng: number) => {
  const JITTER = 0.1; // ~10km
  return {
    lat: lat + (Math.random() - 0.5) * JITTER,
    lng: lng + (Math.random() - 0.5) * JITTER
  };
};

// --- DATA ACCESS ---

/**
 * Fetch messages. 
 * If using Supabase, it queries the 'kaiku_posts' table.
 * It relies on Row Level Security (RLS) to enforce the 48h lifespan and -5 score.
 */
export const fetchMessages = async (onlyRoot: boolean = true): Promise<ChatMessage[]> => {
  if (isSupabaseConfigured() && supabase) {
    console.log("KAIKU: Fetching messages from Supabase...");
    // Supabase Fetch from 'kaiku_posts'
    // NOTE: We do NOT manually filter by created_at or score here.
    // The RLS policy handles that.
    let query = supabase
      .from('kaiku_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500); // Increased limit to ensure recent posts are seen

    if (onlyRoot) {
        query = query.is('parent_post_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase fetch error:', error);
      return getLocalMessages(onlyRoot);
    } else {
      console.log(`KAIKU: Successfully fetched ${data?.length || 0} messages.`);
      return data.map((d: any) => ({
        id: d.id,
        text: d.text,
        timestamp: new Date(d.created_at).getTime(), // Convert ISO to numeric
        location: { lat: Number(d.latitude), lng: Number(d.longitude) }, // Explicit Number cast
        city: d.city_name,
        sessionId: d.session_id,
        score: d.score ?? 0,
        parentId: d.parent_post_id,
        replyCount: 0 
      }));
    }
  } else {
    return getLocalMessages(onlyRoot);
  }
};

export const fetchReplies = async (parentId: string): Promise<ChatMessage[]> => {
    if (isSupabaseConfigured() && supabase) {
        // Rely on RLS for filtering (lifespan/score)
        const { data, error } = await supabase
            .from('kaiku_posts')
            .select('*')
            .eq('parent_post_id', parentId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error("Fetch replies error:", error);
            return [];
        }
        return data.map((d: any) => ({
            id: d.id,
            text: d.text,
            timestamp: new Date(d.created_at).getTime(),
            location: { lat: Number(d.latitude), lng: Number(d.longitude) },
            city: d.city_name,
            sessionId: d.session_id,
            score: d.score ?? 0,
            parentId: d.parent_post_id
        }));
    } else {
        const cutoff = Date.now() - MESSAGE_LIFESPAN_MS;
        const all = getLocalMessages(false);
        return all
            .filter(m => m.parentId === parentId && m.timestamp > cutoff && m.score > SCORE_THRESHOLD_HIDE)
            .sort((a, b) => a.timestamp - b.timestamp);
    }
};

const getLocalMessages = (onlyRoot: boolean = true): ChatMessage[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_MESSAGES));
    return onlyRoot ? SEED_MESSAGES.filter(m => !m.parentId) : SEED_MESSAGES;
  }
  const parsed: ChatMessage[] = JSON.parse(stored);
  const cutoff = Date.now() - MESSAGE_LIFESPAN_MS;
  // Apply filtering locally
  const valid = parsed.filter(m => m.timestamp > cutoff && m.score > SCORE_THRESHOLD_HIDE);
  
  return onlyRoot ? valid.filter(m => !m.parentId) : valid;
};

export const saveMessage = async (text: string, lat: number, lng: number, parentId?: string): Promise<ChatMessage> => {
  const userId = getAnonymousID();

  // 1. Moderate
  if (!moderateContent(text)) {
    throw new Error("Message blocked by automated moderation.");
  }

  // 2. Reverse Geocode
  const city = await getCityName(lat, lng);

  const newMessage: ChatMessage = {
    id: generateUUID(),
    text,
    timestamp: Date.now(),
    location: { lat, lng },
    city,
    sessionId: userId,
    score: 0,
    parentId: parentId || null
  };

  // 3. Save
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase
      .from('kaiku_posts')
      .insert([{
        // Explicitly passing ID to match local optimisitic update
        id: newMessage.id,
        text: newMessage.text,
        latitude: newMessage.location.lat,
        longitude: newMessage.location.lng,
        city_name: newMessage.city,
        session_id: newMessage.sessionId,
        parent_post_id: newMessage.parentId,
        score: 0
      }]);
    
    if (error) {
      console.error("Supabase Save Error", error);
      saveLocalMessage(newMessage); // Fallback
    }
  } else {
    saveLocalMessage(newMessage);
  }

  return newMessage;
};

const saveLocalMessage = (msg: ChatMessage) => {
  const current = getLocalMessages(false);
  const cutoff = Date.now() - MESSAGE_LIFESPAN_MS;
  const filtered = current.filter(m => m.timestamp > cutoff && m.score > SCORE_THRESHOLD_HIDE);
  const updated = [msg, ...filtered];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

// --- VOTING SYSTEM ---

export const getUserVotes = (): Record<string, 'up' | 'down'> => {
  const stored = localStorage.getItem(USER_VOTES_KEY);
  return stored ? JSON.parse(stored) : {};
};

export const castVote = async (msgId: string, direction: 'up' | 'down'): Promise<ChatMessage | null> => {
  const userVotes = getUserVotes();
  const previousVote = userVotes[msgId];
  let scoreDelta = 0;

  if (previousVote === direction) {
    delete userVotes[msgId];
    scoreDelta = direction === 'up' ? -1 : 1;
  } else if (previousVote) {
    userVotes[msgId] = direction;
    scoreDelta = direction === 'up' ? 2 : -2;
  } else {
    userVotes[msgId] = direction;
    scoreDelta = direction === 'up' ? 1 : -1;
  }

  localStorage.setItem(USER_VOTES_KEY, JSON.stringify(userVotes));

  let updatedMessage: ChatMessage | null = null;

  if (isSupabaseConfigured() && supabase) {
    // Fetch current score first to be safe
    const { data } = await supabase.from('kaiku_posts').select('score').eq('id', msgId).single();
    if (data) {
      const newScore = (data.score || 0) + scoreDelta;
      await supabase.from('kaiku_posts').update({ score: newScore }).eq('id', msgId);
      // Return optimistic updated message struct if needed, though UI usually handles it
    }
  } 
  
  // Local Fallback / Optimistic Logic
  const local = getLocalMessages(false);
  const index = local.findIndex(m => m.id === msgId);
  if (index !== -1) {
    local[index].score += scoreDelta;
    updatedMessage = local[index];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  }

  return updatedMessage;
};

// --- RATE LIMIT ---

export const getRateLimitStatus = async (): Promise<RateLimitStatus> => {
  const userId = getAnonymousID();
  const cutoffTime = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const cutoffTs = Date.now() - RATE_LIMIT_WINDOW_MS;
  
  let recentPostsCount = 0;
  let lastPostTime = 0;

  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from('kaiku_posts')
      .select('created_at')
      .eq('session_id', userId)
      .gt('created_at', cutoffTime);
      
    if (data) {
      recentPostsCount = data.length;
      if (data.length > 0) {
          lastPostTime = new Date(data[data.length-1].created_at).getTime();
      }
    }
  } else {
    const local = getLocalMessages(false);
    const userPosts = local.filter(m => m.sessionId === userId && m.timestamp > cutoffTs);
    recentPostsCount = userPosts.length;
    if (userPosts.length > 0) {
        lastPostTime = Math.max(...userPosts.map(m => m.timestamp));
    }
  }

  if (recentPostsCount >= MAX_POSTS_PER_WINDOW) {
    return {
      isLimited: true,
      cooldownUntil: lastPostTime + RATE_LIMIT_WINDOW_MS
    };
  }
  return { isLimited: false, cooldownUntil: null };
};

export const subscribeToMessages = (callback: (msg: ChatMessage) => void) => {
  if (isSupabaseConfigured() && supabase) {
    console.log("KAIKU: Initializing Realtime Subscription...");
    return supabase
      .channel('public:kaiku_posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kaiku_posts' }, (payload) => {
        console.log("KAIKU: Realtime INSERT received", payload);
        const d = payload.new;
        if (!d || !d.created_at) return;

        callback({
          id: d.id,
          text: d.text,
          timestamp: new Date(d.created_at).getTime(),
          location: { lat: Number(d.latitude), lng: Number(d.longitude) }, // Ensure number type
          city: d.city_name,
          sessionId: d.session_id,
          score: d.score ?? 0,
          parentId: d.parent_post_id
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kaiku_posts' }, (payload) => {
        // Handle updates (votes)
        console.log("KAIKU: Realtime UPDATE received", payload);
        const d = payload.new;
        if (!d) return;
        callback({
            id: d.id,
            text: d.text,
            timestamp: new Date(d.created_at).getTime(),
            location: { lat: Number(d.latitude), lng: Number(d.longitude) }, // Ensure number type
            city: d.city_name,
            sessionId: d.session_id,
            score: d.score ?? 0,
            parentId: d.parent_post_id
        });
      })
      .subscribe((status) => {
        console.log("KAIKU: Subscription Status:", status);
      });
  }
  return null;
};

export const clearLocalData = () => {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_VOTES_KEY);
};