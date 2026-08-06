import type { SupabaseClient } from '@supabase/supabase-js'

export type ServiceStatus =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance'

export interface ServiceComponent {
  id: string
  name: string
  description: string
  status: ServiceStatus
  sortOrder: number
  published: boolean
  createdAt: string
}

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded Performance',
  partial_outage: 'Partial Outage',
  major_outage: 'Major Outage',
  maintenance: 'Under Maintenance',
}

/**
 * Severity order for the rollup. Maintenance ranks above operational because
 * it is a planned deviation worth surfacing, but below the unplanned states.
 */
const SEVERITY: Record<ServiceStatus, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
}

/**
 * Worst status across the given components. Computed at render time so the
 * banner can never contradict the list beneath it.
 */
export function overallStatus(components: ServiceComponent[]): ServiceStatus {
  let worst: ServiceStatus = 'operational'
  for (const component of components) {
    if (SEVERITY[component.status] > SEVERITY[worst]) {
      worst = component.status
    }
  }
  return worst
}

function mapComponent(r: Record<string, unknown>): ServiceComponent {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    status: r.status as ServiceStatus,
    sortOrder: r.sort_order as number,
    published: r.published as boolean,
    createdAt: r.created_at as string,
  }
}

/**
 * Published components for the customer dashboard.
 *
 * The published filter is explicit rather than left to RLS: admins can select
 * every row via is_admin(), so relying on RLS alone would show an admin their
 * own drafts on their personal dashboard while every other user saw nothing.
 */
export async function fetchServiceComponents(
  supabase: SupabaseClient,
): Promise<ServiceComponent[]> {
  const { data, error } = await supabase
    .from('service_components')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapComponent)
}

/** Every component including drafts. Requires the admin role under RLS. */
export async function fetchAllServiceComponents(
  supabase: SupabaseClient,
): Promise<ServiceComponent[]> {
  const { data, error } = await supabase
    .from('service_components')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapComponent)
}
