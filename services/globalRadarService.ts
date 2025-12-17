
import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from '../types';
import { generateUUID } from './storageService';
import { supabase } from './supabaseClient';

const CACHE_DURATION_MS = 3 * 60 * 60 * 1000;
const RADAR_MODEL = 'gemini-3-flash-preview';

/**
 * Utility to clean JSON string from potential Markdown code blocks
 */
const cleanJsonString = (text: string): string => {
  return text.replace(/```json\n?|```/g, '').trim();
};

export const scanGlobalNetwork = async (specificQuery?: string): Promise<ChatMessage[]> => {
  // Check cache only for general global scan
  if (!specificQuery) {
      const cachedEvents = await getCachedEvents();
      if (cachedEvents.length > 0) return cachedEvents;
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
      console.warn("KAIKU: API_KEY missing from environment.");
      return [];
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Broader prompt to ensure we get results even if there's no "breaking" news
  const prompt = specificQuery 
    ? `Search for 3-5 major current news stories, interesting events, or noteworthy developments happening in ${specificQuery} right now. Use Google Search to find the latest information from the last 48 hours.`
    : "Search for 3-5 major current global news stories or noteworthy events happening across the world right now. Use Google Search for the most recent updates.";

  const SYSTEM_PROMPT = `
  You are KAIKU_SYSTEM. Your task is to provide real-world situational awareness data.
  Return ONLY a raw JSON array of objects. Do not include markdown blocks, explanations, or preambles.
  Each object MUST follow this schema: 
  { 
    "headline": string, 
    "content": string, 
    "lat": number, 
    "lng": number, 
    "city_name": string, 
    "country_code": "ISO 3166-1 alpha-2 code (e.g., 'FI', 'US', 'JP')", 
    "source_url": string 
  }
  If no significant events are found for a specific location, return an empty array [].
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

    const rawText = response.text;
    if (!rawText) {
        console.warn("KAIKU: Empty response from Radar model.");
        return [];
    }
    
    // Robust parsing: strip markdown if the model ignored responseMimeType
    const jsonText = cleanJsonString(rawText);
    const events = JSON.parse(jsonText);
    
    if (!Array.isArray(events)) {
        console.warn("KAIKU: Radar response is not an array:", events);
        return [];
    }

    if (events.length === 0) {
        console.log(`KAIKU: No signals found for query: ${specificQuery || 'Global'}`);
        return [];
    }

    const now = Date.now();
    const expiry = now + CACHE_DURATION_MS; 

    const formattedMessages: ChatMessage[] = events.map((evt: any) => ({
        id: generateUUID(), 
        text: `${evt.headline}\n\n${evt.content}`,
        timestamp: now,
        expiresAt: expiry,
        location: { 
            lat: Number(evt.lat) || 0, 
            lng: Number(evt.lng) || 0 
        },
        city: evt.city_name || "Unknown Sector",
        country: (evt.country_code || "XX").toUpperCase().slice(0, 2), 
        sessionId: "SYSTEM_BROADCAST",
        score: 999,
        replyCount: 0,
        isRemote: true,
        originCountry: "SYSTEM", 
        tags: ["#GLOBAL_ALERT", "#SYSTEM", `#${(evt.country_code || 'XX').toUpperCase()}`],
        postType: 'GLOBAL_EVENT',
        eventMetadata: { source_url: evt.source_url || "" },
        isMasked: false
    }));

    // Save to DB for future users to see
    if (formattedMessages.length > 0) {
        await saveToDatabase(formattedMessages);
    }
    
    return formattedMessages;
  } catch (error) {
    console.error("KAIKU: Radar Scan Exception:", error);
    return [];
  }
};

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
        isMasked: false
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
        tags: msg.tags,
        post_type: 'GLOBAL_EVENT', 
        event_metadata: msg.eventMetadata
    }));
    
    try {
        await supabase.from('kaiku_posts').insert(rows);
    } catch (e) {
        console.error("KAIKU: Failed to persist radar events to DB", e);
    }
};
