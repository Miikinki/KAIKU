
import { createClient } from '@supabase/supabase-js';
import { getEnvVar } from './env';

// 1. Try to get variables from Environment (Vercel/Vite)
const envUrl = getEnvVar('SUPABASE_URL');
const envKey = getEnvVar('SUPABASE_ANON_KEY');

// 2. Fallback to Hardcoded values for Preview/Test Environment
// This ensures the app works in the AI Studio preview window immediately.
const FALLBACK_URL = "https://njaujopcvyuqtnsjslxi.supabase.co";
const FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qYXVqb3Bjdnl1cXRuc2pzbHhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTEzNjgsImV4cCI6MjA4MDk2NzM2OH0.xVEtbHoiZMpWgzI21IpZrWHKEAcUIGimT-tJ_14N6c4";

const supabaseUrl = envUrl || FALLBACK_URL;
const supabaseKey = envKey || FALLBACK_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("KAIKU: Critical Error - No Supabase credentials found.");
} else {
  console.log("KAIKU: Supabase Client Initialized", { 
    usingEnv: !!envUrl, 
    url: supabaseUrl 
  });
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

export const isSupabaseConfigured = () => {
    return !!supabaseUrl && !!supabaseKey;
};
