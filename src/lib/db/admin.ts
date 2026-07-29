import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number
  totalSites: number
  activeSites: number
  failedSites: number
  suspendedSites: number
  slotsUsed: number
  slotsTotal: number
  revenueNgn: number
  openConversations: number
}

export interface AdminProfile {
  userId: string
  displayName: string
  accountId: string
  supportPin: string
  createdAt: string
}

export interface AdminUserSummary extends AdminProfile {
  email: string
  lastSignInAt: string | null
  siteCount: number
  planCount: number
}

export interface HostingNode {
  id: string
  cpanelUsername: string
  primaryDomain: string
  currentSlots: number
  maxSlots: number
  status: 'active' | 'full' | 'maintenance'
  createdAt: string
}

export interface AdminSiteRow {
  id: string
  userId: string
  nodeId: string
  siteDomain: string
  status: 'provisioning' | 'active' | 'suspended' | 'failed'
  plan: string
  region: string
  phpVersion: string
  diskUsedGb: number
  createdAt: string
}

export interface AdminInvoice {
  id: string
  userId: string
  description: string
  status: 'unpaid' | 'paid' | 'denied'
  dueDate: string
  totalNgn: number
  createdAt: string
}

export interface AdminPayment {
  id: string
  userId: string
  invoiceId: string | null
  transactionId: string
  paymentMethodLabel: string
  amountNgn: number
  status: 'successful' | 'failed' | 'refunded'
  paidAt: string
}

export interface AdminOrder {
  id: string
  userId: string
  orderRef: string
  product: string
  totalLabel: string
  status: 'active' | 'cancelled' | 'expired'
  orderedAt: string
}

export interface AdminCredit {
  id: string
  userId: string
  amountNgn: number
  description: string
  createdAt: string
}

export interface AdminBillingData {
  invoices: AdminInvoice[]
  payments: AdminPayment[]
  orders: AdminOrder[]
  credits: AdminCredit[]
}

export interface AdminPlanRow {
  id: string
  userId: string
  name: string
  type: 'VIP' | 'Standard' | 'Scale' | 'Launch'
  region: string
  sitesLimit: number
  priceNgnYearly: number
  renewalDate: string
  status: 'active' | 'cancelled' | 'suspended'
}

export interface AdminDomainRow {
  id: string
  userId: string
  domain: string
  tld: string
  status: 'active' | 'expired' | 'pending' | 'transferred'
  expiresAt: string
  autoRenew: boolean
  priceNgnYearly: number
}

export interface AdminDnsZoneRow {
  id: string
  userId: string
  zoneName: string
  recordCount: number
  createdAt: string
}

export interface AdminPluginRow {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  category: string
  productType: string
  tier: number
  version: string
  requiresWordpress: string
  requiresPhp: string
  priceNgn: number
  status: 'active' | 'draft'
  featured: boolean
  rating: number
  installsLabel: string
  createdAt: string
}

export interface AdminPurchaseRow {
  id: string
  userId: string
  pluginId: string
  pluginName: string
  licenseKey: string
  amountPaidNgn: number
  acquisition: string
  downloadCount: number
  status: 'active' | 'refunded' | 'revoked'
  createdAt: string
}

export interface AuditEntry {
  id: string
  adminUserId: string
  action: string
  targetType: string | null
  targetId: string | null
  payload: Record<string, unknown>
  createdAt: string
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function mapNode(r: Row): HostingNode {
  return {
    id: r.id as string,
    cpanelUsername: r.cpanel_username as string,
    primaryDomain: r.primary_domain as string,
    currentSlots: Number(r.current_slots),
    maxSlots: Number(r.max_slots),
    status: r.status as HostingNode['status'],
    createdAt: r.created_at as string,
  }
}

function mapSite(r: Row): AdminSiteRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    nodeId: r.node_id as string,
    siteDomain: r.site_domain as string,
    status: r.status as AdminSiteRow['status'],
    plan: r.plan as string,
    region: r.region as string,
    phpVersion: r.php_version as string,
    diskUsedGb: Number(r.disk_used_gb),
    createdAt: r.created_at as string,
  }
}

function mapProfile(r: Row): AdminProfile {
  return {
    userId: r.user_id as string,
    displayName: r.display_name as string,
    accountId: r.account_id as string,
    supportPin: r.support_pin as string,
    createdAt: r.created_at as string,
  }
}

function mapAudit(r: Row): AuditEntry {
  return {
    id: r.id as string,
    adminUserId: r.admin_user_id as string,
    action: r.action as string,
    targetType: r.target_type as string | null,
    targetId: r.target_id as string | null,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    createdAt: r.created_at as string,
  }
}

// ─── Fetchers (admin RLS SELECT policies authorize these) ───────────────────

