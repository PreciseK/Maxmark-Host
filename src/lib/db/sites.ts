import type { SupabaseClient } from '@supabase/supabase-js'
import type { ManagedSite, UserSiteStatus } from '@/types/provisioning'

interface DbNodeRow {
  primary_domain: string
  current_slots: number
  max_slots: number
}

interface DbSiteRow {
  id: string
  user_id: string
  node_id: string
  site_domain: string
  db_name: string
  db_user: string
  document_root: string
  status: string
  plan: string
  region: string
  php_version: string
  wordpress_version: string
  daily_visits: number
  magic_login_token: string | null
  cname_target: string
  ip_address: string
  ftp_hostname: string
  home_directory: string
  redis_ip: string | null
  redis_port: number | null
  cdn_hostname: string | null
  cdn_endpoint: string | null
  disk_used_gb: number
  disk_capacity_gb: number
  bandwidth_capacity_gb: number
  bandwidth_included_gb: number
  uptime_percent: number
  php_workers: number
  backups_summary: string
  created_at: string
  updated_at: string
  hosting_nodes: DbNodeRow | null
}

function mapDbSiteToManagedSite(row: DbSiteRow): ManagedSite {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date()
  return {
    id: row.id,
    user_id: row.user_id,
    node_id: row.node_id,
    site_domain: row.site_domain,
    db_name: row.db_name,
    db_user: row.db_user,
    document_root: row.document_root,
    status: row.status as UserSiteStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
    plan: row.plan,
    region: row.region,
    phpVersion: row.php_version,
    wordpressVersion: row.wordpress_version,
    backupsSummary: row.backups_summary,
    createdLabel: new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(createdAt),
    dailyVisits: row.daily_visits,
    magicLoginLabel: 'Open WP Admin',
    metrics: {
      diskUsedGb: Number(row.disk_used_gb),
      diskCapacityGb: row.disk_capacity_gb,
      bandwidthUsedGb: 0,
      bandwidthCapacityGb: row.bandwidth_capacity_gb,
      uptimePercent: Number(row.uptime_percent),
      phpWorkers: row.php_workers,
    },
    nodeSummary: {
      primaryDomain: row.hosting_nodes?.primary_domain ?? '',
      currentSlots: row.hosting_nodes?.current_slots ?? 0,
      maxSlots: row.hosting_nodes?.max_slots ?? 20,
    },
    cnameTarget: row.cname_target,
    ipAddress: row.ip_address,
    ftpHostname: row.ftp_hostname,
    homeDirectory: row.home_directory,
    redisIp: row.redis_ip,
    redisPort: row.redis_port,
    cdnHostname: row.cdn_hostname,
    cdnEndpoint: row.cdn_endpoint,
  }
}

export async function fetchSites(supabase: SupabaseClient): Promise<ManagedSite[]> {
  const { data, error } = await supabase
    .from('user_sites')
    .select(`*, hosting_nodes ( primary_domain, current_slots, max_slots )`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as DbSiteRow[]).map(mapDbSiteToManagedSite)
}

// Note: there is deliberately no insertSite here. Site rows are created only
// by the provision-site Edge Function; RLS blocks client inserts.
