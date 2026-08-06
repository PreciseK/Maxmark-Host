import type { SupabaseClient } from '@supabase/supabase-js'

export type IntegrationType = 'new_relic' | 'datadog' | 'cloudflare'
export type IntegrationStatus = 'enabled' | 'disabled'

export interface Integration {
  id: string
  siteId: string
  type: IntegrationType
  status: IntegrationStatus
  createdAt: string
}

/** Every integration the platform offers, so the tab can list all of them. */
export const INTEGRATION_TYPES: IntegrationType[] = ['new_relic', 'datadog', 'cloudflare']

/**
 * config_encrypted is deliberately excluded from the select: it holds
 * provider credentials and the UI only ever needs type and status.
 */
export async function fetchIntegrations(
  supabase: SupabaseClient,
  siteId: string,
): Promise<Integration[]> {
  const { data, error } = await supabase
    .from('integrations')
    .select('id, site_id, type, status, created_at')
    .eq('site_id', siteId)

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    type: r.type as IntegrationType,
    status: r.status as IntegrationStatus,
    createdAt: r.created_at as string,
  }))
}
