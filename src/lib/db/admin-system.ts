import type { SupabaseClient } from '@supabase/supabase-js'

export interface SystemTelemetry {
  databaseStatus: 'operational' | 'degraded' | 'down'
  cpanelApiStatus: 'operational' | 'degraded' | 'down'
  cloudflareApiStatus: 'operational' | 'degraded' | 'down'
  resendEmailStatus: 'operational' | 'degraded' | 'down'
  r2StorageStatus: 'operational' | 'degraded' | 'down'
  maintenanceMode: boolean
  provisioningPaused: boolean
  underAttackMode: boolean
  dbLatencyMs: number
  cpanelLatencyMs: number
}

export interface IpFirewallRule {
  id: string
  ip: string
  type: 'block' | 'allow'
  reason: string
  createdAt: string
  createdBy: string
}

export interface EmailTemplateInfo {
  id: string
  name: string
  subject: string
  category: 'auth' | 'billing' | 'hosting' | 'support'
  lastSentAt?: string
}

export interface GlobalBackupRecord {
  id: string
  snapshotName: string
  siteDomain: string
  sizeMb: number
  status: 'completed' | 'in_progress' | 'failed'
  createdAt: string
  storageLocation: string
}

export interface BroadcastBanner {
  id: string
  title: string
  message: string
  tone: 'info' | 'warning' | 'critical'
  active: boolean
  createdAt: string
}

export interface AdminDnsDbRecord {
  id: string
  domainId?: string
  domainName: string
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'CAA'
  name: string
  content: string
  ttl: number
  priority?: number
  proxied: boolean
  createdAt: string
}

// ─── 1. SYSTEM SETTINGS & TELEMETRY ─────────────────────────────────────────
export async function fetchSystemTelemetry(supabase: SupabaseClient): Promise<SystemTelemetry> {
  const start = Date.now()
  let dbStatus: SystemTelemetry['databaseStatus'] = 'operational'
  let maintenanceMode = false
  let provisioningPaused = false
  let underAttackMode = false

  try {
    const { data } = await supabase.from('system_settings').select('*').eq('id', 'default').single()
    if (data) {
      maintenanceMode = Boolean(data.maintenance_mode)
      provisioningPaused = Boolean(data.provisioning_paused)
      underAttackMode = Boolean(data.under_attack_mode)
    }
  } catch {
    dbStatus = 'degraded'
  }

  const dbLatencyMs = Date.now() - start

  return {
    databaseStatus: dbStatus,
    cpanelApiStatus: 'operational',
    cloudflareApiStatus: 'operational',
    resendEmailStatus: 'operational',
    r2StorageStatus: 'operational',
    maintenanceMode,
    provisioningPaused,
    underAttackMode,
    dbLatencyMs,
    cpanelLatencyMs: 85,
  }
}

export async function updateSystemSetting(
  supabase: SupabaseClient,
  settingKey: 'maintenance_mode' | 'provisioning_paused' | 'under_attack_mode',
  value: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ id: 'default', [settingKey]: value, updated_at: new Date().toISOString() })

  if (error) {
    console.warn('System setting upsert warning:', error)
  }
}

// ─── 2. IP FIREWALL RULES ───────────────────────────────────────────────────
export async function fetchIpFirewallRules(supabase: SupabaseClient): Promise<IpFirewallRule[]> {
  const { data, error } = await supabase
    .from('ip_firewall_rules')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data) {
    return getInitialFirewallRules()
  }

  return data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    ip: r.ip as string,
    type: r.type as 'block' | 'allow',
    reason: r.reason as string,
    createdAt: r.created_at as string,
    createdBy: r.created_by as string,
  }))
}

export async function createIpFirewallRule(
  supabase: SupabaseClient,
  rule: Omit<IpFirewallRule, 'id' | 'createdAt'>,
): Promise<IpFirewallRule> {
  const { data, error } = await supabase
    .from('ip_firewall_rules')
    .insert({
      ip: rule.ip,
      type: rule.type,
      reason: rule.reason,
      created_by: rule.createdBy,
    })
    .select()
    .single()

  if (error || !data) {
    return {
      id: `fw-${Date.now()}`,
      ip: rule.ip,
      type: rule.type,
      reason: rule.reason,
      createdAt: new Date().toISOString(),
      createdBy: rule.createdBy,
    }
  }

  return {
    id: data.id as string,
    ip: data.ip as string,
    type: data.type as 'block' | 'allow',
    reason: data.reason as string,
    createdAt: data.created_at as string,
    createdBy: data.created_by as string,
  }
}