export async function fetchAdminStats(supabase: SupabaseClient): Promise<AdminStats> {
  const [profilesRes, sitesRes, nodesRes, paymentsRes] = await Promise.all([
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
    supabase.from('user_sites').select('status'),
    supabase.from('hosting_nodes').select('current_slots, max_slots'),
    supabase.from('payments').select('amount_ngn, status'),
  ])

  if (profilesRes.error) throw profilesRes.error
  if (sitesRes.error) throw sitesRes.error
  if (nodesRes.error) throw nodesRes.error
  if (paymentsRes.error) throw paymentsRes.error

  const siteStatuses = (sitesRes.data ?? []).map((r: Row) => r.status as string)
  const nodes = nodesRes.data ?? []
  const revenueNgn = (paymentsRes.data ?? [])
    .filter((r: Row) => r.status === 'successful')
    .reduce((sum: number, r: Row) => sum + Number(r.amount_ngn), 0)

  // Support tables arrive with migration 003; tolerate their absence.
  let openConversations = 0
  try {
    const convRes = await supabase
      .from('support_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
    if (!convRes.error) openConversations = convRes.count ?? 0
  } catch {
    openConversations = 0
  }

  return {
    totalUsers: profilesRes.count ?? 0,
    totalSites: siteStatuses.length,
    activeSites: siteStatuses.filter((s) => s === 'active').length,
    failedSites: siteStatuses.filter((s) => s === 'failed').length,
    suspendedSites: siteStatuses.filter((s) => s === 'suspended').length,
    slotsUsed: nodes.reduce((sum: number, r: Row) => sum + Number(r.current_slots), 0),
    slotsTotal: nodes.reduce((sum: number, r: Row) => sum + Number(r.max_slots), 0),
    revenueNgn,
    openConversations,
  }
}

export async function fetchAllProfiles(supabase: SupabaseClient): Promise<AdminProfile[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapProfile)
}

export async function fetchNodes(supabase: SupabaseClient): Promise<HostingNode[]> {
  const { data, error } = await supabase
    .from('hosting_nodes')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapNode)
}

export async function fetchAllSitesAdmin(supabase: SupabaseClient): Promise<AdminSiteRow[]> {
  const { data, error } = await supabase
    .from('user_sites')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapSite)
}

export async function fetchAdminBilling(supabase: SupabaseClient): Promise<AdminBillingData> {
  const [invoicesRes, paymentsRes, ordersRes, creditsRes] = await Promise.all([
    supabase.from('invoices').select('*').order('due_date', { ascending: false }),
    supabase.from('payments').select('*').order('paid_at', { ascending: false }),
    supabase.from('orders').select('*').order('ordered_at', { ascending: false }),
    supabase.from('credits').select('*').order('created_at', { ascending: false }),
  ])

  if (invoicesRes.error) throw invoicesRes.error
  if (paymentsRes.error) throw paymentsRes.error
  if (ordersRes.error) throw ordersRes.error
  if (creditsRes.error) throw creditsRes.error

  return {
    invoices: (invoicesRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      userId: r.user_id as string,
      description: r.description as string,
      status: r.status as AdminInvoice['status'],
      dueDate: r.due_date as string,
      totalNgn: Number(r.total_ngn),
      createdAt: r.created_at as string,
    })),
    payments: (paymentsRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      userId: r.user_id as string,
      invoiceId: r.invoice_id as string | null,
      transactionId: r.transaction_id as string,
      paymentMethodLabel: r.payment_method_label as string,
      amountNgn: Number(r.amount_ngn),
      status: r.status as AdminPayment['status'],
      paidAt: r.paid_at as string,
    })),
    orders: (ordersRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      userId: r.user_id as string,
      orderRef: r.order_ref as string,
      product: r.product as string,
      totalLabel: r.total_label as string,
      status: r.status as AdminOrder['status'],
      orderedAt: r.ordered_at as string,
    })),
    credits: (creditsRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      userId: r.user_id as string,
      amountNgn: Number(r.amount_ngn),
      description: r.description as string,
      createdAt: r.created_at as string,
    })),
  }
}

export async function fetchAdminPlans(supabase: SupabaseClient): Promise<AdminPlanRow[]> {
  const { data, error } = await supabase
    .from('hosting_plans')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: Row) => ({
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    type: r.type as AdminPlanRow['type'],
    region: r.region as string,
    sitesLimit: Number(r.sites_limit),
    priceNgnYearly: Number(r.price_ngn_yearly),
    renewalDate: r.renewal_date as string,
    status: r.status as AdminPlanRow['status'],
  }))
}

export async function fetchAdminDomains(supabase: SupabaseClient): Promise<AdminDomainRow[]> {
  const { data, error } = await supabase
    .from('registered_domains')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: Row) => ({
    id: r.id as string,
    userId: r.user_id as string,
    domain: r.domain as string,
    tld: r.tld as string,
    status: r.status as AdminDomainRow['status'],
    expiresAt: r.expires_at as string,
    autoRenew: r.auto_renew as boolean,
    priceNgnYearly: Number(r.price_ngn_yearly),
  }))
}

