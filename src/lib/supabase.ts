import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  url || 'https://not-configured.supabase.co',
  anonKey || 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
