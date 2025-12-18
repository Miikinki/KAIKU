import { ChatMessage, RateLimitStatus, UserProfile } from '../types';
import { supabase } from './supabaseClient';
import { MAX_POSTS_PER_WINDOW, RATE_LIMIT_WINDOW_MS, BASE_LIFESPAN_MS, BOOST_EXTENSION_MS, SPAM_RATE_LIMIT_MS, THEME_COLOR } from '../constants';
import { getCityName, moderateContent } from './moderationService';
import { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = 'kaiku_local_data'; 
const USER_ID_KEY = 'kaiku_session_id'; 
const USER_PROFILE_KEY = 'kaiku_user_profile';
const USER_VOTES_KEY = 'kaiku_user_votes';
const LAST_POST_TIMESTAMP_KEY = 'kaiku_last_post_ts';
const DELETED_IDS_KEY = 'kaiku_deleted_ids'; 
const HIDDEN_IDS_KEY = 'kaiku_hidden_ids';

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
    let isMasked = false;
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
        } else if (tag === '__masked') {
            isMasked = true;
        } else {
            cleanTags.push(tag);
        }
    });

    return { tags: cleanTags, preciseOrigin, isMasked };
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
        tags: extractTags(text),
        isMasked: Math.random() > 0.5,
        postType: 'USER'
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

// --- PROFILE MANAGEMENT ---

