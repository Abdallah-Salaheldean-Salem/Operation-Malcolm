/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Defaults point at the dedicated Operation Malcolm Supabase project
// (supabase-alizarin-nest) so a fresh deployment syncs out of the box. The
// publishable (anon) key is safe to ship client-side; access is governed by the
// table Row Level Security policies. Set VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY to point at another project.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://uyscrptjglpmuscsaqfp.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xQi0q4SO_cWMsmGZlVMWIg_qcR-f5XW';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Initialize the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
