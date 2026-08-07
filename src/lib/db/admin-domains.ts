import type { SupabaseClient } from '@supabase/supabase-js'
import type { RegisteredDomain } from './domains'

export interface AdminDomainRecord extends RegisteredDomain {
  userEmail?: string
  userId?: string
}

export interface AdminDnsRecord {
  id: string
  domainId?: string
  domain: string
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'CAA'
  name: string
  content: string
  ttl: number
  proxied?: boolean
  priority?: number
  createdAt: string
}

export async function fetchAllAdminDomains(supabase: SupabaseClient): Promise<AdminDomainRecord[]> {
  const { data, error } = await supabase
    .from('registered_domains')
    .select('*, profiles(full_name, display_name)')
    .order('created_at', { ascending: false })

  if (error) {
    // Fallback if relation is not joined
    const { data: simpleData, error: simpleError } = await supabase
      .from('registered_domains')
      .select('*')
      .order('created_at', { ascending: false })

    if (simpleError) throw simpleError

    return (simpleData ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      domain: r.domain as string,
      tld: r.tld as string,
      status: r.status as RegisteredDomain['status'],
      expiresAt: r.expires_at as string,
      autoRenew: r.auto_renew as boolean,
      priceNgnYearly: Number(r.price_ngn_yearly),
      createdAt: r.created_at as string,
      userId: r.user_id as string,
    }))
  }

  return (data ?? []).map((r: Record<string, unknown>) => {
    const profile = r.profiles as { full_name?: string; display_name?: string } | undefined
    return {
      id: r.id as string,
      domain: r.domain as string,
      tld: r.tld as string,
      status: r.status as RegisteredDomain['status'],
      expiresAt: r.expires_at as string,
      autoRenew: r.auto_renew as boolean,
      priceNgnYearly: Number(r.price_ngn_yearly),
      createdAt: r.created_at as string,
      userId: r.user_id as string,
      userEmail: profile?.full_name || profile?.display_name || 'Unknown User',
    }
  })
}

export async function updateAdminDomainStatus(
  supabase: SupabaseClient,
  domainId: string,
  newStatus: RegisteredDomain['status'],
): Promise<void> {
  const { error } = await supabase
    .from('registered_domains')
    .update({ status: newStatus })
    .eq('id', domainId)

  if (error) throw error
}

export async function extendAdminDomainExpiry(
  supabase: SupabaseClient,
  domainId: string,
  addYears: number = 1,
): Promise<string> {
  const { data, error } = await supabase
    .from('registered_domains')
    .select('expires_at')
    .eq('id', domainId)
    .single()

  if (error) throw error

  const currentExp = new Date(data.expires_at as string)
  currentExp.setFullYear(currentExp.getFullYear() + addYears)
  const newIso = currentExp.toISOString()

  const { error: updateErr } = await supabase
    .from('registered_domains')
    .update({ expires_at: newIso, status: 'active' })
    .eq('id', domainId)

  if (updateErr) throw updateErr
  return newIso
}

// Simulated / Live DNS records store for administrative control
export function getInitialDnsRecords(domainName: string): AdminDnsRecord[] {
  return [
    {
      id: 'dns-1',
      domain: domainName,
      type: 'A',
      name: '@',
      content: '185.199.108.153',
      ttl: 3600,
      proxied: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dns-2',
      domain: domainName,
      type: 'CNAME',
      name: 'www',
      content: domainName,
      ttl: 3600,
      proxied: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dns-3',
      domain: domainName,
      type: 'MX',
      name: '@',
      content: `mail.${domainName}`,
      priority: 10,
      ttl: 14400,
      proxied: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dns-4',
      domain: domainName,
      type: 'TXT',
      name: '@',
      content: 'v=spf1 include:spf.maxmark.host ~all',
      ttl: 3600,
      proxied: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dns-5',
      domain: domainName,
      type: 'NS',
      name: '@',
      content: 'ns1.maxmark.host',
      ttl: 86400,
      proxied: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dns-6',
      domain: domainName,
      type: 'NS',
      name: '@',
      content: 'ns2.maxmark.host',
      ttl: 86400,
      proxied: false,
      createdAt: new Date().toISOString(),
    },
  ]
}
