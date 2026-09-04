// POST /functions/v1/admin-actions
// Body: { action: <discriminant>, ...payload }
//
// Single privileged entry point for every admin mutation (and the one admin
// read that needs auth.users — list_users). Flow:
//   1. Resolve the caller from their JWT (anon client bound to the header).
//   2. Gate: the caller must hold the 'admin' role in user_roles. The check
//      runs with the service role so it cannot be affected by RLS drift.
//   3. Perform the action with the service role.
//   4. Append a row to admin_audit_log.
//
// Admin READS of customer tables go straight through RLS from the browser
// (see the "Admins can view …" policies in supabase/migrations/00000000000000_schema.sql) — they never pass
// through here.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'
import { presignPut } from '../_shared/r2.ts'

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_users'),
    page: z.number().int().min(1).default(1),
    perPage: z.number().int().min(1).max(200).default(50),
  }),
  z.object({
    action: z.literal('adjust_credit'),
    userId: z.string().uuid(),
    amountNgn: z.number().finite(),
    description: z.string().min(1).max(300),
  }),
  z.object({
    action: z.literal('set_site_status'),
    siteId: z.string().uuid(),
    status: z.enum(['active', 'suspended']),
  }),
  z.object({
    action: z.literal('create_node'),
    cpanelUsername: z.string().min(1).max(64),
    primaryDomain: z.string().min(3).max(255),
    maxSlots: z.number().int().min(1).max(500),
  }),
  z.object({
    action: z.literal('update_node'),
    nodeId: z.string().uuid(),
    maxSlots: z.number().int().min(1).max(500).optional(),
    status: z.enum(['active', 'maintenance']).optional(),
  }),
  z.object({
    action: z.literal('create_invoice'),
    userId: z.string().uuid(),
    description: z.string().min(1).max(300),
    totalNgn: z.number().positive(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({
    action: z.literal('set_invoice_status'),
    invoiceId: z.string().uuid(),
    status: z.enum(['paid', 'denied', 'unpaid']),
    recordPayment: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('upsert_plugin'),
    id: z.string().uuid().optional(),
    downloadAssetPath: z.string().max(500).optional(),
    slug: z.string().min(1).max(100),
    name: z.string().min(1).max(150),
    tagline: z.string().min(1).max(300),
    description: z.string().min(1),
    category: z.string().min(1).max(80),
    productType: z.enum(['plugin', 'theme']),
    tier: z.number().int().min(1).max(3),
    version: z.string().min(1).max(40),
    requiresWordpress: z.string().min(1).max(40),
    requiresPhp: z.string().min(1).max(40),
    priceNgn: z.number().min(0),
    status: z.enum(['active', 'draft']),
    featured: z.boolean().default(false),
    installsLabel: z.string().max(60).default(''),
  }),
  z.object({
    action: z.literal('set_purchase_status'),
    purchaseId: z.string().uuid(),
    status: z.enum(['active', 'revoked', 'refunded']),
  }),
  z.object({
    action: z.literal('set_conversation_status'),
    conversationId: z.string().uuid(),
    status: z.enum(['open', 'pending', 'closed']),
  }),
  z.object({
    action: z.literal('get_plugin_upload_url'),
    pluginId: z.string().uuid(),
    version: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[\w.-]+$/, 'Version may only contain letters, numbers, dots, underscores, and hyphens'),
    fileName: z.string().min(1).max(200),
    contentLength: z.number().int().positive().max(50 * 1024 * 1024),
  }),
  z.object({
    action: z.literal('upsert_service_component'),
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    description: z.string().max(500).default(''),
    status: z.enum([
      'operational',
      'degraded',
      'partial_outage',
      'major_outage',
      'maintenance',
    ]),
    sortOrder: z.number().int().min(0).max(999).default(0),
    published: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('delete_service_component'),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('upsert_maintenance_window'),
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(2_000),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    published: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('delete_maintenance_window'),
    id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('upsert_kb_article'),
    id: z.string().uuid().optional(),
    // Reaches /kb/:slug as a route param, so restrict it to a safe shape.
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1).max(160),
    category: z.string().min(1).max(80),
    // Capped so a runaway paste cannot bloat every dashboard fetch.
    bodyMarkdown: z.string().min(1).max(50_000),
    sortOrder: z.number().int().min(0).max(999).default(0),
    published: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('delete_kb_article'),
    id: z.string().uuid(),
  }),
])

type ActionBody = z.infer<typeof bodySchema>

interface ActionOutcome {
  data: unknown
  targetType: string | null
  targetId: string | null
}

