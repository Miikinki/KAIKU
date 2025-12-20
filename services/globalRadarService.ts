import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from '../types';
import { generateUUID } from './storageService';
import { supabase } from './supabaseClient';
import { getEnvVar } from './env';

// SHARED WORLD SETTINGS
const NEWS_TTL_HOURS = 12;
const NEWS_TTL_MS = NEWS_TTL_HOURS * 60 * 60 * 1000;
const RADAR_MODEL = 'gemini-3-flash-preview';

// CACHE (API Cost Optimization)
const API_CACHE_DURATION_MS = 60 * 60 * 1000; 

const cleanJsonString = (text: string): string => {
  let cleaned = text.replace(/```json\n?|```/g, '').trim();
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  
  if (firstBracket !== -1 && lastBracket !== -1) {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  }
  return cleaned;
};

const applyStrongJitter = (coord: number) => {
    return coord + (Math.random() - 0.5) * 0.02;
};

// --- DB HELPERS ---

const normalizeCacheKey = (query?: string, lat?: number, lng?: number): string => {
    if (query) return `news:${query.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    if (lat && lng) return `news:${lat.toFixed(1)}_${lng.toFixed(1)}`;
    return 'news:global';
};

const checkApiCache = async (key: string): Promise<ChatMessage[] | null> => {
    try {
        const { data, error } = await supabase
            .from('kaiku_news_cache')
            .select('*')
            .eq('location_key', key)
            .gt('expires_at', new Date().toISOString()) 
            .maybeSingle(); 

        if (error || !data) return null;
        return data.data as ChatMessage[];
    } catch (e) {
        return null;
    }
};

const saveToApiCache = async (key: string, messages: ChatMessage[]) => {
    try {
        const expiresAt = new Date(Date.now() + API_CACHE_DURATION_MS).toISOString();
        await supabase
            .from('kaiku_news_cache')
            .upsert({ location_key: key, data: messages, expires_at: expiresAt });
    } catch (e) {
        console.warn("Cache save failed", e);
    }
};

// --- MOCK DATA ---
const generateMockEvents = (targetLat?: number, targetLng?: number): ChatMessage[] => {
    const now = Date.now();
    return [
        {
            id: `mock-${now}-1`,
            text: "SYSTEM ALERT: Signal interference detected.\n\nUnable to fetch news from the grid. Try moving to a different sector.",
            timestamp: now,
            expiresAt: now + NEWS_TTL_MS,
            location: { lat: targetLat || 60.1699, lng: targetLng || 24.9384 },
            city: "Unknown Sector",
            country: "XX",
            sessionId: "SYSTEM",
            score: -5,
            replyCount: 0,
            isRemote: true,
            originCountry: "XX",
            tags: ["#SYSTEM", "#ERROR"],
            postType: 'GLOBAL_EVENT',
            isMasked: false,
            eventMetadata: {}
        }
    ];
};

export const scanGlobalNetwork = async (specificQuery?: string, isTargeted?: boolean, centerLat?: number, centerLng?: number): Promise<ChatMessage[]> => {
  const cacheKey = normalizeCacheKey(specificQuery, centerLat, centerLng);
  
  // 1. API CACHE CHECK
  const cachedRawEvents = await checkApiCache(cacheKey);
  if (cachedRawEvents) {
      const freshPosts = rehydrateEvents(cachedRawEvents, centerLat, centerLng);
      // We don't save to DB on cache hit to prevent spamming duplicates
      return freshPosts;
  }

  // 2. GENERATE NEW CONTENT
  const apiKey = getEnvVar('GOOGLE_API_KEY');
  
  if (!apiKey || apiKey.length < 5 || apiKey.includes("REPLACE_WITH")) {
      return generateMockEvents(centerLat, centerLng);
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let prompt = "";
  let contextInstruction = "";

  if (specificQuery) {
      prompt = `Today is ${today}. Find 5 BREAKING news stories related to "${specificQuery}". If "${specificQuery}" is a place, find news near there. Return JSON.`;
  } else if (centerLat && centerLng) {
      prompt = `Today is ${today}. Find 5 BREAKING local news stories happening near coordinates ${centerLat}, ${centerLng}. Return strictly JSON.`;
      contextInstruction = `Focus on local events near Lat: ${centerLat}, Lng: ${centerLng}.`;
  } else {
      prompt = `Today is ${today}. Find 5 major global BREAKING news stories happening RIGHT NOW. Return strictly JSON.`;
  }

  const SYSTEM_PROMPT = `
  You are KAIKU_SCANNER.
  Current Date: ${today}.
  ${contextInstruction}
  
  Your task: Return a JSON array of 5 news objects.
  CRITICAL: ONLY return news from the last 48 hours.
  Format: JSON ONLY. No markdown.
  
  Schema per object: 
  { 
    "headline": "Short title", 
    "content": "2-3 sentence summary", 
    "lat": 0.0, 
    "lng": 0.0, 
    "city_name": "City", 
    "country_code": "ISO 2-letter code", 
    "source_url": "URL if available",
    "language": "ISO 2-letter code"
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model: RADAR_MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });

    const rawEvents = processResponse(response.text, centerLat, centerLng);
    
    if (rawEvents.length === 0) {
        throw new Error("Grounded scan returned 0 events.");
    }

    await saveToApiCache(cacheKey, rawEvents);
    await saveToDatabase(rawEvents);
    
    return rawEvents;

  } catch (error: any) {
    console.warn("KAIKU: Grounded Scan failed.", error);
    if (!specificQuery && !centerLat) return generateMockEvents(centerLat, centerLng);
    return [];
  }
};

