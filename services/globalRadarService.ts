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
    return coord + (Math.random() - 0.5) * 0.015;
};

// --- DB HELPERS ---

const normalizeCacheKey = (query?: string): string => {
    if (!query) return 'news:global';
    return `news:${query.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
};

// SHARED WORLD CHECK: Look for active pins in the main feed
const checkExistingActiveNews = async (cityQuery?: string): Promise<ChatMessage[] | null> => {
    if (!cityQuery) return null;

    try {
        const nowISO = new Date().toISOString();
        
        // Find news created recently for this specific city/query
        // We filter by tag or city_name matching the query roughly
        const { data, error } = await supabase
            .from('kaiku_posts')
            .select('*')
            .eq('post_type', 'GLOBAL_EVENT')
            .gt('expires_at', nowISO) // Must still be active
            .textSearch('city_name', cityQuery, { type: 'websearch', config: 'english' }) 
            .limit(10);

        if (error || !data || data.length === 0) return null;

        console.log(`KAIKU SHARED: Found ${data.length} active news items for ${cityQuery}`);
        
        // Map DB rows to ChatMessage
        return data.map((d: any) => ({
            id: d.id, 
            text: d.text, 
            timestamp: new Date(d.created_at).getTime(), 
            expiresAt: new Date(d.expires_at).getTime(),
            location: { lat: Number(d.latitude), lng: Number(d.longitude) }, 
            city: d.city_name, 
            country: d.target_country,
            sessionId: d.session_id, 
            score: d.score, 
            replyCount: 0, 
            isRemote: d.is_remote, 
            originCountry: d.origin_country, 
            tags: d.tags, 
            postType: 'GLOBAL_EVENT', 
            eventMetadata: d.event_metadata, 
            isMasked: false,
            language: d.tags?.find((t: string) => t.startsWith('lang:'))?.split(':')[1] || 'en'
        }));
    } catch (e) {
        console.warn("Shared news check failed", e);
        return null;
    }
};

const checkApiCache = async (key: string): Promise<ChatMessage[] | null> => {
    try {
        const { data, error } = await supabase
            .from('kaiku_news_cache')
            .select('*')
            .eq('location_key', key)
            .gt('expires_at', new Date().toISOString()) 
            .single();

        if (error || !data) return null;
        return data.data as ChatMessage[];
    } catch (e) {
        return null;
    }
};

const saveToApiCache = async (key: string, messages: ChatMessage[]) => {
    try {
        // Cache for API cost reduction (1 hour)
        const expiresAt = new Date(Date.now() + API_CACHE_DURATION_MS).toISOString();
        await supabase
            .from('kaiku_news_cache')
            .upsert({ location_key: key, data: messages, expires_at: expiresAt });
    } catch (e) {
        console.warn("Cache save failed", e);
    }
};

// --- MOCK DATA ---
const generateMockEvents = (): ChatMessage[] => {
    const now = Date.now();
    return [
        {
            id: `mock-${now}-1`,
            text: "SYSTEM ALERT: Simulation Mode Active.\n\nGlobal radar operating in offline simulation.",
            timestamp: now,
            expiresAt: now + NEWS_TTL_MS,
            location: { lat: 60.1699, lng: 24.9384 },
            city: "Helsinki",
            country: "FI",
            sessionId: "SYSTEM",
            score: 999,
            replyCount: 0,
            isRemote: true,
            originCountry: "FI",
            tags: ["#SYSTEM", "#DEMO"],
            postType: 'GLOBAL_EVENT',
            isMasked: false,
            eventMetadata: {}
        }
    ];
};

export const scanGlobalNetwork = async (specificQuery?: string, skipSave: boolean = false): Promise<ChatMessage[]> => {
  const cacheKey = normalizeCacheKey(specificQuery);
  
  // 1. SHARED WORLD CHECK (Layer 1)
  // Before calling AI, check if valid news posts already exist in the DB for this location.
  // This ensures User B sees what User A scanned, without creating duplicates.
  if (specificQuery && !skipSave) {
      const existingSharedNews = await checkExistingActiveNews(specificQuery);
      if (existingSharedNews && existingSharedNews.length > 0) {
          return existingSharedNews;
      }
  }

  // 2. API CACHE CHECK (Layer 2)
  // If no public posts exist, check if we have raw JSON cached to save tokens.
  const cachedRawEvents = await checkApiCache(cacheKey);
  if (cachedRawEvents) {
      // Re-hydrate these events as NEW posts (since we didn't find them in Layer 1)
      const freshPosts = rehydrateEvents(cachedRawEvents);
      if (!skipSave) await saveToDatabase(freshPosts);
      return freshPosts;
  }

  // 3. GENERATE NEW CONTENT (Layer 3)
  const apiKey = getEnvVar('GOOGLE_API_KEY');
  
  if (!apiKey || apiKey.length < 5 || apiKey.includes("REPLACE_WITH")) {
      console.warn("KAIKU: Google API Key missing. Switching to DEMO MODE.");
      return generateMockEvents();
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = specificQuery 
    ? `Find 5 recent news stories or events related to: ${specificQuery}. Use Google Search. Return strictly JSON.`
    : "Find 5 major global news stories happening right now. Use Google Search. Return strictly JSON.";

  const SYSTEM_PROMPT = `
  You are KAIKU_SCANNER. 
  Your task: Return a JSON array of 5 news objects.
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

    const rawEvents = processResponse(response.text);
    
    if (rawEvents.length === 0) {
        throw new Error("Grounded scan returned 0 events.");
    }

    // Save RAW result to API Cache (for token saving)
    await saveToApiCache(cacheKey, rawEvents);

    // Save ACTUAL POSTS to Shared DB (for visibility)
    if (!skipSave && rawEvents.length > 0) await saveToDatabase(rawEvents);
    
    return rawEvents;

  } catch (error: any) {
    console.warn("KAIKU: Grounded Scan failed. Retrying with Fallback.", error);
    
    // Fallback: Internal Knowledge
    try {
        const fallbackPrompt = specificQuery 
            ? `Generate 5 likely recent news headlines about: ${specificQuery}. Based on your internal knowledge.`
            : "Generate 5 major global news headlines based on your internal knowledge.";
            
        const response = await ai.models.generateContent({
            model: RADAR_MODEL,
            contents: fallbackPrompt,
            config: {
                systemInstruction: SYSTEM_PROMPT + "\nIMPORTANT: Do not use tools.",
                responseMimeType: "application/json"
            }
        });

        const events = processResponse(response.text);
        
        if (events.length === 0 && !specificQuery) return generateMockEvents();
        
        if (!skipSave && events.length > 0) await saveToDatabase(events);
        return events;

    } catch (fallbackError: any) {
        console.error("KAIKU: Both Scan methods failed.", fallbackError);
        if (!specificQuery) return generateMockEvents();
        return [];
    }
  }
};

