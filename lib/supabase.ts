import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured=Boolean(supabaseUrl && supabaseAnonKey);
// Device projects remain usable when cloud configuration is absent. No requests
// are made to this placeholder; the auth UI checks isSupabaseConfigured first.
export const supabase = createClient(supabaseUrl || 'https://unconfigured.invalid', supabaseAnonKey || 'unconfigured');