const processResponse = (rawText: string | undefined, fallbackLat?: number, fallbackLng?: number): ChatMessage[] => {
    if (!rawText) return [];
    const jsonText = cleanJsonString(rawText);
    let events = [];
    try { events = JSON.parse(jsonText); } catch (e) { return []; }
    if (!Array.isArray(events)) return [];

    return rehydrateEvents(events, fallbackLat, fallbackLng);
}

const rehydrateEvents = (events: any[], fallbackLat?: number, fallbackLng?: number): ChatMessage[] => {
    const now = Date.now();
    const expiry = now + NEWS_TTL_MS; 

    return events.map((evt: any) => {
        // COORDINATE SAFETY LOGIC
        // If AI returns 0,0 or undefined, FORCE the fallback location (map center)
        let lat = Number(evt.lat || evt.location?.lat);
        let lng = Number(evt.lng || evt.location?.lng);

        if (!lat || !lng || (lat === 0 && lng === 0)) {
            if (fallbackLat && fallbackLng) {
                lat = fallbackLat;
                lng = fallbackLng;
            }
        }

        return {
            id: generateUUID(), 
            text: evt.text || `${evt.headline}\n\n${evt.content}`,
            timestamp: now,
            expiresAt: expiry,
            location: { 
                lat: applyStrongJitter(lat), 
                lng: applyStrongJitter(lng) 
            },
            city: evt.city_name || evt.city || "Unknown Sector",
            country: (evt.country_code || evt.country || "XX").toUpperCase().slice(0, 2), 
            sessionId: "SYSTEM_BROADCAST",
            score: 5, // Start with high visibility
            replyCount: 0,
            isRemote: true,
            originCountry: "SYSTEM", 
            tags: ["#GLOBAL_ALERT", "#SYSTEM", `#${(evt.country_code || 'XX').toUpperCase()}`],
            postType: 'GLOBAL_EVENT',
            eventMetadata: { source_url: evt.source_url || evt.eventMetadata?.source_url || "" },
            isMasked: false,
            language: evt.language || 'en'
        };
    });
};

const saveToDatabase = async (messages: ChatMessage[]) => {
    try {
        const rows = messages.map(msg => ({
            id: msg.id, 
            text: msg.text, 
            latitude: msg.location.lat, 
            longitude: msg.location.lng,
            city_name: msg.city, 
            target_country: msg.country, 
            session_id: msg.sessionId,
            score: msg.score, 
            expires_at: new Date(msg.expiresAt).toISOString(),
            origin_country: msg.originCountry, 
            is_remote: msg.isRemote, 
            tags: [...(msg.tags || []), `lang:${msg.language}`], 
            post_type: 'GLOBAL_EVENT', 
            event_metadata: msg.eventMetadata
        }));
        
        await supabase.from('kaiku_posts').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
    } catch (e) {
        console.error("KAIKU: Failed to persist radar events to DB", e);
    }
};