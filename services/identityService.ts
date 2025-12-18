import { supabase } from './supabaseClient';
import { getAnonymousID, getUserProfile, restoreSession } from './storageService';

/**
 * SQL REQUIRED IN SUPABASE:
 * 
 * create table if not exists kaiku_identities (
 *   session_id uuid primary key,
 *   recovery_hash text not null,
 *   profile_data jsonb,
 *   created_at timestamptz default now()
 * );
 */

const generateRandomCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 1, 0
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Format: XXXX-YYYY-ZZZZ
    return `KAIKU-${result.slice(0, 4)}-${result.slice(4, 8)}-${result.slice(8)}`;
};

const hashString = async (message: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

export const generateTransferKey = async (): Promise<string> => {
    const sessionId = getAnonymousID();
    const profile = getUserProfile();
    const plainCode = generateRandomCode();
    const hashCode = await hashString(plainCode);

    try {
        const { error } = await supabase
            .from('kaiku_identities')
            .upsert({ 
                session_id: sessionId, 
                recovery_hash: hashCode,
                profile_data: profile
            });

        if (error) {
            console.error("Identity backup failed:", error);
            throw new Error("Database connection failed");
        }

        return plainCode;
    } catch (e: any) {
        throw new Error(e.message || "Failed to generate key");
    }
};

export const restoreIdentity = async (code: string): Promise<void> => {
    const cleanCode = code.trim().toUpperCase();
    
    // Quick format check
    if (!cleanCode.startsWith('KAIKU-')) {
        throw new Error("Invalid code format. Must start with KAIKU-");
    }

    const hashCode = await hashString(cleanCode);

    try {
        const { data, error } = await supabase
            .from('kaiku_identities')
            .select('*')
            .eq('recovery_hash', hashCode)
            .single();

        if (error || !data) {
            throw new Error("Signal not found or code invalid.");
        }

        const sessionId = data.session_id;
        const profile = data.profile_data;

        restoreSession(sessionId, profile);

    } catch (e: any) {
        throw new Error(e.message || "Recovery failed");
    }
};