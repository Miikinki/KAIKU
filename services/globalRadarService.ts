import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from '../types';
import { generateUUID } from './storageService';
import { supabase } from './supabaseClient';
import { getEnvVar } from './env';

const CACHE_DURATION_MS = 3 * 60 * 60 * 1000;
const SCAN_RESULT_DURATION_MS = 15 * 60 * 1000; 
const RADAR_MODEL = 'gemini-3-flash-preview';

// --- DIRECT API KEY CONFIGURATION ---
const FINAL_API_KEY = "AIzaSyBu9BLySGeO_lkJv9m3DcWsxt1JfLGE7Hc";

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

export const scanGlobalNetwork = async (specificQuery?: string, skipSave: boolean = false): Promise<ChatMessage[]> => {
  // Check cache first if not a specific search
  if (!specificQuery && !skipSave) {
      const cachedEvents = await getCachedEvents();
      if (cachedEvents.length > 0) return cachedEvents;
  }

  // FORCE USE OF KEY
  const apiKey = FINAL_API_KEY;
  
  if (!apiKey || apiKey.length < 5) {
      console.error("KAIKU: API Key is empty or invalid.");
      throw new Error("API Key Missing");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = specificQuery 
    ? `Search for 5 DIFFERENT major current news stories, events, or local developments in ${specificQuery} from the last 24 hours. Use Google Search. Do not repeat the same story. Return 5 unique items.`
    : "Search for 5 major different global news stories happening right now. Use Google Search.";

  const SYSTEM_PROMPT = `
  You are KAIKU_SCANNER. Your task is to provide real-world situational awareness data.
  Return ONLY a raw JSON array of 5 objects. Each object MUST represent a DIFFERENT news story.
  Do not include markdown blocks or explanations.
  
  Each object MUST follow this schema: 
  { 
    "headline": string, 
    "content": string, 
    "lat": number, 
    "lng": number, 
    "city_name": string, 
    "country_code": string, 
    "source_url": string,
    "language": string (ISO 639-1 code of the source text, e.g. "en", "fi", "es")
  }
  `;

  // --- ATTEMPT 1: WITH GOOGLE SEARCH (GROUNDING) ---
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

    const events = processResponse(response.text, skipSave);
    if (!skipSave && events.length > 0) await saveToDatabase(events);
    return events;

  } catch (error: any) {
    console.warn("KAIKU: Grounded Scan failed. Retrying with Fallback.", error);
    
    // --- ATTEMPT 2: FALLBACK (PURE LLM KNOWLEDGE) ---
    // This catches "Invalid Key", "Tool not supported", or "Upstream Error"
    try {
        const fallbackPrompt = specificQuery 
            ? `List 5 major likely recent news topics or general knowledge facts about ${specificQuery}.`
            : "List 5 major global news headlines.";
            
        const response = await ai.models.generateContent({
            model: RADAR_MODEL,
            contents: fallbackPrompt,
            config: {
                systemInstruction: SYSTEM_PROMPT + "\nIMPORTANT: Do not use tools. Generate based on internal knowledge.",
                responseMimeType: "application/json"
            }
        });

        const events = processResponse(response.text, skipSave);
        return events;

    } catch (fallbackError: any) {
        console.error("KAIKU: Both Scan methods failed.", fallbackError);
        // Do not throw generic error, return empty array so app doesn't crash
        return [];
    }
  }
};

const processResponse = (rawText: string | undefined, skipSave: boolean): ChatMessage[] => {
    if (!rawText) return [];
    
    const jsonText = cleanJsonString(rawText);
    let events = [];
    
    try {
        events = JSON.parse(jsonText);
    } catch (parseError) {
        console.error("KAIKU: JSON Parse failed", parseError);
        return [];
    }
    
    if (!Array.isArray(events)) return [];

    const now = Date.now();
    const expiry = skipSave ? (now + SCAN_RESULT_DURATION_MS) : (now + CACHE_DURATION_MS); 

    return events.map((evt: any) => ({
        id: generateUUID(), 
        text: `${evt.headline}\n\n${evt.content}`,
        timestamp: now,
        expiresAt: expiry,
        location: { 
            lat: applyStrongJitter(Number(evt.lat) || 0), 
            lng: applyStrongJitter(Number(evt.lng) || 0) 
        },
        city: evt.city_name || "Unknown Sector",
        country: (evt.country_code || "XX").toUpperCase().slice(0, 2), 
        sessionId: "SYSTEM_BROADCAST",
        score: skipSave ? 100 : 999, 
        replyCount: 0,
        isRemote: true,
        originCountry: "SYSTEM", 
        tags: skipSave ? ["#SCAN_RESULT"] : ["#GLOBAL_ALERT", "#SYSTEM", `#${(evt.country_code || 'XX').toUpperCase()}`],
        postType: skipSave ? 'SCAN_RESULT' : 'GLOBAL_EVENT',
        eventMetadata: { source_url: evt.source_url || "" },
        isMasked: false,
        language: evt.language || 'en'
    }));
}

const getCachedEvents = async (): Promise<ChatMessage[]> => {
    const nowISO = new Date().toISOString();
    const { data, error } = await supabase
        .from('kaiku_posts')
        .select('*')
        .eq('post_type', 'GLOBAL_EVENT')
        .gt('expires_at', nowISO)
        .order('created_at', { ascending: false })
        .limit(15);

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
        isMasked: false,
        language: d.tags?.find((t: string) => t.startsWith('lang:'))?.split(':')[1] || 'en'
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
    } catch (e) {
        console.error("KAIKU: Failed to persist radar events to DB", e);
    }
};