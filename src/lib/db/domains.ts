import type { SupabaseClient } from '@supabase/supabase-js'

export interface RegisteredDomain {
  id: string
  domain: string
  tld: string
  status: 'active' | 'expired' | 'pending' | 'transferred' | 'suspended'
  expiresAt: string
  autoRenew: boolean
  priceNgnYearly: number
  createdAt: string
}

export async function fetchRegisteredDomains(
  supabase: SupabaseClient,
): Promise<RegisteredDomain[]> {
  const { data, error } = await supabase
    .from('registered_domains')
    .select('*')
    .order('expires_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    domain: r.domain as string,
    tld: r.tld as string,
    status: r.status as RegisteredDomain['status'],
    expiresAt: r.expires_at as string,
    autoRenew: r.auto_renew as boolean,
    priceNgnYearly: Number(r.price_ngn_yearly),
    createdAt: r.created_at as string,
  }))
}