export async function fetchAdminDnsZones(supabase: SupabaseClient): Promise<AdminDnsZoneRow[]> {
  const [zonesRes, recordsRes] = await Promise.all([
    supabase.from('dns_zones').select('*').order('created_at', { ascending: false }),
    supabase.from('dns_records').select('zone_id'),
  ])
  if (zonesRes.error) throw zonesRes.error
  if (recordsRes.error) throw recordsRes.error

  const countByZone = new Map<string, number>()
  for (const record of recordsRes.data ?? []) {
    const zoneId = (record as Row).zone_id as string
    countByZone.set(zoneId, (countByZone.get(zoneId) ?? 0) + 1)
  }

  return (zonesRes.data ?? []).map((r: Row) => ({
    id: r.id as string,
    userId: r.user_id as string,
    zoneName: r.zone_name as string,
    recordCount: countByZone.get(r.id as string) ?? 0,
    createdAt: r.created_at as string,
  }))
}

export async function fetchAdminPlugins(supabase: SupabaseClient): Promise<AdminPluginRow[]> {
  const { data, error } = await supabase
    .from('marketplace_plugins')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: Row) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    tagline: r.tagline as string,
    description: r.description as string,
    category: r.category as string,
    productType: r.product_type as string,
    tier: Number(r.tier),
    version: r.version as string,
    requiresWordpress: r.requires_wordpress as string,
    requiresPhp: r.requires_php as string,
    priceNgn: Number(r.price_ngn),
    status: r.status as AdminPluginRow['status'],
    featured: r.featured as boolean,
    rating: Number(r.rating),
    installsLabel: r.installs_label as string,
    createdAt: r.created_at as string,
  }))
}

export async function fetchAdminPurchases(supabase: SupabaseClient): Promise<AdminPurchaseRow[]> {
  const { data, error } = await supabase
    .from('plugin_purchases')
    .select('*, marketplace_plugins(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r: Row) => ({
    id: r.id as string,
    userId: r.user_id as string,
    pluginId: r.plugin_id as string,
    pluginName:
      ((r.marketplace_plugins as Row | null)?.name as string | undefined) ?? 'Unknown plugin',
    licenseKey: r.license_key as string,
    amountPaidNgn: Number(r.amount_paid_ngn),
    acquisition: r.acquisition as string,
    downloadCount: Number(r.download_count),
    status: r.status as AdminPurchaseRow['status'],
    createdAt: r.created_at as string,
  }))
}

export interface AdminUserDetail {
  profile: AdminProfile | null
  sites: AdminSiteRow[]
  plans: AdminPlanRow[]
  invoices: AdminInvoice[]
  credits: AdminCredit[]
  purchases: AdminPurchaseRow[]
}

export async function fetchAdminUserDetail(
  supabase: SupabaseClient,
  userId: string,
): Promise<AdminUserDetail> {
  const [profileRes, sitesRes, plansRes, invoicesRes, creditsRes, purchasesRes] =
    await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase
        .from('user_sites')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('hosting_plans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId)
        .order('due_date', { ascending: false }),
      supabase
        .from('credits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('plugin_purchases')
        .select('*, marketplace_plugins(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ])

  if (profileRes.error) throw profileRes.error
  if (sitesRes.error) throw sitesRes.error
  if (plansRes.error) throw plansRes.error
  if (invoicesRes.error) throw invoicesRes.error
  if (creditsRes.error) throw creditsRes.error
  if (purchasesRes.error) throw purchasesRes.error

  return {
    profile: profileRes.data ? mapProfile(profileRes.data as Row) : null,
    sites: (sitesRes.data ?? []).map(mapSite),
    plans: (plansRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      userId: r.user_id as string,
      name: r.name as string,
      type: r.type as AdminPlanRow['type'],
      region: r.region as string,
      sitesLimit: Number(r.sites_limit),
      priceNgnYearly: Number(r.price_ngn_yearly),
      renewalDate: r.renewal_date as string,
      status: r.status as AdminPlanRow['status'],
    })),
    invoices: (invoicesRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      userId: r.user_id as string,
      description: r.description as string,
      status: r.status as AdminInvoice['status'],
      dueDate: r.due_date as string,
      totalNgn: Number(r.total_ngn),
      createdAt: r.created_at as string,
    })),
    credits: (creditsRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      userId: r.user_id as string,
      amountNgn: Number(r.amount_ngn),
      description: r.description as string,
      createdAt: r.created_at as string,
    })),
    purchases: (purchasesRes.data ?? []).map((r: Row) => ({
      id: r.id as string,
      userId: r.user_id as string,
      pluginId: r.plugin_id as string,
      pluginName:
        ((r.marketplace_plugins as Row | null)?.name as string | undefined) ??
        'Unknown plugin',
      licenseKey: r.license_key as string,
      amountPaidNgn: Number(r.amount_paid_ngn),
      acquisition: r.acquisition as string,
      downloadCount: Number(r.download_count),
      status: r.status as AdminPurchaseRow['status'],
      createdAt: r.created_at as string,
    })),
  }
}

export async function fetchAuditLog(supabase: SupabaseClient): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map(mapAudit)
}
