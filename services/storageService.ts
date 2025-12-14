import { ChatMessage, RateLimitStatus } from '../types';
import { supabase } from './supabaseClient';
import { MAX_POSTS_PER_WINDOW, RATE_LIMIT_WINDOW_MS, BASE_LIFESPAN_MS, BOOST_EXTENSION_MS, SPAM_RATE_LIMIT_MS, PRIVACY_JITTER_DEG } from '../constants';
import { getCityName, moderateContent } from './moderationService';

const STORAGE_KEY = 'kaiku_local_data'; 
const USER_ID_KEY = 'kaiku_session_id'; 
const USER_VOTES_KEY = 'kaiku_user_votes';
const LAST_POST_TIMESTAMP_KEY = 'kaiku_last_post_ts';
const DELETED_IDS_KEY = 'kaiku_deleted_ids'; 

// --- SEED DATA ---

const SAMPLE_TEXTS = [
  "Signals are strong tonight. #kaiku",
  "Sector scan complete. Nothing found.",
  "Hearing strange echoes on this frequency.",
  "Connection stable. Broadcasting.",
  "Anyone else seeing this interference? #glitch"
];

const HUB_CITIES = [
  { name: "Helsinki", lat: 60.16, lng: 24.93, weight: 10, country: "FI" },
  { name: "New York", lat: 40.71, lng: -74.00, weight: 10, country: "US" },
  { name: "Tokyo", lat: 35.67, lng: 139.65, weight: 10, country: "JP" }
];

const extractTags = (text: string): string[] => {
    const regex = /#[\p{L}\p{N}_]+/gu;
    const matches = text.match(regex);
    return matches ? Array.from(new Set(matches)) : []; 
};

const processTags = (rawTags: string[] | null) => {
    const tags = rawTags || [];
    let preciseOrigin: { lat: number, lng: number } | undefined = undefined;
    const cleanTags: string[] = [];

    tags.forEach(tag => {
        if (tag.startsWith('__loc:')) {
            try {
                const parts = tag.substring(6).split(',');
                if (parts.length === 2) {
                    preciseOrigin = {
                        lat: parseFloat(parts[0]),
                        lng: parseFloat(parts[1])
                    };
                }
            } catch (e) {}
        } else {
            cleanTags.push(tag);
        }
    });

    return { tags: cleanTags, preciseOrigin };
};

