import type { SupabaseClient } from '@supabase/supabase-js'

export type MaintenanceState = 'scheduled' | 'in_progress' | 'completed'

export interface MaintenanceWindow {
  id: string
  title: string
  body: string
  startsAt: string
  endsAt: string
  published: boolean
  createdAt: string
}

export const MAINTENANCE_STATE_LABELS: Record<MaintenanceState, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
}

/** Windows stay visible for this long after they end, then age off the dashboard. */
const RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * State is derived from the window's own timestamps rather than stored, so a
 * notice can never sit on the dashboard claiming a state nobody updated.
 * Both boundaries count as in progress.
 */
export function deriveWindowState(window: MaintenanceWindow, now: Date): MaintenanceState {
  const startsAt = new Date(window.startsAt).getTime()
  const endsAt = new Date(window.endsAt).getTime()
  const current = now.getTime()

  if (current < startsAt) return 'scheduled'
  if (current > endsAt) return 'completed'
  return 'in_progress'
}

function mapWindow(r: Record<string, unknown>): MaintenanceWindow {
  return {
    id: r.id as string,
    title: r.title as string,
    body: r.body as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    published: r.published as boolean,
    createdAt: r.created_at as string,
  }
}

/**
 * Published windows that have not yet aged out. See fetchServiceComponents for
 * why the published filter is explicit rather than left to RLS.
 */
export async function fetchActiveMaintenanceWindows(
  supabase: SupabaseClient,
): Promise<MaintenanceWindow[]> {
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString()

  const { data, error } = await supabase
    .from('maintenance_windows')
    .select('*')
    .eq('published', true)
    .gt('ends_at', cutoff)
    .order('starts_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapWindow)
}

/** Every window including drafts and past ones. Requires the admin role. */
export async function fetchAllMaintenanceWindows(
  supabase: SupabaseClient,
): Promise<MaintenanceWindow[]> {
  const { data, error } = await supabase
    .from('maintenance_windows')
    .select('*')
    .order('starts_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapWindow)
}
