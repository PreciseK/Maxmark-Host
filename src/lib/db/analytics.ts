import type { SupabaseClient } from '@supabase/supabase-js'

export type AnalyticsMetric = 'php_fpm' | 'web_stats' | 'bandwidth'

export interface AnalyticsSnapshot {
  id: string
  siteId: string
  metric: AnalyticsMetric
  value: number
  recordedAt: string
}

/**
 * Recent snapshots for one site, newest first. The caller picks the latest
 * value per metric; keeping the series lets the tab show trends later.
 */
export async function fetchAnalyticsSnapshots(
  supabase: SupabaseClient,
  siteId: string,
): Promise<AnalyticsSnapshot[]> {
  const { data, error } = await supabase
    .from('analytics_snapshots')
    .select('*')
    .eq('site_id', siteId)
    .order('recorded_at', { ascending: false })
    .limit(90)

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    metric: r.metric as AnalyticsMetric,
    value: Number(r.value),
    recordedAt: r.recorded_at as string,
  }))
}

/** Latest value per metric, or null when a metric has no snapshot yet. */
export function latestByMetric(
  snapshots: AnalyticsSnapshot[],
): Record<AnalyticsMetric, number | null> {
  const latest: Record<AnalyticsMetric, number | null> = {
    php_fpm: null,
    web_stats: null,
    bandwidth: null,
  }
  // fetchAnalyticsSnapshots returns newest first, so the first hit per metric wins.
  for (const snapshot of snapshots) {
    if (latest[snapshot.metric] === null) {
      latest[snapshot.metric] = snapshot.value
    }
  }
  return latest
}