function ok(data: unknown, targetType: string | null, targetId: string | null): ActionOutcome {
  return { data, targetType, targetId }
}

class ActionError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function listUsers(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'list_users' }>,
): Promise<ActionOutcome> {
  const { data, error } = await admin.auth.admin.listUsers({
    page: body.page,
    perPage: body.perPage,
  })
  if (error) throw new ActionError(`Unable to list users: ${error.message}`, 500)

  const userIds = data.users.map((u) => u.id)

  const [profilesRes, sitesRes, plansRes] = await Promise.all([
    admin.from('user_profiles').select('*').in('user_id', userIds),
    admin.from('user_sites').select('user_id').in('user_id', userIds),
    admin.from('hosting_plans').select('user_id').in('user_id', userIds),
  ])
  if (profilesRes.error) throw new ActionError(profilesRes.error.message, 500)
  if (sitesRes.error) throw new ActionError(sitesRes.error.message, 500)
  if (plansRes.error) throw new ActionError(plansRes.error.message, 500)

  const profileByUser = new Map(
    (profilesRes.data ?? []).map((p) => [p.user_id as string, p]),
  )
  const countBy = (rows: { user_id: string }[]) => {
    const map = new Map<string, number>()
    for (const row of rows) map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1)
    return map
  }
  const siteCounts = countBy((sitesRes.data ?? []) as { user_id: string }[])
  const planCounts = countBy((plansRes.data ?? []) as { user_id: string }[])

  const users = data.users.map((u) => {
    const profile = profileByUser.get(u.id)
    return {
      userId: u.id,
      email: u.email ?? '',
      displayName: (profile?.display_name as string | undefined) ?? '',
      accountId: (profile?.account_id as string | undefined) ?? '',
      supportPin: (profile?.support_pin as string | undefined) ?? '',
      avatarUrl: (profile?.avatar_url as string | undefined) ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      siteCount: siteCounts.get(u.id) ?? 0,
      planCount: planCounts.get(u.id) ?? 0,
    }
  })

  // list_users is a read — callers treat it as such; no audit row is
  // written for it (see the auditableActions set below).
  return ok({ users, total: data.total ?? users.length }, null, null)
}

async function adjustCredit(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'adjust_credit' }>,
): Promise<ActionOutcome> {
  const { data, error } = await admin
    .from('credits')
    .insert({
      user_id: body.userId,
      amount_ngn: body.amountNgn,
      description: body.description,
    })
    .select()
    .single()
  if (error) throw new ActionError(`Unable to record credit: ${error.message}`, 500)
  return ok({ credit: data }, 'user', body.userId)
}

async function setSiteStatus(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'set_site_status' }>,
): Promise<ActionOutcome> {
  const { data, error } = await admin
    .from('user_sites')
    .update({ status: body.status })
    .eq('id', body.siteId)
    .select('id, site_domain, status')
    .single()
  if (error) throw new ActionError(`Unable to update site: ${error.message}`, 500)
  if (!data) throw new ActionError('Site not found', 404)
  return ok({ site: data }, 'site', body.siteId)
}

