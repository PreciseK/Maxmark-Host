import type { SupabaseClient } from '@supabase/supabase-js'

export interface DnsZone {
  id: string
  zoneName: string
  recordCount: number
  contact: string
  createdAt: string
}

export async function fetchDnsZones(supabase: SupabaseClient): Promise<DnsZone[]> {
  const { data, error } = await supabase
    .from('dns_zones')
    .select('*, dns_records(count)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => {
    const countArr = r.dns_records as Array<{ count: number }> | null
    const zoneName = r.zone_name as string
    return {
      id: r.id as string,
      zoneName,
      recordCount: countArr?.[0]?.count ?? 0,
      contact: `hostmaster@${zoneName}`,
      createdAt: r.created_at as string,
    }
  })
}
