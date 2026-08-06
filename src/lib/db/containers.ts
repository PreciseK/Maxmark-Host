import type { SupabaseClient } from '@supabase/supabase-js'

export type ContainerType = 'elasticsearch' | 'rabbitmq' | 'solr'
export type ContainerStatus = 'disabled' | 'provisioning' | 'enabled' | 'failed'

export interface ContainerService {
  id: string
  siteId: string
  containerType: ContainerType
  status: ContainerStatus
  createdAt: string
}

/** Every container type the platform offers, so the tab can list all of them. */
export const CONTAINER_TYPES: ContainerType[] = ['elasticsearch', 'rabbitmq', 'solr']

export async function fetchContainerServices(
  supabase: SupabaseClient,
  siteId: string,
): Promise<ContainerService[]> {
  const { data, error } = await supabase
    .from('container_services')
    .select('*')
    .eq('site_id', siteId)

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    containerType: r.container_type as ContainerType,
    status: r.status as ContainerStatus,
    createdAt: r.created_at as string,
  }))
}
