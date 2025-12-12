import { ChatMessage, RateLimitStatus } from '../types';
import { supabase } from './supabaseClient';
import { MAX_POSTS_PER_WINDOW, RATE_LIMIT_WINDOW_MS, MESSAGE_LIFESPAN_MS, SCORE_THRESHOLD_HIDE, SPAM_RATE_LIMIT_MS } from '../constants';
import { getCityName, moderateContent } from './moderationService';

const STORAGE_KEY = 'global_local_talk_data';
const USER_ID_KEY = 'kaiku_session_id'; 
const USER_VOTES_KEY = 'global_local_talk_user_votes';
const LAST_POST_TIMESTAMP_KEY = 'kaiku_last_post_ts';
const DELETED_IDS_KEY = 'kaiku_deleted_ids'; // NEW: Persistent Local Blocklist

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
        replyCount: Math.random() > 0.7 ? Math.floor(Math.random() * 5) : 0,
        isRemote: Math.random() > 0.9 // Randomly mark some seeds as remote
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

export const getFlagEmoji = (countryCode?: string) => {
  if (!countryCode) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char =>  127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// Haversine formula to calculate distance between two points in km
export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

export const getRandomLocation = () => {
  const lat = (Math.random() * 130) - 60;
  const lng = (Math.random() * 360) - 180;
  return { lat, lng };
};

export const applyFuzzyLogic = (lat: number, lng: number) => {
  // FIXED STATIC JITTER for Privacy (~0.025 deg is approx 2.5km)
  const JITTER = 0.025; 
  return {
    lat: lat + (Math.random() - 0.5) * JITTER,
    lng: lng + (Math.random() - 0.5) * JITTER
  };
};

const getDeletedIds = (): Set<string> => {
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

// --- DATA ACCESS ---

export const getLocalMessages = (onlyRoot: boolean = true): ChatMessage[] => {
  const deleted = getDeletedIds();
  const stored = localStorage.getItem(STORAGE_KEY);
  
  let messages = stored ? JSON.parse(stored) : SEED_MESSAGES;
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_MESSAGES));
  }
  
  const cutoff = Date.now() - MESSAGE_LIFESPAN_MS;
  const valid = messages.filter((m: ChatMessage) => 
      m.timestamp > cutoff && 
      m.score > SCORE_THRESHOLD_HIDE &&
      !deleted.has(m.id) // Filter deleted
  );
  
  return onlyRoot ? valid.filter((m: ChatMessage) => !m.parentId) : valid;
};

export const fetchMessages = async (onlyRoot: boolean = true): Promise<ChatMessage[]> => {
  // Supabase Fetch
  let query = supabase
    .from('kaiku_posts')
    .select('*, replies:kaiku_posts!parent_post_id(count)')
    .order('created_at', { ascending: false })
    .limit(500); 

  if (onlyRoot) {
      query = query.is('parent_post_id', null);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('KAIKU: Supabase fetch error (offline?), using local.', error);
    return getLocalMessages(onlyRoot);
  } else {
    // Merge with Local Deletions
    const deleted = getDeletedIds();
    
    return data
        .filter((d: any) => !deleted.has(d.id)) // CRITICAL: Filter out deleted messages
        .map((d: any) => ({
            id: d.id,
            text: d.text,
            timestamp: new Date(d.created_at).getTime(),
            location: { lat: Number(d.latitude), lng: Number(d.longitude) }, // Explicit Number cast
            city: d.city_name,
            sessionId: d.session_id,
            score: d.score ?? 0,
            parentId: d.parent_post_id,
            replyCount: d.replies?.[0]?.count || 0,
            isRemote: d.is_remote,
            originCountry: d.origin_country
        }));
  }
};

export const fetchReplies = async (parentId: string): Promise<ChatMessage[]> => {
    const { data, error } = await supabase
        .from('kaiku_posts')
        .select('*')
        .eq('parent_post_id', parentId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Fetch replies error:", error);
        return [];
    }

    const deleted = getDeletedIds();

    return data
        .filter((d: any) => !deleted.has(d.id))
        .map((d: any) => ({
            id: d.id,
            text: d.text,
            timestamp: new Date(d.created_at).getTime(),
            location: { lat: Number(d.latitude), lng: Number(d.longitude) },
            city: d.city_name,
            sessionId: d.session_id,
            score: d.score ?? 0,
            parentId: d.parent_post_id,
            isRemote: d.is_remote,
            originCountry: d.origin_country
        }));
};

