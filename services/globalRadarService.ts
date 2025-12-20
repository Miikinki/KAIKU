import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from '../types';
import { generateUUID, calculateDistance } from './storageService';
import { supabase } from './supabaseClient';
import { getEnvVar } from './env';

// CONFIG
const NEWS_TTL_HOURS = 48; // Keep news alive for 48h
const NEWS_TTL_MS = NEWS_TTL_HOURS * 60 * 60 * 1000;
const RADAR_MODEL = 'gemini-3-flash-preview';
const SECTOR_COOLDOWN_HOURS = 12; // Don't re-scan area if news exists from last 12h
const SCAN_RADIUS_KM = 15; // Radius to check for existing news

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
    return coord + (Math.random() - 0.5) * 0.03;
};

// --- SPAM PREVENTION: CHECK SECTOR ---

const checkSectorCooldown = async (lat: number, lng: number): Promise<boolean> => {
    try {
        const cooldownTime = new Date(Date.now() - (SECTOR_COOLDOWN_HOURS * 60 * 60 * 1000)).toISOString();
        
        // Bounding box approximation (~20km box) to avoid complex PostGIS
        const minLat = lat - 0.2;
        const maxLat = lat + 0.2;
        const minLng = lng - 0.2;
        const maxLng = lng + 0.2;

        const { data, error } = await supabase
            .from('kaiku_posts')
            .select('latitude, longitude')
            .eq('post_type', 'GLOBAL_EVENT')
            .gt('created_at', cooldownTime)
            .gte('latitude', minLat)
            .lte('latitude', maxLat)
            .gte('longitude', minLng)
            .lte('longitude', maxLng)
            .limit(20);

        if (error || !data) return false;

        // Precise check
        for (const post of data) {
            const dist = calculateDistance(lat, lng, post.latitude, post.longitude);
            if (dist < SCAN_RADIUS_KM) {
                return true; // Found recent news in this sector
            }
        }
        
        return false;
    } catch (e) {
        return false;
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

export interface ScanResult {
    status: 'NEW_INTEL' | 'COOLDOWN' | 'ERROR';
    events: ChatMessage[];
    locationName?: string;
}

export const scanGlobalNetwork = async (
    specificQuery: string | undefined, 
    isTargeted: boolean, 
    centerLat: number, 
    centerLng: number
): Promise<ScanResult> => {
  
  // 1. SECTOR COOLDOWN CHECK (Skip if targeted search)
  if (!specificQuery) {
      const isCooldown = await checkSectorCooldown(centerLat, centerLng);
      if (isCooldown) {
          return { status: 'COOLDOWN', events: [] };
      }
  }

  // 2. PREPARE GENAI
  const apiKey = getEnvVar('GOOGLE_API_KEY');
  
  if (!apiKey || apiKey.length < 5 || apiKey.includes("REPLACE_WITH")) {
      return { status: 'ERROR', events: generateMockEvents(centerLat, centerLng) };
  }

  const ai = new GoogleGenAI({ apiKey });
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  let prompt = "";
  let contextInstruction = "";

  if (specificQuery) {
      prompt = `Today is ${today}. Find 5 BREAKING news stories related to "${specificQuery}". Return strictly JSON.`;
      contextInstruction = `Focus on query: "${specificQuery}".`;
  } else {
      prompt = `Today is ${today}. Find 5 BREAKING local news stories happening RIGHT NOW near coordinates ${centerLat}, ${centerLng}. If no major local news, find major regional news. Return strictly JSON.`;
      contextInstruction = `Focus on local events near Lat: ${centerLat}, Lng: ${centerLng}. Ignore old news (>24h).`;
  }

  const SYSTEM_PROMPT = `
  You are KAIKU_SCANNER.
  Current Date: ${today}.
  ${contextInstruction}
  
  Your task: Return a JSON array of 3-5 news objects.
  CRITICAL: ONLY return news from the last 24-48 hours.
  Format: JSON ONLY. No markdown.
  
  Schema per object: 
  { 
    "headline": "Short title (Max 10 words)", 
    "content": "2-3 sentence summary", 
    "lat": ${centerLat}, // Use approximate location if exact unknown
    "lng": ${centerLng}, 
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

    await saveToDatabase(rawEvents);
    
    return { status: 'NEW_INTEL', events: rawEvents, locationName: rawEvents[0]?.city };

  } catch (error: any) {
    console.warn("KAIKU: Grounded Scan failed.", error);
    return { status: 'ERROR', events: [] };
  }
};

const processResponse = (rawText: string | undefined, fallbackLat: number, fallbackLng: number): ChatMessage[] => {
    if (!rawText) return [];
    const jsonText = cleanJsonString(rawText);
    let events = [];
    try { events = JSON.parse(jsonText); } catch (e) { return []; }
    if (!Array.isArray(events)) return [];

    return rehydrateEvents(events, fallbackLat, fallbackLng);
}

const rehydrateEvents = (events: any[], fallbackLat: number, fallbackLng: number): ChatMessage[] => {
    const now = Date.now();
    const expiry = now + NEWS_TTL_MS; 

    return events.map((evt: any) => {
        // COORDINATE SAFETY LOGIC
        let lat = Number(evt.lat || evt.location?.lat);
        let lng = Number(evt.lng || evt.location?.lng);

        // If AI returns 0,0 or undefined, OR coordinates are wildly far (placeholder), snap to sector center
        if (!lat || !lng || (lat === 0 && lng === 0)) {
            lat = fallbackLat;
            lng = fallbackLng;
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