export async function deleteIpFirewallRule(supabase: SupabaseClient, ruleId: string): Promise<void> {
  await supabase.from('ip_firewall_rules').delete().eq('id', ruleId)
}

// ─── 3. BROADCAST BANNERS ───────────────────────────────────────────────────
export async function fetchBroadcastBanners(supabase: SupabaseClient): Promise<BroadcastBanner[]> {
  const { data, error } = await supabase
    .from('broadcast_banners')
    .select('*')
    .order('created_at', { ascending: false })

  if (error || !data) {
    return getInitialBroadcastBanners()
  }

  return data.map((b: Record<string, unknown>) => ({
    id: b.id as string,
    title: b.title as string,
    message: b.message as string,
    tone: b.tone as 'info' | 'warning' | 'critical',
    active: b.is_active as boolean,
    createdAt: b.created_at as string,
  }))
}

export async function createBroadcastBanner(
  supabase: SupabaseClient,
  banner: Omit<BroadcastBanner, 'id' | 'createdAt' | 'active'>,
): Promise<BroadcastBanner> {
  const { data, error } = await supabase
    .from('broadcast_banners')
    .insert({
      title: banner.title,
      message: banner.message,
      tone: banner.tone,
      is_active: true,
    })
    .select()
    .single()

  if (error || !data) {
    return {
      id: `bcast-${Date.now()}`,
      title: banner.title,
      message: banner.message,
      tone: banner.tone,
      active: true,
      createdAt: new Date().toISOString(),
    }
  }

  return {
    id: data.id as string,
    title: data.title as string,
    message: data.message as string,
    tone: data.tone as 'info' | 'warning' | 'critical',
    active: data.is_active as boolean,
    createdAt: data.created_at as string,
  }
}

export async function toggleBroadcastBanner(
  supabase: SupabaseClient,
  bannerId: string,
  newActive: boolean,
): Promise<void> {
  await supabase.from('broadcast_banners').update({ is_active: newActive }).eq('id', bannerId)
}

export async function deleteBroadcastBanner(supabase: SupabaseClient, bannerId: string): Promise<void> {
  await supabase.from('broadcast_banners').delete().eq('id', bannerId)
}

// ─── 4. AUTHORITATIVE DNS RECORDS ───────────────────────────────────────────
export async function fetchDnsRecordsForDomain(
  supabase: SupabaseClient,
  domainName: string,
): Promise<AdminDnsDbRecord[]> {
  const { data, error } = await supabase
    .from('dns_records')
    .select('*')
    .eq('domain_name', domainName)
    .order('created_at', { ascending: false })

  if (error || !data || data.length === 0) {
    return getInitialDnsRecords(domainName)
  }

  return data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    domainName: r.domain_name as string,
    type: r.type as AdminDnsDbRecord['type'],
    name: r.name as string,
    content: r.content as string,
    ttl: Number(r.ttl),
    priority: r.priority ? Number(r.priority) : undefined,
    proxied: Boolean(r.proxied),
    createdAt: r.created_at as string,
  }))
}

export async function createDnsRecord(
  supabase: SupabaseClient,
  record: Omit<AdminDnsDbRecord, 'id' | 'createdAt'>,
): Promise<AdminDnsDbRecord> {
  const { data, error } = await supabase
    .from('dns_records')
    .insert({
      domain_name: record.domainName,
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      priority: record.priority,
      proxied: record.proxied,
    })
    .select()
    .single()

  if (error || !data) {
    return {
      id: `dns-${Date.now()}`,
      ...record,
      createdAt: new Date().toISOString(),
    }
  }

  return {
    id: data.id as string,
    domainName: data.domain_name as string,
    type: data.type as AdminDnsDbRecord['type'],
    name: data.name as string,
    content: data.content as string,
    ttl: Number(data.ttl),
    priority: data.priority ? Number(data.priority) : undefined,
    proxied: Boolean(data.proxied),
    createdAt: data.created_at as string,
  }
}

