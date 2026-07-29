import type { SupabaseClient } from '@supabase/supabase-js'

export interface BackupLog {
  id: string
  siteId: string
  status: 'completed' | 'failed' | 'in_progress'
  createdAt: string
}

export async function fetchBackupLogs(
  supabase: SupabaseClient,
  siteId: string,
): Promise<BackupLog[]> {
  const { data, error } = await supabase
    .from('backup_logs')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    status: r.status as BackupLog['status'],
    createdAt: r.created_at as string,
  }))
}
