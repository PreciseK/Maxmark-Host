import type { SupabaseClient } from '@supabase/supabase-js'

export type EmailBoxStatus = 'active' | 'suspended' | 'locked'

export interface EmailBox {
  id: string
  siteId: string
  emailAddress: string
  /** null means unlimited quota. */
  storageQuotaMb: number | null
  usedMb: number
  hostname: string
  status: EmailBoxStatus
  autoresponderEnabled: boolean
  autoresponderSubject: string | null
  autoresponderBody: string | null
  createdAt: string
  updatedAt?: string
}

export interface EmailAlias {
  id: string
  siteId: string
  aliasAddress: string
  targetAddress: string
  isActive: boolean
  createdAt: string
}

export interface EmailClusterNode {
  id: string
  nodeName: string
  ipAddress: string
  role: 'mta_and_store' | 'mta' | 'imap_store' | 'relay'
  status: 'healthy' | 'degraded' | 'offline'
  activeImapSessions: number
  queueLength: number
  storageUsedGb: number
  storageTotalGb: number
  rblStatus: 'clean' | 'listed'
  createdAt: string
  updatedAt: string
}

export interface CreateEmailBoxParams {
  siteId: string
  emailAddress: string
  storageQuotaMb?: number | null
  hostname?: string
  autoresponderEnabled?: boolean
  autoresponderSubject?: string | null
  autoresponderBody?: string | null
}

export interface UpdateEmailBoxParams {
  storageQuotaMb?: number | null
  status?: EmailBoxStatus
  autoresponderEnabled?: boolean
  autoresponderSubject?: string | null
  autoresponderBody?: string | null
}

export interface CreateEmailAliasParams {
  siteId: string
  aliasAddress: string
  targetAddress: string
}

export async function fetchEmailBoxes(
  supabase: SupabaseClient,
  siteId: string,
): Promise<EmailBox[]> {
  const { data, error } = await supabase
    .from('email_boxes')
    .select('*')
    .eq('site_id', siteId)
    .order('email_address', { ascending: true })

  if (error) throw error

  return (data ?? []).map(mapEmailBoxRow)
}

export async function fetchAllEmailBoxesForUser(
  supabase: SupabaseClient,
  siteIds: string[],
): Promise<EmailBox[]> {
  if (siteIds.length === 0) return []

  const { data, error } = await supabase
    .from('email_boxes')
    .select('*')
    .in('site_id', siteIds)
    .order('email_address', { ascending: true })

  if (error) throw error

  return (data ?? []).map(mapEmailBoxRow)
}

export async function createEmailBox(
  supabase: SupabaseClient,
  params: CreateEmailBoxParams,
): Promise<EmailBox> {
  const payload = {
    site_id: params.siteId,
    email_address: params.emailAddress.toLowerCase().trim(),
    storage_quota_mb: params.storageQuotaMb ?? 2048,
    used_mb: 0.0,
    hostname: params.hostname ?? `mail.${params.emailAddress.split('@')[1] ?? 'maxmarkhost.com'}`,
    status: 'active',
    autoresponder_enabled: params.autoresponderEnabled ?? false,
    autoresponder_subject: params.autoresponderSubject ?? null,
    autoresponder_body: params.autoresponderBody ?? null,
  }

  const { data, error } = await supabase
    .from('email_boxes')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return mapEmailBoxRow(data as Record<string, unknown>)
}

export async function updateEmailBox(
  supabase: SupabaseClient,
  boxId: string,
  params: UpdateEmailBoxParams,
): Promise<EmailBox> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (params.storageQuotaMb !== undefined) payload.storage_quota_mb = params.storageQuotaMb
  if (params.status !== undefined) payload.status = params.status
  if (params.autoresponderEnabled !== undefined) payload.autoresponder_enabled = params.autoresponderEnabled
  if (params.autoresponderSubject !== undefined) payload.autoresponder_subject = params.autoresponderSubject
  if (params.autoresponderBody !== undefined) payload.autoresponder_body = params.autoresponderBody

  const { data, error } = await supabase
    .from('email_boxes')
    .update(payload)
    .eq('id', boxId)
    .select()
    .single()

  if (error) throw error
  return mapEmailBoxRow(data as Record<string, unknown>)
}

