import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from '../types';
import { generateUUID } from './storageService';
import { getEnvVar } from './env';
import { supabase } from './supabaseClient';

// --- CONFIGURATION ---
const CACHE_DURATION_MS = 3 * 60 * 60 * 1000; // 3 Hours strict cache window
const RADAR_MODEL = 'gemini-2.5-flash';

// Initialize Gemini Client
const apiKey = getEnvVar('GEMINI_API_KEY') || getEnvVar('API_KEY');
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * GLOBAL OVERWATCH STRATEGY:
 * 1. Check DB for 'GLOBAL_EVENT' posts created within the last 3 hours.
 * 2. If found -> Return cached (API FREE).
 * 3. If missing -> Call Gemini -> Save to DB -> Return.
 * 
 * @param specificQuery Optional location/topic to scan (e.g. "Finland"). If provided, bypasses general cache.
 */
export const scanGlobalNetwork = async (specificQuery?: string): Promise<ChatMessage[]> => {
  
  // 1. CHECK DATABASE CACHE (Only if generic scan)
  if (!specificQuery) {
      const cachedEvents = await getCachedEvents();
      if (cachedEvents.length > 0) {
          console.log("KAIKU: Loaded Global Signals from Database Cache (Overwatch Mode)");
          return cachedEvents;
      }
      console.log("KAIKU: Cache expired. Initiating active global scan...");
  } else {
      console.log(`KAIKU: Targeted Scan Initiated: ${specificQuery}`);
  }

  // 2. IF CACHE MISS OR TARGETED SCAN -> BECOME THE HERO
  if (!ai) {
    console.warn("KAIKU: No Gemini API Key. Cannot generate new signals.");
    return [];
  }

  const prompt = specificQuery 
    ? `Scan specifically for critical breaking news or events in ${specificQuery}.`
    : "Scan global frequencies for critical breaking news events happening RIGHT NOW.";

  // Strict System Instruction for JSON output
  const SYSTEM_PROMPT = `
  You are KAIKU_SYSTEM, a global monitoring grid.
  Task: Identify 3-5 MAJOR breaking news events based on the user request.
  
  CRITICAL: Return ONLY a raw JSON array. Do not use Markdown code blocks. Do not explain.
  
  JSON Schema per object:
  {
    "headline": "CITY: EVENT NAME", (Uppercase, max 40 chars)
    "content": "Brief tactical summary of the situation.", (Max 150 chars)
    "lat": 0.0,
    "lng": 0.0,
    "city_name": "City",
    "country_code": "ISO 2-letter code",
    "source_url": "URL to source"
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model: RADAR_MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }], 
      }
    });

    let text = response.text;
    if (!text) return [];

    text = text.replace(/```json|```/g, '').trim();

    let events = [];
    try {
        events = JSON.parse(text);
    } catch (e) {
        console.error("KAIKU Radar: JSON Parse Failed.", text);
        return [];
    }

    if (!Array.isArray(events)) return [];

    // 3. CONVERT & SAVE TO DB
    const now = Date.now();
    // Cache for 3 hours
    const expiry = now + CACHE_DURATION_MS; 

    const formattedMessages: ChatMessage[] = events.map((evt: any) => ({
        id: generateUUID(), 
        text: `${evt.headline}\n\n${evt.content}`,
        timestamp: now,
        expiresAt: expiry,
        location: { lat: evt.lat || 0, lng: evt.lng || 0 },
        city: evt.city_name || "Unknown Sector",
        country: evt.country_code || "XX",
        sessionId: "SYSTEM_BROADCAST",
        score: 999, // Pin to top
        replyCount: 0,
        isRemote: true,
        originCountry: "SYSTEM",
        tags: ["#GLOBAL_ALERT", "#SYSTEM", `#${evt.country_code}`],
        postType: 'GLOBAL_EVENT',
        eventMetadata: { source_url: evt.source_url || "" },
        isMasked: false
    }));

    // Save to DB so others don't have to call API
    // Only save strictly "Global" events to the shared cache pool to avoid cluttering specific searches?
    // Actually, saving specific searches is fine too, they just become signals.
    await saveToDatabase(formattedMessages);

    return formattedMessages;

  } catch (error) {
    console.error("KAIKU Radar Scan Failed:", error);
    return [];
  }
};

// --- DATABASE HELPERS ---

const getCachedEvents = async (): Promise<ChatMessage[]> => {
    // 3 Hour Window logic handled by 'created_at' check or 'expires_at' check.
    // Since we set expiresAt = now + 3h, we just check expiresAt > now.
    const nowISO = new Date().toISOString();
    
    // Fetch valid GLOBAL_EVENT posts
    const { data, error } = await supabase
        .from('kaiku_posts')
        .select('*')
        .eq('post_type', 'GLOBAL_EVENT')
        .gt('expires_at', nowISO)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error || !data) return [];

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
        isMasked: false
    }));
};

const saveToDatabase = async (messages: ChatMessage[]) => {
    if (messages.length === 0) return;

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
        tags: msg.tags,
        post_type: 'GLOBAL_EVENT', // Marked as System Event
        event_metadata: msg.eventMetadata
    }));

    const { error } = await supabase
        .from('kaiku_posts')
        .insert(rows);

    if (error) {
        console.error("KAIKU: Failed to cache global events to DB", error);
    }
};
