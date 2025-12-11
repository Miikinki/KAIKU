import { createClient } from '@supabase/supabase-js';

// CRITICAL FIX: Explicitly access the environment variables so bundlers (Vite/Webpack)
// can statically analyze and replace them at build time.
// Do NOT use dynamic access like process.env[key] or import.meta.env[key].

const getSupabaseUrl = () => {
  // 1. Try Vite / ESM (import.meta.env)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    if (import.meta.env.NEXT_PUBLIC_SUPABASE_URL) return import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
    // @ts-ignore
    if (import.meta.env.VITE_SUPABASE_URL) return import.meta.env.VITE_SUPABASE_URL;
  }

  // 2. Try Node / Next.js / Webpack (process.env)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  }
  
  return '';
};

const getSupabaseKey = () => {
  // 1. Try Vite / ESM (import.meta.env)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    if (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // @ts-ignore
    if (import.meta.env.VITE_SUPABASE_ANON_KEY) return import.meta.env.VITE_SUPABASE_ANON_KEY;
  }

  // 2. Try Node / Next.js / Webpack (process.env)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  }

  return '';
};

const supabaseUrl = getSupabaseUrl();
const supabaseKey = getSupabaseKey();

// Debug logs to help identify issues in console (Masked for security)
if (!supabaseUrl || !supabaseKey) {
    console.warn("KAIKU: Missing Supabase Env Vars.");
    console.log("URL Found:", !!supabaseUrl);
    console.log("Key Found:", !!supabaseKey);
}

// Create client only if keys exist
export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export const isSupabaseConfigured = () => {
    return !!supabase;
};