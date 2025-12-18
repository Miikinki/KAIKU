import { createClient } from '@supabase/supabase-js';
import { getEnvVar } from './env';

// 1. Try to get variables from Environment (Vercel/Vite)
const envUrl = getEnvVar('SUPABASE_URL');
const envKey = getEnvVar('SUPABASE_ANON_KEY');

// NOTE: It is best practice to configure these in your deployment platform (e.g., Vercel)
// rather than hardcoding them here to avoid Git leaks.

if (!envUrl || !envKey) {
  console.warn("KAIKU: Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

// CRITICAL FIX: We must provide a valid-looking URL string even if env vars are missing,
// otherwise createClient throws an error immediately and crashes the entire React app (Dark Blue Screen).
const validUrl = envUrl || 'https://placeholder.supabase.co';
const validKey = envKey || 'placeholder-key';

export const supabase = createClient(validUrl, validKey);

export const isSupabaseConfigured = () => {
    return !!envUrl && !!envKey;
};