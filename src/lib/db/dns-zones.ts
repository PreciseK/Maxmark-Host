import type { SupabaseClient } from '@supabase/supabase-js'

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV'

export interface DnsZone {
  id: string
  zoneName: string
  recordCount: number
  contact: string
  createdAt: string
}

export interface DnsRecord {
  id: string
  zoneId: string
  type: DnsRecordType
  name: string
  value: string
  ttl: number
  priority: number | null
  createdAt: string
  updatedAt: string
}

export interface DnsRecordInput {
  type: DnsRecordType
  name: string
  value: string
  ttl: number
  priority?: number | null
}

export interface SiteMissingDnsZone {
  id: string
  siteDomain: string
}

function mapZone(r: Record<string, unknown>): DnsZone {
  const countArr = r.dns_records as Array<{ count: number }> | null
  const zoneName = r.zone_name as string
  return {
    id: r.id as string,
    zoneName,
    recordCount: countArr?.[0]?.count ?? 0,
    contact: `hostmaster@${zoneName}`,
    createdAt: r.created_at as string,
  }
}

function mapRecord(r: Record<string, unknown>): DnsRecord {
  return {
    id: r.id as string,
    zoneId: r.zone_id as string,
    type: r.type as DnsRecordType,
    name: r.name as string,
    value: r.value as string,
    ttl: r.ttl as number,
    priority: (r.priority as number | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export async function fetchDnsZones(supabase: SupabaseClient): Promise<DnsZone[]> {
  const { data, error } = await supabase
    .from('dns_zones')
    .select('*, dns_records(count)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapZone)
}

export async function fetchDnsZone(supabase: SupabaseClient, zoneId: string): Promise<DnsZone | null> {
  const { data, error } = await supabase
    .from('dns_zones')
    .select('*, dns_records(count)')
    .eq('id', zoneId)
    .maybeSingle()

  if (error) throw error
  return data ? mapZone(data) : null
}

export async function fetchDnsRecords(supabase: SupabaseClient, zoneId: string): Promise<DnsRecord[]> {
  const { data, error } = await supabase
    .from('dns_records')
    .select('*')
    .eq('zone_id', zoneId)
    .order('type', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapRecord)
}

export async function createDnsRecord(
  supabase: SupabaseClient,
  zoneId: string,
  input: DnsRecordInput,
): Promise<DnsRecord> {
  const { data, error } = await supabase
    .from('dns_records')
    .insert({
      zone_id: zoneId,
      type: input.type,
      name: input.name,
      value: input.value,
      ttl: input.ttl,
      priority: input.priority ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return mapRecord(data)
}

export async function updateDnsRecord(
  supabase: SupabaseClient,
  recordId: string,
  input: DnsRecordInput,
): Promise<DnsRecord> {
  const { data, error } = await supabase
    .from('dns_records')
    .update({
      type: input.type,
      name: input.name,
      value: input.value,
      ttl: input.ttl,
      priority: input.priority ?? null,
    })
    .eq('id', recordId)
    .select()
    .single()

  if (error) throw error
  return mapRecord(data)
}

export async function deleteDnsRecord(supabase: SupabaseClient, recordId: string): Promise<void> {
  const { error } = await supabase.from('dns_records').delete().eq('id', recordId)
  if (error) throw error
}

// Sites that should have a DNS zone (any site with a domain) but don't —
// the provisioning trigger swallows errors, so this can happen. Surfaced as
// a repair action rather than a general "add zone" flow.
export async function fetchSitesMissingDnsZone(supabase: SupabaseClient): Promise<SiteMissingDnsZone[]> {
  const [{ data: sites, error: sitesError }, { data: zones, error: zonesError }] = await Promise.all([
    supabase.from('user_sites').select('id, site_domain'),
    supabase.from('dns_zones').select('zone_name'),
  ])

  if (sitesError) throw sitesError
  if (zonesError) throw zonesError

  const zonedDomains = new Set((zones ?? []).map((z) => z.zone_name as string))
  return (sites ?? [])
    .filter((s) => !zonedDomains.has(s.site_domain as string))
    .map((s) => ({ id: s.id as string, siteDomain: s.site_domain as string }))
}

export async function ensureDnsZoneForSite(supabase: SupabaseClient, siteId: string): Promise<DnsZone> {
  const { data, error } = await supabase.rpc('ensure_dns_zone_for_site', { target_site_id: siteId })
  if (error) throw error
  return mapZone({ ...(data as Record<string, unknown>), dns_records: null })
}
