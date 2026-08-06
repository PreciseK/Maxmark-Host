import type { SupabaseClient } from '@supabase/supabase-js'

export interface CronTask {
  id: string
  siteId: string
  command: string
  schedule: string
  path: string
  mailTo: string | null
  createdAt: string
}

export async function fetchCronTasks(
  supabase: SupabaseClient,
  siteId: string,
): Promise<CronTask[]> {
  const { data, error } = await supabase
    .from('cron_tasks')
    .select('*')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    siteId: r.site_id as string,
    command: r.command as string,
    schedule: r.schedule as string,
    path: r.path as string,
    mailTo: (r.mail_to as string | null) ?? null,
    createdAt: r.created_at as string,
  }))
}
