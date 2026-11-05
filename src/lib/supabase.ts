import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url || 'http://127.0.0.1:54321', key || 'public-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})
