import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value) return true
  return /your[-_ ]|change[-_ ]?me|placeholder|example\.com|^<.*>$/i.test(value)
}

export const configurationError =
  looksLikePlaceholder(supabaseUrl) || looksLikePlaceholder(supabaseAnonKey)
    ? 'Maxmark is not configured. Set real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values.'
    : null

export const supabase =
  !configurationError && supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null