async function configureNodeOnWhm(cpanelUsername: string): Promise<{ ok: boolean; reason: string }> {
  const whmHost = Deno.env.get('WHM_HOST') ?? ''
  const whmPort = Deno.env.get('WHM_PORT') ?? '2087'
  const whmUser = Deno.env.get('WHM_API_USERNAME') ?? ''
  const whmToken = Deno.env.get('WHM_MASTER_TOKEN') ?? ''
  const mock = (Deno.env.get('MOCK_WHM_REQUESTS') ?? 'false').toLowerCase() === 'true'

  if (mock) return { ok: true, reason: 'mock' }
  if (!whmHost || !whmToken) return { ok: false, reason: 'WHM credentials not configured' }

  const cleanHost = whmHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim()
  const params = new URLSearchParams({
    'api.version': '1',
    user: cpanelUsername,
    MAXADDON: 'unlimited',
    MAXSUB: 'unlimited',
    MAXFTP: 'unlimited',
    MAXPOP: 'unlimited',
    MAXSQL: 'unlimited',
    MAXLST: 'unlimited',
    MAXPARK: 'unlimited',
  })
  const url = `https://${cleanHost}:${whmPort}/json-api/modifyacct?${params.toString()}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `whm ${whmUser}:${whmToken}`,
        Accept: 'application/json',
      },
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    const meta = body?.metadata as Record<string, unknown> | undefined
    if (!response.ok || meta?.result !== 1) {
      const reason = (meta?.reason as string) ?? `HTTP ${response.status}`
      return { ok: false, reason }
    }
    return { ok: true, reason: meta?.reason as string ?? 'OK' }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

async function createNode(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'create_node' }>,
): Promise<ActionOutcome> {
  // 1. Persist the node record first so we get an ID even if WHM config is
  //    a soft failure (the admin can retry the WHM step manually if needed).
  const { data, error } = await admin
    .from('hosting_nodes')
    .insert({
      cpanel_username: body.cpanelUsername,
      primary_domain: body.primaryDomain,
      max_slots: body.maxSlots,
      current_slots: 0,
      status: 'active',
    })
    .select()
    .single()
  if (error) {
    const status = error.message.includes('duplicate') ? 409 : 500
    throw new ActionError(`Unable to create node: ${error.message}`, status)
  }

  // 2. Apply unlimited resource limits to the cPanel account on WHM so that
  //    provisioning can create addon domains without hitting quota errors.
  const whmResult = await configureNodeOnWhm(body.cpanelUsername)
  if (!whmResult.ok) {
    console.warn(
      `createNode: WHM modifyacct for "${body.cpanelUsername}" failed — ${whmResult.reason}. ` +
      `Node was saved to DB but you must manually set unlimited addon domains in WHM.`,
    )
  }

  return ok({ node: data, whmConfigured: whmResult.ok, whmReason: whmResult.reason }, 'node', data.id as string)
}

async function updateNode(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'update_node' }>,
): Promise<ActionOutcome> {
  const { data: node, error } = await admin
    .from('hosting_nodes')
    .select('id, current_slots, max_slots, status')
    .eq('id', body.nodeId)
    .single()
  if (error || !node) throw new ActionError('Node not found', 404)

  const nextMax = body.maxSlots ?? Number(node.max_slots)
  if (nextMax < Number(node.current_slots)) {
    throw new ActionError(
      `max_slots (${nextMax}) cannot be below current usage (${node.current_slots})`,
      400,
    )
  }

  // 'full' is machine-owned by allocate_hosting_node(); admins only toggle
  // active/maintenance. Re-activating a node already at capacity lands on
  // 'full' so the status/slots CHECK constraint holds.
  let nextStatus = body.status ?? (node.status as string)
  if (nextStatus === 'active' && Number(node.current_slots) >= nextMax) {
    nextStatus = 'full'
  }
  if (nextStatus === 'full' && Number(node.current_slots) < nextMax) {
    nextStatus = 'active'
  }

  const { data: updated, error: updateError } = await admin
    .from('hosting_nodes')
    .update({ max_slots: nextMax, status: nextStatus })
    .eq('id', body.nodeId)
    .select()
    .single()
  if (updateError) {
    throw new ActionError(`Unable to update node: ${updateError.message}`, 500)
  }
  return ok({ node: updated }, 'node', body.nodeId)
}

async function createInvoice(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'create_invoice' }>,
): Promise<ActionOutcome> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      user_id: body.userId,
      description: body.description,
      total_ngn: body.totalNgn,
      due_date: body.dueDate,
      status: 'unpaid',
    })
    .select()
    .single()
  if (error) throw new ActionError(`Unable to create invoice: ${error.message}`, 500)
  return ok({ invoice: data }, 'invoice', data.id as string)
}

async function setInvoiceStatus(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'set_invoice_status' }>,
): Promise<ActionOutcome> {
  const { data: invoice, error } = await admin
    .from('invoices')
    .select('id, user_id, status, total_ngn')
    .eq('id', body.invoiceId)
    .single()
  if (error || !invoice) throw new ActionError('Invoice not found', 404)

  if (body.status === 'paid' && body.recordPayment && invoice.status !== 'paid') {
    // Manual settlement (e.g. bank transfer). transaction_id stays unique so
    // this can never collide with a Paystack reference.
    const { error: paymentError } = await admin.from('payments').insert({
      user_id: invoice.user_id,
      invoice_id: invoice.id,
      transaction_id: `manual-${crypto.randomUUID()}`,
      payment_method_label: 'Manual settlement (admin)',
      amount_ngn: Number(invoice.total_ngn),
      status: 'successful',
    })
    if (paymentError) {
      throw new ActionError(`Unable to record payment: ${paymentError.message}`, 500)
    }
  }

  const { data: updated, error: updateError } = await admin
    .from('invoices')
    .update({ status: body.status })
    .eq('id', body.invoiceId)
    .select()
    .single()
  if (updateError) {
    throw new ActionError(`Unable to update invoice: ${updateError.message}`, 500)
  }
  return ok({ invoice: updated }, 'invoice', body.invoiceId)
}

async function upsertPlugin(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'upsert_plugin' }>,
): Promise<ActionOutcome> {
  const row = {
    slug: body.slug,
    name: body.name,
    tagline: body.tagline,
    description: body.description,
    category: body.category,
    product_type: body.productType,
    tier: body.tier,
    version: body.version,
    requires_wordpress: body.requiresWordpress,
    requires_php: body.requiresPhp,
    price_ngn: body.priceNgn,
    status: body.status,
    featured: body.featured,
    installs_label: body.installsLabel,
    download_asset_path: body.downloadAssetPath ?? null,
  }

  const query = body.id
    ? admin.from('marketplace_plugins').update(row).eq('id', body.id)
    : admin.from('marketplace_plugins').insert(row)

  const { data, error } = await query.select().single()
  if (error) {
    const status = error.message.includes('duplicate') ? 409 : 500
    throw new ActionError(`Unable to save marketplace item: ${error.message}`, status)
  }
  return ok({ plugin: data }, 'plugin', data.id as string)
}

async function setPurchaseStatus(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'set_purchase_status' }>,
): Promise<ActionOutcome> {
  const { data, error } = await admin
    .from('plugin_purchases')
    .update({ status: body.status })
    .eq('id', body.purchaseId)
    .select('id, user_id, plugin_id, status')
    .single()
  if (error) throw new ActionError(`Unable to update license: ${error.message}`, 500)
  if (!data) throw new ActionError('License not found', 404)
  return ok({ purchase: data }, 'purchase', body.purchaseId)
}

async function setConversationStatus(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'set_conversation_status' }>,
): Promise<ActionOutcome> {
  const { data, error } = await admin
    .from('support_conversations')
    .update({ status: body.status })
    .eq('id', body.conversationId)
    .select('id, status')
    .single()
  if (error) throw new ActionError(`Unable to update conversation: ${error.message}`, 500)
  if (!data) throw new ActionError('Conversation not found', 404)
  return ok({ conversation: data }, 'conversation', body.conversationId)
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
}

async function getPluginUploadUrl(
  body: Extract<ActionBody, { action: 'get_plugin_upload_url' }>,
): Promise<ActionOutcome> {
  const bucket = Deno.env.get('R2_PRIVATE_BUCKET')
  if (!bucket) throw new ActionError('R2_PRIVATE_BUCKET is not configured', 500)

  const key = `plugins/${body.pluginId}/${body.version}/${sanitizeFileName(body.fileName)}`
  const uploadUrl = await presignPut(bucket, key, 'application/zip', body.contentLength, 600)
  return ok({ uploadUrl, key }, 'plugin', body.pluginId)
}

async function upsertServiceComponent(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'upsert_service_component' }>,
): Promise<ActionOutcome> {
  const row = {
    name: body.name,
    description: body.description,
    status: body.status,
    sort_order: body.sortOrder,
    published: body.published,
  }

  const query = body.id
    ? admin.from('service_components').update(row).eq('id', body.id)
    : admin.from('service_components').insert(row)

  const { data, error } = await query.select().single()
  if (error) {
    const status = error.message.includes('duplicate') ? 409 : 500
    throw new ActionError(`Unable to save service component: ${error.message}`, status)
  }

  return ok(data, 'service_component', (data as { id: string }).id)
}

async function deleteServiceComponent(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'delete_service_component' }>,
): Promise<ActionOutcome> {
  const { error } = await admin.from('service_components').delete().eq('id', body.id)
  if (error) throw new ActionError(`Unable to delete service component: ${error.message}`, 500)
  return ok({ id: body.id }, 'service_component', body.id)
}

async function upsertMaintenanceWindow(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'upsert_maintenance_window' }>,
): Promise<ActionOutcome> {
  if (new Date(body.endsAt) <= new Date(body.startsAt)) {
    throw new ActionError('The maintenance window must end after it starts', 400)
  }

  const row = {
    title: body.title,
    body: body.body,
    starts_at: body.startsAt,
    ends_at: body.endsAt,
    published: body.published,
  }

  const query = body.id
    ? admin.from('maintenance_windows').update(row).eq('id', body.id)
    : admin.from('maintenance_windows').insert(row)

  const { data, error } = await query.select().single()
  if (error) throw new ActionError(`Unable to save maintenance window: ${error.message}`, 500)

  return ok(data, 'maintenance_window', (data as { id: string }).id)
}

async function deleteMaintenanceWindow(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'delete_maintenance_window' }>,
): Promise<ActionOutcome> {
  const { error } = await admin.from('maintenance_windows').delete().eq('id', body.id)
  if (error) throw new ActionError(`Unable to delete maintenance window: ${error.message}`, 500)
  return ok({ id: body.id }, 'maintenance_window', body.id)
}

async function upsertKbArticle(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'upsert_kb_article' }>,
): Promise<ActionOutcome> {
  const row = {
    slug: body.slug,
    title: body.title,
    category: body.category,
    body_markdown: body.bodyMarkdown,
    sort_order: body.sortOrder,
    published: body.published,
  }

  const query = body.id
    ? admin.from('kb_articles').update(row).eq('id', body.id)
    : admin.from('kb_articles').insert(row)

  const { data, error } = await query.select().single()
  if (error) {
    const status = error.message.includes('duplicate') ? 409 : 500
    throw new ActionError(`Unable to save article: ${error.message}`, status)
  }

  return ok(data, 'kb_article', (data as { id: string }).id)
}

async function deleteKbArticle(
  admin: SupabaseClient,
  body: Extract<ActionBody, { action: 'delete_kb_article' }>,
): Promise<ActionOutcome> {
  const { error } = await admin.from('kb_articles').delete().eq('id', body.id)
  if (error) throw new ActionError(`Unable to delete article: ${error.message}`, 500)
  return ok({ id: body.id }, 'kb_article', body.id)
}

// Reads are exempt from the audit log.
const auditableActions = new Set<ActionBody['action']>([
  'adjust_credit',
  'set_site_status',
  'create_node',
  'update_node',
  'create_invoice',
  'set_invoice_status',
  'upsert_plugin',
  'set_purchase_status',
  'set_conversation_status',
  'get_plugin_upload_url',
  'upsert_service_component',
  'delete_service_component',
  'upsert_maintenance_window',
  'delete_maintenance_window',
  'upsert_kb_article',
  'delete_kb_article',
])

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('Missing Authorization header', 401)
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()

  if (userError || !user) {
    return errorResponse('Invalid or expired session', 401)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: roleRows, error: roleError } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .limit(1)

  if (roleError) {
    console.error('role lookup failed:', roleError)
    return errorResponse('Unable to verify permissions', 500)
  }
  if (!roleRows || roleRows.length === 0) {
    return errorResponse('Admin role required', 403)
  }

  let body: ActionBody
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  let outcome: ActionOutcome
  try {
    switch (body.action) {
      case 'list_users':
        outcome = await listUsers(admin, body)
        break
      case 'adjust_credit':
        outcome = await adjustCredit(admin, body)
        break
      case 'set_site_status':
        outcome = await setSiteStatus(admin, body)
        break
      case 'create_node':
        outcome = await createNode(admin, body)
        break
      case 'update_node':
        outcome = await updateNode(admin, body)
        break
      case 'create_invoice':
        outcome = await createInvoice(admin, body)
        break
      case 'set_invoice_status':
        outcome = await setInvoiceStatus(admin, body)
        break
      case 'upsert_plugin':
        outcome = await upsertPlugin(admin, body)
        break
      case 'set_purchase_status':
        outcome = await setPurchaseStatus(admin, body)
        break
      case 'set_conversation_status':
        outcome = await setConversationStatus(admin, body)
        break
      case 'get_plugin_upload_url':
        outcome = await getPluginUploadUrl(body)
        break
      case 'upsert_service_component':
        outcome = await upsertServiceComponent(admin, body)
        break
      case 'delete_service_component':
        outcome = await deleteServiceComponent(admin, body)
        break
      case 'upsert_maintenance_window':
        outcome = await upsertMaintenanceWindow(admin, body)
        break
      case 'delete_maintenance_window':
        outcome = await deleteMaintenanceWindow(admin, body)
        break
      case 'upsert_kb_article':
        outcome = await upsertKbArticle(admin, body)
        break
      case 'delete_kb_article':
        outcome = await deleteKbArticle(admin, body)
        break
    }
  } catch (error) {
    if (error instanceof ActionError) {
      return errorResponse(error.message, error.status)
    }
    console.error(`admin action ${body.action} failed:`, error)
    return errorResponse('Admin action failed', 500)
  }

  if (auditableActions.has(body.action)) {
    const { action, ...payload } = body
    const { error: auditError } = await admin.from('admin_audit_log').insert({
      admin_user_id: user.id,
      action,
      target_type: outcome.targetType,
      target_id: outcome.targetId,
      payload,
    })
    if (auditError) {
      // The action already succeeded; log loudly but do not fail the call.
      console.error('audit log insert failed:', auditError)
    }
  }

  return jsonResponse({ success: true, data: outcome.data })
})