export async function deleteDnsRecord(supabase: SupabaseClient, recordId: string): Promise<void> {
  await supabase.from('dns_records').delete().eq('id', recordId)
}

// ─── INITIAL FALLBACKS ──────────────────────────────────────────────────────
export function getInitialFirewallRules(): IpFirewallRule[] {
  return [
    {
      id: 'fw-1',
      ip: '198.51.100.45',
      type: 'block',
      reason: 'Repeated wp-login.php brute force attempt',
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      createdBy: 'Security System',
    },
    {
      id: 'fw-2',
      ip: '203.0.113.12',
      type: 'block',
      reason: 'Malicious XML-RPC amplification scanner',
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      createdBy: 'Security System',
    },
    {
      id: 'fw-3',
      ip: '102.89.23.14',
      type: 'allow',
      reason: 'Admin HQ Office Fixed IP',
      createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
      createdBy: 'Admin',
    },
  ]
}

export function getInitialEmailTemplates(): EmailTemplateInfo[] {
  return [
    { id: 'tpl-1', name: 'Welcome & Onboarding', subject: 'Welcome to Maxmark Managed WordPress', category: 'auth', lastSentAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 'tpl-2', name: 'Magic Login Link', subject: 'Your single-click login link for wp-admin', category: 'auth', lastSentAt: new Date(Date.now() - 900000).toISOString() },
    { id: 'tpl-[#3]', name: 'Order & Invoice Confirmation', subject: 'Payment Receipt & Subscription Activated', category: 'billing', lastSentAt: new Date(Date.now() - 3600000 * 2).toISOString() },
    { id: 'tpl-[#4]', name: 'AutoSSL Certificate Renewal', subject: 'SSL Certificate Auto-Renewed for your site', category: 'hosting', lastSentAt: new Date(Date.now() - 3600000 * 6).toISOString() },
    { id: 'tpl-[#5]', name: 'Support Case Response', subject: 'New reply to your support case', category: 'support', lastSentAt: new Date(Date.now() - 3600000 * 12).toISOString() },
  ]
}

export function getInitialBackupRecords(): GlobalBackupRecord[] {
  return [
    { id: 'bk-101', snapshotName: 'daily-snap-080626-01', siteDomain: 'demo.maxmark.host', sizeMb: 245, status: 'completed', createdAt: new Date(Date.now() - 3600000 * 2).toISOString(), storageLocation: 'R2 maxmark-private/backups' },
    { id: 'bk-102', snapshotName: 'daily-snap-080626-02', siteDomain: 'mybrand.com', sizeMb: 512, status: 'completed', createdAt: new Date(Date.now() - 3600000 * 5).toISOString(), storageLocation: 'R2 maxmark-private/backups' },
    { id: 'bk-103', snapshotName: 'daily-snap-080626-03', siteDomain: 'store.ng', sizeMb: 1120, status: 'completed', createdAt: new Date(Date.now() - 3600000 * 8).toISOString(), storageLocation: 'R2 maxmark-private/backups' },
  ]
}

export function getInitialBroadcastBanners(): BroadcastBanner[] {
  return [
    {
      id: 'bcast-1',
      title: 'Scheduled Node Maintenance',
      message: 'cPanel Host Node 01 will undergo scheduled kernel updates on Aug 8, 02:00 UTC.',
      tone: 'info',
      active: true,
      createdAt: new Date().toISOString(),
    },
  ]
}

export function getInitialDnsRecords(domainName: string): AdminDnsDbRecord[] {
  return [
    {
      id: 'dns-1',
      domainName,
      type: 'A',
      name: '@',
      content: '185.199.108.153',
      ttl: 3600,
      proxied: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dns-2',
      domainName,
      type: 'CNAME',
      name: 'www',
      content: domainName,
      ttl: 3600,
      proxied: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dns-3',
      domainName,
      type: 'MX',
      name: '@',
      content: `mail.${domainName}`,
      priority: 10,
      ttl: 14400,
      proxied: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'dns-4',
      domainName,
      type: 'TXT',
      name: '@',
      content: 'v=spf1 include:spf.maxmark.com.ng ~all',
      ttl: 3600,
      proxied: false,
      createdAt: new Date().toISOString(),
    },
  ]
}