export async function deleteEmailBox(
  supabase: SupabaseClient,
  boxId: string,
): Promise<void> {
  const { error } = await supabase
    .from('email_boxes')
    .delete()
    .eq('id', boxId)

  if (error) throw error
}

export async function fetchEmailAliases(
  supabase: SupabaseClient,
  siteId: string,
): Promise<EmailAlias[]> {
  const { data, error } = await supabase
    .from('email_aliases')
    .select('*')
    .eq('site_id', siteId)
    .order('alias_address', { ascending: true })

  if (error) throw error

  return (data ?? []).map(mapEmailAliasRow)
}

export async function fetchAllEmailAliasesForUser(
  supabase: SupabaseClient,
  siteIds: string[],
): Promise<EmailAlias[]> {
  if (siteIds.length === 0) return []

  const { data, error } = await supabase
    .from('email_aliases')
    .select('*')
    .in('site_id', siteIds)
    .order('alias_address', { ascending: true })

  if (error) throw error

  return (data ?? []).map(mapEmailAliasRow)
}

export async function createEmailAlias(
  supabase: SupabaseClient,
  params: CreateEmailAliasParams,
): Promise<EmailAlias> {
  const payload = {
    site_id: params.siteId,
    alias_address: params.aliasAddress.toLowerCase().trim(),
    target_address: params.targetAddress.toLowerCase().trim(),
    is_active: true,
  }

  const { data, error } = await supabase
    .from('email_aliases')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return mapEmailAliasRow(data as Record<string, unknown>)
}

export async function toggleEmailAliasStatus(
  supabase: SupabaseClient,
  aliasId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('email_aliases')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', aliasId)

  if (error) throw error
}

export async function deleteEmailAlias(
  supabase: SupabaseClient,
  aliasId: string,
): Promise<void> {
  const { error } = await supabase
    .from('email_aliases')
    .delete()
    .eq('id', aliasId)

  if (error) throw error
}

// ---------------- Admin Functions ----------------

export async function fetchAllEmailBoxesAdmin(
  supabase: SupabaseClient,
): Promise<EmailBox[]> {
  const { data, error } = await supabase
    .from('email_boxes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map(mapEmailBoxRow)
}

export async function fetchAllEmailAliasesAdmin(
  supabase: SupabaseClient,
): Promise<EmailAlias[]> {
  const { data, error } = await supabase
    .from('email_aliases')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map(mapEmailAliasRow)
}

export async function fetchEmailClusterNodes(
  supabase: SupabaseClient,
): Promise<EmailClusterNode[]> {
  const { data, error } = await supabase
    .from('email_cluster_nodes')
    .select('*')
    .order('node_name', { ascending: true })

  if (error) throw error

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    nodeName: r.node_name as string,
    ipAddress: r.ip_address as string,
    role: r.role as EmailClusterNode['role'],
    status: r.status as EmailClusterNode['status'],
    activeImapSessions: Number(r.active_imap_sessions ?? 0),
    queueLength: Number(r.queue_length ?? 0),
    storageUsedGb: Number(r.storage_used_gb ?? 0),
    storageTotalGb: Number(r.storage_total_gb ?? 1000),
    rblStatus: r.rbl_status as EmailClusterNode['rblStatus'],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }))
}

// ---------------- Row Mappers ----------------

function mapEmailBoxRow(r: Record<string, unknown>): EmailBox {
  return {
    id: r.id as string,
    siteId: r.site_id as string,
    emailAddress: r.email_address as string,
    storageQuotaMb: (r.storage_quota_mb as number | null) ?? null,
    usedMb: Number(r.used_mb ?? 0),
    hostname: (r.hostname as string) || 'mail.maxmarkhost.com',
    status: (r.status as EmailBoxStatus) || 'active',
    autoresponderEnabled: Boolean(r.autoresponder_enabled),
    autoresponderSubject: (r.autoresponder_subject as string | null) ?? null,
    autoresponderBody: (r.autoresponder_body as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) ?? undefined,
  }
}

function mapEmailAliasRow(r: Record<string, unknown>): EmailAlias {
  return {
    id: r.id as string,
    siteId: r.site_id as string,
    aliasAddress: r.alias_address as string,
    targetAddress: r.target_address as string,
    isActive: r.is_active !== false,
    createdAt: r.created_at as string,
  }
}
