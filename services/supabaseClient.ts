import { createClient } from '@supabase/supabase-js';
import { getEnvVar } from './env';

// ------------------------------------------------------------------
// OHJEET TESTAUKSEEN:
// Jos haluat testata Supabasea ilman .env tiedostoja (esim. suoraan koodissa),
// liitä Project URL ja Anon Key alla oleviin lainausmerkkeihin.
// ------------------------------------------------------------------
const MANUAL_URL = "https://njaujopcvyuqtnsjslxi.supabase.co"; 
const MANUAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qYXVqb3Bjdnl1cXRuc2pzbHhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTEzNjgsImV4cCI6MjA4MDk2NzM2OH0.xVEtbHoiZMpWgzI21IpZrWHKEAcUIGimT-tJ_14N6c4"; 
// ------------------------------------------------------------------

// 1. Try to get variables from Environment (Vercel/Vite)
const envUrl = getEnvVar('SUPABASE_URL');
const envKey = getEnvVar('SUPABASE_ANON_KEY');

// Logic: Use Manual keys if provided, otherwise fallback to Environment variables, finally placeholder.
const finalUrl = MANUAL_URL.length > 5 ? MANUAL_URL : (envUrl || 'https://placeholder.supabase.co');
const finalKey = MANUAL_KEY.length > 5 ? MANUAL_KEY : (envKey || 'placeholder-key');

if (finalUrl === 'https://placeholder.supabase.co') {
  console.warn("KAIKU: Supabase credentials missing. Set MANUAL_URL in supabaseClient.ts or use .env variables.");
}

export const supabase = createClient(finalUrl, finalKey);

export const isSupabaseConfigured = () => {
    return (finalUrl !== 'https://placeholder.supabase.co' && finalKey !== 'placeholder-key');
};