export const getUserProfile = (): UserProfile => {
    try {
        const stored = localStorage.getItem(USER_PROFILE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {}
    
    return {
        displayName: null,
        avatar: 'radar',
        color: THEME_COLOR
    };
};

export const saveUserProfile = (profile: UserProfile) => {
    localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
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

// --- HIDING MESSAGES (VISIBILITY TOGGLE) ---

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

// --- IMAGE UPLOAD SERVICE ---

export const canSendImages = (): boolean => {
    return true;
};

export const uploadImage = async (file: File): Promise<string> => {
    if (!canSendImages()) throw new Error("Image upload is currently restricted.");
    
    if (!file.type.startsWith('image/')) throw new Error("Only image files are allowed.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Image size must be under 5MB.");

    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${generateUUID()}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (uploadError) {
        console.error("Supabase Upload Error:", uploadError);
        throw new Error(uploadError.message || "Failed to upload image. Please try again.");
    }

    const { data } = supabase.storage.from('chat-images').getPublicUrl(filePath);
    return data.publicUrl;
};

// --- PRESENCE SERVICE (TYPING INDICATOR) ---

export interface PresenceState {
    user: string;
    isTyping: boolean;
    lat: number;
    lng: number;
    lastActive: number;
}

let presenceChannel: RealtimeChannel | null = null;

export const subscribeToPresence = (
    currentLocation: { lat: number, lng: number } | null,
    onStateChange: (others: PresenceState[]) => void
) => {
    const myId = getAnonymousID();

    if (presenceChannel) {
        presenceChannel.unsubscribe();
    }

    presenceChannel = supabase.channel('kaiku_presence', {
        config: {
            presence: {
                key: myId,
            },
        },
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel!.presenceState() as Record<string, PresenceState[]>;
            const others: PresenceState[] = [];
            
            Object.keys(state).forEach(key => {
                if (key !== myId) {
                    const userState = state[key][0];
                    if (userState && userState.isTyping) {
                        others.push(userState);
                    }
                }
            });
            onStateChange(others);
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                // Initial track
            }
        });

    return {
        setTyping: async (isTyping: boolean, loc?: { lat: number, lng: number }) => {
            if (!presenceChannel) return;
            await presenceChannel.track({
                user: myId,
                isTyping,
                lat: loc ? loc.lat : 0,
                lng: loc ? loc.lng : 0,
                lastActive: Date.now()
            });
        },
        unsubscribe: () => {
            if (presenceChannel) presenceChannel.unsubscribe();
            presenceChannel = null;
        }
    };
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

const mapRowToMessage = (d: any): ChatMessage => {
    const { tags, preciseOrigin, isMasked } = processTags(d.tags);
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
        preciseOrigin: preciseOrigin,
        imageUrl: d.image_url,
        isMasked: isMasked,
        postType: d.post_type || 'USER', 
        eventMetadata: d.event_metadata || {}, 
        
        userDisplayName: d.user_display_name,
        userAvatar: d.user_avatar,
        userColor: d.user_color
    };
};

export const fetchMessages = async (onlyRoot: boolean = true): Promise<ChatMessage[]> => {
  const nowISO = new Date().toISOString();
  const deleted = getDeletedIds();
  const localMessages = getLocalMessages(onlyRoot);

  let remoteMessages: ChatMessage[] = [];

  try {
      let query = supabase
        .from('kaiku_posts')
        .select('*, replies:kaiku_posts!parent_post_id(count)')
        .gt('expires_at', nowISO)
        .order('created_at', { ascending: false })
        .limit(500); 

      if (onlyRoot) {
          query = query.is('parent_post_id', null);
      }

      const { data, error } = await query;
      
      if (!error && data) {
          remoteMessages = data
              .filter((d: any) => !deleted.has(d.id))
              .map(mapRowToMessage);
      } else if (error) {
          console.warn("Supabase fetch failed (using local only)", error);
      }
  } catch (e) {
      console.warn("Network error during fetch (using local only)");
  }
  
  const remoteIdSet = new Set(remoteMessages.map(m => m.id));
  const uniqueLocals = localMessages.filter(m => !remoteIdSet.has(m.id));
  
  const combined = [...remoteMessages, ...uniqueLocals].sort((a, b) => b.timestamp - a.timestamp);
  
  return combined;
};

export const fetchReplies = async (parentId: string): Promise<ChatMessage[]> => {
    const nowISO = new Date().toISOString();
    const deleted = getDeletedIds();
    const allLocal = getLocalMessages(false);
    const localReplies = allLocal.filter(m => m.parentId === parentId);

    let remoteReplies: ChatMessage[] = [];

    try {
        const { data, error } = await supabase
            .from('kaiku_posts')
            .select('*')
            .eq('parent_post_id', parentId)
            .gt('expires_at', nowISO) 
            .order('created_at', { ascending: true });

        if (!error && data) {
            remoteReplies = data
                .filter((d: any) => !deleted.has(d.id))
                .map(mapRowToMessage);
        }
    } catch (e) {
        console.warn("Error fetching replies");
    }

    const remoteIdSet = new Set(remoteReplies.map(m => m.id));
    const uniqueLocals = localReplies.filter(m => !remoteIdSet.has(m.id));

    return [...remoteReplies, ...uniqueLocals].sort((a, b) => a.timestamp - b.timestamp);
};

export const saveMessage = async (
    text: string, 
    targetLat: number, 
    targetLng: number, 
    userLat: number, 
    userLng: number, 
    parentId?: string,
    imageUrl?: string,
    useSignalMasking: boolean = false
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
  const profile = getUserProfile();

  if (!moderateContent(text)) {
    throw new Error("Message blocked by moderation.");
  }

  const distKm = calculateDistance(userLat, userLng, targetLat, targetLng);
  // NEW: Increased remote threshold from 25km to 50km
  const isRemote = distKm > 50; 
  
  const targetLocationData = await getCityName(targetLat, targetLng);
  
  let originCountry = "";
  if (isRemote) {
      const userLocationData = await getCityName(userLat, userLng);
      originCountry = (userLocationData.countryCode || "").toUpperCase();
  }
  
  const applyMask = (coord: number) => {
      const offset = (Math.random() - 0.5) * 0.01;
      return coord + offset;
  };

  let finalLat = targetLat;
  let finalLng = targetLng;
  let finalSenderLat = userLat;
  let finalSenderLng = userLng;

  if (useSignalMasking) {
      finalLat = applyMask(targetLat);
      finalLng = applyMask(targetLng);
      finalSenderLat = applyMask(userLat);
      finalSenderLng = applyMask(userLng);
  }

  const tags = extractTags(text);
  tags.push(`__loc:${finalSenderLat.toFixed(5)},${finalSenderLng.toFixed(5)}`);
  
  if (useSignalMasking) {
      tags.push('__masked');
  }

  const now = Date.now();
  
  const newMessage: ChatMessage = {
    id: generateUUID(), 
    text,
    timestamp: now,
    expiresAt: now + BASE_LIFESPAN_MS, 
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
    preciseOrigin: { lat: finalSenderLat, lng: finalSenderLng },
    imageUrl: imageUrl,
    isMasked: useSignalMasking,
    postType: 'USER', 
    userDisplayName: profile.displayName || undefined,
    userAvatar: profile.avatar,
    userColor: profile.color
  };

  // 1. SAVE LOCALLY FIRST (Optimistic UI)
  try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const messages = stored ? JSON.parse(stored) : [];
      messages.unshift(newMessage);
      if (messages.length > 100) messages.length = 100; 
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      localStorage.setItem(LAST_POST_TIMESTAMP_KEY, Date.now().toString());
  } catch (localError) {
      console.error("Local save failed", localError);
  }

  // 2. ATTEMPT REMOTE SYNC
  supabase
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
          tags: newMessage.tags,
          image_url: newMessage.imageUrl,
          post_type: 'USER', 
          user_display_name: newMessage.userDisplayName, 
          user_avatar: newMessage.userAvatar,
          user_color: newMessage.userColor,
          event_metadata: {},
      }])
      .then(({ error }) => {
          if (error) {
              // DETAILED LOGGING FOR DEBUGGING
              console.error("CRITICAL: Cloud sync failed. Likely missing columns in Supabase.");
              console.error("Error Code:", error.code);
              console.error("Error Message:", error.message);
              console.error("Details:", error.details);
              console.error("Hint:", error.hint);
          }
      });
  
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

export const castVote = async (msgId: string, direction: 'up' | 'down') => {
    if (direction === 'down') return; 

    const votes = getUserVotes();
    votes[msgId] = 'up'; 
    localStorage.setItem(USER_VOTES_KEY, JSON.stringify(votes));
    
    // Optimistically update local storage
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

    // Attempt RPC
    const { error } = await supabase.rpc('boost_message', { message_id: msgId });
    if (error) {
        console.warn("Boost RPC failed, local update only.");
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
                const msg = mapRowToMessage(d); // Use helper
                callback({ type: 'INSERT', message: msg });
            } else if (payload.eventType === 'DELETE') {
                callback({ type: 'DELETE', id: payload.old.id });
            }
        })
        .subscribe();

    return subscription;
};