const generateSeedData = (): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  let count = 0;
  const now = Date.now();

  HUB_CITIES.forEach(city => {
    for (let i = 0; i < city.weight; i++) {
      const latJitter = (Math.random() - 0.5) * 0.05; 
      const lngJitter = (Math.random() - 0.5) * 0.05;
      const text = SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)];
      const timestamp = now - Math.floor(Math.random() * (BASE_LIFESPAN_MS / 2));

      messages.push({
        id: `seed-msg-${count}`,
        text: text,
        timestamp: timestamp,
        expiresAt: timestamp + BASE_LIFESPAN_MS, // Default local expiry
        location: { lat: city.lat + latJitter, lng: city.lng + lngJitter },
        city: city.name,
        country: city.country,
        sessionId: `seed-user-${Math.floor(Math.random() * 100)}`,
        score: Math.floor(Math.random() * 5),
        replyCount: 0,
        isRemote: Math.random() > 0.8,
        originCountry: city.country,
        tags: extractTags(text)
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

export const getFlagUrl = (countryCode?: string) => {
  if (!countryCode) return null;
  return `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`;
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
  
  // Local Filter: Check expiresAt
  const now = Date.now();
  const valid = messages.filter((m: ChatMessage) => 
      !deleted.has(m.id) && m.expiresAt > now
  );
  
  return onlyRoot ? valid.filter((m: ChatMessage) => !m.parentId) : valid;
};

export const fetchMessages = async (onlyRoot: boolean = true): Promise<ChatMessage[]> => {
  const nowISO = new Date().toISOString();

  // SUPABASE QUERY: 
  // 1. Order by creation
  // 2. FILTER: expires_at > NOW (Server-side filtering!)
  let query = supabase
    .from('kaiku_posts')
    .select('*, replies:kaiku_posts!parent_post_id(count)')
    .gt('expires_at', nowISO) // <--- CRITICAL: Do not download dead messages
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
    const deleted = getDeletedIds();
    
    return data
        .filter((d: any) => !deleted.has(d.id))
        .map((d: any) => {
            const { tags, preciseOrigin } = processTags(d.tags);
            return {
                id: d.id,
                text: d.text,
                timestamp: new Date(d.created_at).getTime(),
                expiresAt: d.expires_at ? new Date(d.expires_at).getTime() : (Date.now() + BASE_LIFESPAN_MS),
                location: { lat: Number(d.latitude), lng: Number(d.longitude) }, 
                city: d.city_name,
                country: d.target_country,
                sessionId: d.session_id,
                score: d.score ?? 0,
                parentId: d.parent_post_id,
                replyCount: d.replies?.[0]?.count || 0,
                isRemote: d.is_remote,
                originCountry: d.origin_country,
                tags: tags,
                preciseOrigin: preciseOrigin 
            };
        });
  }
};

export const fetchReplies = async (parentId: string): Promise<ChatMessage[]> => {
    // Note: Replies might also expire, but usually we want to see them if the parent is alive.
    // For consistency, we filter replies by expiry too.
    const nowISO = new Date().toISOString();

    const { data, error } = await supabase
        .from('kaiku_posts')
        .select('*')
        .eq('parent_post_id', parentId)
        .gt('expires_at', nowISO) // Only fetch alive replies
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Fetch replies error:", error);
        return [];
    }

    const deleted = getDeletedIds();

    return data
        .filter((d: any) => !deleted.has(d.id))
        .map((d: any) => {
            const { tags, preciseOrigin } = processTags(d.tags);
            return {
                id: d.id,
                text: d.text,
                timestamp: new Date(d.created_at).getTime(),
                expiresAt: d.expires_at ? new Date(d.expires_at).getTime() : (Date.now() + BASE_LIFESPAN_MS),
                location: { lat: Number(d.latitude), lng: Number(d.longitude) },
                city: d.city_name,
                country: d.target_country,
                sessionId: d.session_id,
                score: d.score ?? 0,
                parentId: d.parent_post_id,
                isRemote: d.is_remote,
                originCountry: d.origin_country,
                tags: tags,
                preciseOrigin: preciseOrigin
            };
        });
};

export const saveMessage = async (
    text: string, 
    targetLat: number, 
    targetLng: number, 
    userLat: number, 
    userLng: number, 
    parentId?: string
): Promise<ChatMessage> => {
  // Rate Limit
  const lastPostTimeStr = localStorage.getItem(LAST_POST_TIMESTAMP_KEY);
  if (lastPostTimeStr) {
      const diff = Date.now() - parseInt(lastPostTimeStr, 10);
      if (diff < SPAM_RATE_LIMIT_MS) {
          throw new Error("You are sending messages too fast.");
      }
  }

  const userId = getAnonymousID();

  if (!moderateContent(text)) {
    throw new Error("Message blocked by moderation.");
  }

  const distKm = calculateDistance(userLat, userLng, targetLat, targetLng);
  const isRemote = distKm > 25; 
  
  const targetLocationData = await getCityName(targetLat, targetLng);
  
  let originCountry = "";
  if (isRemote) {
      const userLocationData = await getCityName(userLat, userLng);
      originCountry = (userLocationData.countryCode || "").toUpperCase();
  }
  
  // JITTER (Privacy)
  const jitter = (coord: number) => {
      const offset = (Math.random() - 0.5) * (PRIVACY_JITTER_DEG * 2); 
      return coord + offset;
  };

  const finalLat = jitter(targetLat);
  const finalLng = jitter(targetLng);
  const senderLatJitter = jitter(userLat);
  const senderLngJitter = jitter(userLng);
  
  const tags = extractTags(text);
  tags.push(`__loc:${senderLatJitter.toFixed(5)},${senderLngJitter.toFixed(5)}`);

  const now = Date.now();
  
  const newMessage: ChatMessage = {
    id: generateUUID(), 
    text,
    timestamp: now,
    expiresAt: now + BASE_LIFESPAN_MS, // Optimistic local update
    location: { lat: finalLat, lng: finalLng },
    city: targetLocationData.city,
    country: (targetLocationData.countryCode || "").toUpperCase(), 
    sessionId: userId,
    score: 0,
    parentId: parentId || null,
    replyCount: 0,
    isRemote: isRemote,
    originCountry: isRemote ? originCountry : undefined,
    tags: tags,
    preciseOrigin: { lat: senderLatJitter, lng: senderLngJitter }
  };

  // We don't send expires_at explicitly here; we let the DB Default (now() + 24h) handle it.
  const { error } = await supabase
      .from('kaiku_posts')
      .insert([{
          id: newMessage.id,
          text: newMessage.text,
          latitude: newMessage.location.lat,
          longitude: newMessage.location.lng,
          city_name: newMessage.city,
          target_country: newMessage.country,
          session_id: newMessage.sessionId,
          parent_post_id: newMessage.parentId,
          origin_country: newMessage.originCountry,
          is_remote: newMessage.isRemote,
          tags: newMessage.tags
      }]);

  if (error) {
      console.warn("Supabase insert failed, saving locally", error);
      const stored = localStorage.getItem(STORAGE_KEY);
      const messages = stored ? JSON.parse(stored) : [];
      messages.unshift(newMessage);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }
  
  localStorage.setItem(LAST_POST_TIMESTAMP_KEY, Date.now().toString());
  
  return newMessage;
};

export const deleteMessage = async (msgId: string) => {
    markAsDeleted(msgId);
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            let localData = JSON.parse(stored);
            localData = localData.filter((m: ChatMessage) => m.id !== msgId);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));
        }
    } catch (e) {}
};

