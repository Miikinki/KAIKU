import { createClient } from '@supabase/supabase-js';
import { getEnvVar } from './env';

// VITE PROJECT CONFIGURATION
// Since this project uses index.html as an entry point, it is a Vite app.
// You must set these variables in Vercel:
// 1. VITE_SUPABASE_URL
// 2. VITE_SUPABASE_ANON_KEY

const supabaseUrl = getEnvVar('SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.warn("KAIKU: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check Vercel Environment Variables.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

export const isSupabaseConfigured = () => {
    return !!supabaseUrl && !!supabaseKey;
};