const processResponse = (rawText: string | undefined): ChatMessage[] => {
    if (!rawText) return [];
    const jsonText = cleanJsonString(rawText);
    let events = [];
    try { events = JSON.parse(jsonText); } catch (e) { return []; }
    if (!Array.isArray(events)) return [];

    return rehydrateEvents(events);
}

// Helper to turn raw JSON objects into fresh ChatMessages with new IDs and Timestamps
const rehydrateEvents = (events: any[]): ChatMessage[] => {
    const now = Date.now();
    const expiry = now + NEWS_TTL_MS; // 12 Hours

    return events.map((evt: any) => ({
        id: generateUUID(), 
        text: evt.text || `${evt.headline}\n\n${evt.content}`,
        timestamp: now,
        expiresAt: expiry,
        location: { 
            lat: applyStrongJitter(Number(evt.lat || evt.location?.lat) || 0), 
            lng: applyStrongJitter(Number(evt.lng || evt.location?.lng) || 0) 
        },
        city: evt.city_name || evt.city || "Unknown Sector",
        country: (evt.country_code || evt.country || "XX").toUpperCase().slice(0, 2), 
        sessionId: "SYSTEM_BROADCAST",
        score: 999, 
        replyCount: 0,
        isRemote: true,
        originCountry: "SYSTEM", 
        tags: ["#GLOBAL_ALERT", "#SYSTEM", `#${(evt.country_code || 'XX').toUpperCase()}`],
        postType: 'GLOBAL_EVENT',
        eventMetadata: { source_url: evt.source_url || evt.eventMetadata?.source_url || "" },
        isMasked: false,
        language: evt.language || 'en'
    }));
};

const saveToDatabase = async (messages: ChatMessage[]) => {
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
    
    try {
        await supabase.from('kaiku_posts').insert(rows);
        console.log(`KAIKU DB: Persisted ${messages.length} global events.`);
    } catch (e) {
        console.error("KAIKU: Failed to persist radar events to DB", e);
    }
};