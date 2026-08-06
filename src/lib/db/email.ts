import type { SupabaseClient } from '@supabase/supabase-js'

export interface EmailBox {
  id: string
  siteId: string
  emailAddress: string
  /** null means unlimited quota. */
  storageQuotaMb: number | null
  hostname: string
  createdAt: string
}

export interface EmailAlias {
  id: string
  siteId: string
  aliasAddress: string
  targetAddress: string
  createdAt: string
}

export async function fetchEmailBoxes(
  supabase: SupabaseClient,
  siteId: string,
): Promise<EmailBox[]> {
  const { data, error } = await supabase
    .from('email_boxes')
    .select('*')
    .eq('site_id', siteId)
    .order('email_address', { ascending: true })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    emailAddress: r.email_address as string,
    storageQuotaMb: (r.storage_quota_mb as number | null) ?? null,
    hostname: r.hostname as string,
    createdAt: r.created_at as string,
  }))
}

export async function fetchEmailAliases(
  supabase: SupabaseClient,
  siteId: string,
): Promise<EmailAlias[]> {
  const { data, error } = await supabase
    .from('email_aliases')
    .select('*')
    .eq('site_id', siteId)
    .order('alias_address', { ascending: true })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    aliasAddress: r.alias_address as string,
    targetAddress: r.target_address as string,
    createdAt: r.created_at as string,
  }))
}
