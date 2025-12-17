import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from '../types';
import { generateUUID } from './storageService';
import { supabase } from './supabaseClient';

const CACHE_DURATION_MS = 3 * 60 * 60 * 1000;
const RADAR_MODEL = 'gemini-3-flash-preview';

export const scanGlobalNetwork = async (specificQuery?: string): Promise<ChatMessage[]> => {
  if (!specificQuery) {
      const cachedEvents = await getCachedEvents();
      if (cachedEvents.length > 0) return cachedEvents;
  }

  const apiKey = process.env.API_KEY;
  if (!apiKey) return [];
  
  const ai = new GoogleGenAI({ apiKey });
  const prompt = specificQuery 
    ? `Find 3-5 major current breaking news events or incidents happening in ${specificQuery} right now. Use Google Search for the latest info.`
    : "Find 3-5 major current breaking news events or incidents happening across the world right now. Use Google Search.";

  const SYSTEM_PROMPT = `
  You are KAIKU_SYSTEM. Return ONLY a raw JSON array of objects. 
  Do not include markdown blocks or any other text.
  Schema: { "headline": string, "content": string, "lat": number, "lng": number, "city_name": string, "country_code": string, "source_url": string }
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

    const text = response.text;
    if (!text) return [];
    
    const events = JSON.parse(text);
    if (!Array.isArray(events)) return [];

    const now = Date.now();
    const expiry = now + CACHE_DURATION_MS; 

    const formattedMessages: ChatMessage[] = events.map((evt: any) => ({
        id: generateUUID(), 
        text: `${evt.headline}\n\n${evt.content}`,
        timestamp: now,
        expiresAt: expiry,
        location: { lat: Number(evt.lat) || 0, lng: Number(evt.lng) || 0 },
        city: evt.city_name || "Unknown",
        country: evt.country_code || "XX", 
        sessionId: "SYSTEM_BROADCAST",
        score: 999,
        replyCount: 0,
        isRemote: true,
        originCountry: "SYSTEM", 
        tags: ["#GLOBAL_ALERT", "#SYSTEM", `#${evt.country_code || 'XX'}`],
        postType: 'GLOBAL_EVENT',
        eventMetadata: { source_url: evt.source_url || "" },
        isMasked: false
    }));

    if (formattedMessages.length > 0) await saveToDatabase(formattedMessages);
    return formattedMessages;
  } catch (error) {
    console.error("KAIKU Radar Scan Failed:", error);
    return [];
  }
};

const getCachedEvents = async (): Promise<ChatMessage[]> => {
    const nowISO = new Date().toISOString();
    const { data, error } = await supabase.from('kaiku_posts').select('*').eq('post_type', 'GLOBAL_EVENT').gt('expires_at', nowISO).order('created_at', { ascending: false }).limit(15);
    if (error || !data) return [];
    return data.map((d: any) => ({
        id: d.id, text: d.text, timestamp: new Date(d.created_at).getTime(), expiresAt: new Date(d.expires_at).getTime(),
        location: { lat: Number(d.latitude), lng: Number(d.longitude) }, city: d.city_name, country: d.target_country,
        sessionId: d.session_id, score: d.score, replyCount: 0, isRemote: d.is_remote, originCountry: d.origin_country,
        tags: d.tags, postType: 'GLOBAL_EVENT', eventMetadata: d.event_metadata, isMasked: false
    }));
};

const saveToDatabase = async (messages: ChatMessage[]) => {
    const rows = messages.map(msg => ({
        id: msg.id, text: msg.text, latitude: msg.location.lat, longitude: msg.location.lng,
        city_name: msg.city, target_country: msg.country, session_id: msg.sessionId,
        score: msg.score, expires_at: new Date(msg.expiresAt).toISOString(),
        origin_country: msg.originCountry, is_remote: msg.isRemote, tags: msg.tags,
        post_type: 'GLOBAL_EVENT', event_metadata: msg.eventMetadata
    }));
    await supabase.from('kaiku_posts').insert(rows);
};