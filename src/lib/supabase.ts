import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const isDemoMode = false

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value) return true
  return /your[-_ ]|change[-_ ]?me|placeholder|example\.com|^<.*>$/i.test(value)
}

export const configurationError = isDemoMode
  ? null
  : looksLikePlaceholder(supabaseUrl) || looksLikePlaceholder(supabaseAnonKey)
    ? 'Maxmark is not configured. Set real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values, or explicitly enable VITE_DEMO_MODE for a non-production demo.'
    : null
export const supabase =
  !isDemoMode && !configurationError && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null
