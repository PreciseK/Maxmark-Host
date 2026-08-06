import type { SupabaseClient } from '@supabase/supabase-js'

export type SslStatus = 'installed' | 'not_installed' | 'pending'

export interface SslCertificate {
  id: string
  siteId: string
  domain: string
  status: SslStatus
  expiresAt: string | null
  keyLength: number
  autoRenew: boolean
  domainsIncluded: string[]
  createdAt: string
}

function mapCertificate(r: Record<string, unknown>): SslCertificate {
  const included = r.domains_included
  return {
    id: r.id as string,
    siteId: r.site_id as string,
    domain: r.domain as string,
    status: r.status as SslStatus,
    expiresAt: (r.expires_at as string | null) ?? null,
    keyLength: r.key_length as number,
    autoRenew: r.auto_renew as boolean,
    domainsIncluded: Array.isArray(included) ? (included as string[]) : [],
    createdAt: r.created_at as string,
  }
}

/** Every certificate the signed-in user can see, for the SSL overview page. */
export async function fetchSslCertificates(
  supabase: SupabaseClient,
): Promise<SslCertificate[]> {
  const { data, error } = await supabase
    .from('ssl_certificates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map(mapCertificate)
}

/** The certificate for one site. site_id is unique, so at most one row. */
export async function fetchSiteSslCertificate(
  supabase: SupabaseClient,
  siteId: string,
): Promise<SslCertificate | null> {
  const { data, error } = await supabase
    .from('ssl_certificates')
    .select('*')
    .eq('site_id', siteId)
    .maybeSingle()

  if (error) throw error

  return data ? mapCertificate(data as Record<string, unknown>) : null
}
