import type { SupabaseClient } from '@supabase/supabase-js'

export type StagingStatus = 'provisioning' | 'active' | 'failed' | 'deleted'

export interface StagingEnvironment {
  id: string
  parentSiteId: string
  siteDomain: string
  status: StagingStatus
  createdAt: string
}

export async function fetchStagingEnvironments(
  supabase: SupabaseClient,
  siteId: string,
): Promise<StagingEnvironment[]> {
  const { data, error } = await supabase
    .from('staging_environments')
    .select('*')
    .eq('parent_site_id', siteId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    parentSiteId: r.parent_site_id as string,
    siteDomain: r.site_domain as string,
    status: r.status as StagingStatus,
    createdAt: r.created_at as string,
  }))
}