// MODIFIED: BOOST (RPC CALL)
export const castVote = async (msgId: string, direction: 'up' | 'down') => {
    if (direction === 'down') return; 

    const votes = getUserVotes();
    votes[msgId] = 'up'; 
    localStorage.setItem(USER_VOTES_KEY, JSON.stringify(votes));
    
    // CALL THE SERVER-SIDE FUNCTION
    // This atomically increments score AND extends expires_at by 4 hours
    const { error } = await supabase.rpc('boost_message', { message_id: msgId });
    
    if (error) {
        console.error("Boost RPC failed:", error);
        // Fallback for local testing if RPC missing:
        // Note: This won't actually extend expiry on server without the RPC, just score
        const { data } = await supabase.from('kaiku_posts').select('score').eq('id', msgId).single();
        if (data) {
            await supabase.from('kaiku_posts').update({ score: (data.score || 0) + 1 }).eq('id', msgId);
        }
    } else {
        // Optimistically update local storage if needed (optional)
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const localData = JSON.parse(stored);
            const msg = localData.find((m: ChatMessage) => m.id === msgId);
            if (msg) {
                msg.score = (msg.score || 0) + 1;
                msg.expiresAt = (msg.expiresAt || Date.now()) + BOOST_EXTENSION_MS;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(localData));
            }
        }
    }
};

export const getRateLimitStatus = async (): Promise<RateLimitStatus> => {
    const lastPostTimeStr = localStorage.getItem(LAST_POST_TIMESTAMP_KEY);
    if (!lastPostTimeStr) return { isLimited: false, cooldownUntil: null };
    
    const diff = Date.now() - parseInt(lastPostTimeStr, 10);
    
    if (diff < SPAM_RATE_LIMIT_MS) {
        return { isLimited: true, cooldownUntil: parseInt(lastPostTimeStr, 10) + SPAM_RATE_LIMIT_MS };
    }
    return { isLimited: false, cooldownUntil: null };
};

export const subscribeToMessages = (callback: (payload: { type: string, message?: ChatMessage, id?: string }) => void) => {
    const subscription = supabase
        .channel('kaiku_public')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kaiku_posts' }, (payload) => {
            
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const d = payload.new;
                const { tags, preciseOrigin } = processTags(d.tags);

                const msg: ChatMessage = {
                    id: d.id,
                    text: d.text,
                    timestamp: new Date(d.created_at).getTime(),
                    expiresAt: d.expires_at ? new Date(d.expires_at).getTime() : (Date.now() + BASE_LIFESPAN_MS),
                    location: { lat: Number(d.latitude), lng: Number(d.longitude) },
                    city: d.city_name,
                    country: d.target_country,
                    sessionId: d.session_id,
                    score: d.score || 0,
                    parentId: d.parent_post_id,
                    isRemote: d.is_remote,
                    originCountry: d.origin_country,
                    tags: tags,
                    preciseOrigin: preciseOrigin 
                };
                
                // If update, we might just re-insert to refresh state in UI
                callback({ type: 'INSERT', message: msg });
            } else if (payload.eventType === 'DELETE') {
                callback({ type: 'DELETE', id: payload.old.id });
            }
        })
        .subscribe();

    return subscription;
};