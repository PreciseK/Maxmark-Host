import type { SupabaseClient } from '@supabase/supabase-js'

export type PointerDomainType = 'alias' | 'cname' | 'redirect'

export interface PointerDomain {
  id: string
  siteId: string
  domain: string
  type: PointerDomainType
  createdAt: string
}

export async function fetchPointerDomains(
  supabase: SupabaseClient,
  siteId: string,
): Promise<PointerDomain[]> {
  const { data, error } = await supabase
    .from('pointer_domains')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    domain: r.domain as string,
    type: r.type as PointerDomainType,
    createdAt: r.created_at as string,
  }))
}
