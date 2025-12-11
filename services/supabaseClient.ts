import { createClient } from '@supabase/supabase-js';

// HARDCODED CONFIGURATION TO BYPASS VERCEL/VITE ENV VAR ISSUES
const supabaseUrl = "https://njaujopcvyuqtnsjslxi.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qYXVqb3Bjdnl1cXRuc2pzbHhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzOTEzNjgsImV4cCI6MjA4MDk2NzM2OH0.xVEtbHoiZMpWgzI21IpZrWHKEAcUIGimT-tJ_14N6c4";

export const supabase = createClient(supabaseUrl, supabaseKey);

export const isSupabaseConfigured = () => {
    return true;
};