export const saveMessage = async (text: string, lat: number, lng: number, parentId?: string): Promise<ChatMessage> => {
  // 1. RATE LIMIT CHECK
  const lastPostTimeStr = localStorage.getItem(LAST_POST_TIMESTAMP_KEY);
  if (lastPostTimeStr) {
      const lastPostTime = parseInt(lastPostTimeStr, 10);
      const diff = Date.now() - lastPostTime;
      if (diff < SPAM_RATE_LIMIT_MS) {
          throw new Error("You are sending messages too fast. Please wait a moment.");
      }
  }

  const userId = getAnonymousID();

  if (!moderateContent(text)) {
    throw new Error("Message blocked by automated moderation.");
  }

  const locationData = await getCityName(lat, lng);
  
  const newMessage: ChatMessage = {
    id: generateUUID(), // Generate local ID first, might be replaced by DB
    text,
    timestamp: Date.now(),
    location: applyFuzzyLogic(lat, lng),
    city: locationData.city,
    sessionId: userId,
    score: 0,
    parentId: parentId || null,
    replyCount: 0,
    isRemote: false,
    originCountry: locationData.countryCode
  };

  // Supabase Insert
  const { data, error } = await supabase
      .from('kaiku_posts')
      .insert([{
          id: newMessage.id, // Explicitly send UUID so we match
          text: newMessage.text,
          latitude: newMessage.location.lat,
          longitude: newMessage.location.lng,
          city_name: newMessage.city,
          session_id: newMessage.sessionId,
          parent_post_id: newMessage.parentId,
          origin_country: newMessage.originCountry
      }])
      .select();

  if (error) {
      console.warn("Supabase insert failed, saving locally", error);
      // Local fallback save
      const stored = localStorage.getItem(STORAGE_KEY);
      const messages = stored ? JSON.parse(stored) : [];
      messages.unshift(newMessage);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }
  
  // Update timestamps for rate limiting
  localStorage.setItem(LAST_POST_TIMESTAMP_KEY, Date.now().toString());
  
  return newMessage;
};

export const deleteMessage = async (msgId: string) => {
    // 1. Mark as deleted locally (Blocklist) - This ensures it disappears for the user immediately
    markAsDeleted(msgId);

    // 2. Try Supabase Delete
    try {
        const { error } = await supabase
            .from('kaiku_posts')
            .delete()
            .eq('id', msgId);
            
        if (error) {
            console.warn("Supabase delete failed (permission/network), keeping local block.", error);
        }
    } catch (err) {
        console.warn("Supabase delete exception", err);
    }
    
    // 3. Remove from Local Storage fallback if it exists there
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        let localData = JSON.parse(stored);
        localData = localData.filter((m: ChatMessage) => m.id !== msgId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));
    }
};

export const castVote = async (msgId: string, direction: 'up' | 'down') => {
    // Save to local state
    const votes = getUserVotes();
    votes[msgId] = direction;
    localStorage.setItem(USER_VOTES_KEY, JSON.stringify(votes));
    
    // RPC Call to Supabase (assuming a stored procedure exists, or just client side update for now)
    // For simplicity/permissions, we might just rely on local state or simple update if allowed.
    // Ideally: await supabase.rpc('vote_message', { message_id: msgId, value: direction === 'up' ? 1 : -1 });
    
    // For now, we attempt a direct increment if RLS allows, otherwise it's just local
    // (Real implementation would require a separate votes table or RPC)
};

export const getRateLimitStatus = async (): Promise<RateLimitStatus> => {
    const lastPostTimeStr = localStorage.getItem(LAST_POST_TIMESTAMP_KEY);
    if (!lastPostTimeStr) return { isLimited: false, cooldownUntil: null };
    
    const lastPostTime = parseInt(lastPostTimeStr, 10);
    const diff = Date.now() - lastPostTime;
    
    if (diff < SPAM_RATE_LIMIT_MS) {
        return { isLimited: true, cooldownUntil: lastPostTime + SPAM_RATE_LIMIT_MS };
    }
    return { isLimited: false, cooldownUntil: null };
};

export const subscribeToMessages = (callback: (payload: { type: string, message?: ChatMessage, id?: string }) => void) => {
    const subscription = supabase
        .channel('kaiku_public')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kaiku_posts' }, (payload) => {
            
            if (payload.eventType === 'INSERT') {
                const d = payload.new;
                const msg: ChatMessage = {
                    id: d.id,
                    text: d.text,
                    timestamp: new Date(d.created_at).getTime(),
                    location: { lat: Number(d.latitude), lng: Number(d.longitude) },
                    city: d.city_name,
                    sessionId: d.session_id,
                    score: d.score || 0,
                    parentId: d.parent_post_id,
                    isRemote: d.is_remote,
                    originCountry: d.origin_country
                };
                callback({ type: 'INSERT', message: msg });
            } else if (payload.eventType === 'DELETE') {
                callback({ type: 'DELETE', id: payload.old.id });
            }
        })
        .subscribe();

    return subscription;
};