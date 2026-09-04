// WHM/cPanel provisioning pipeline. Runs inside Supabase Edge Functions (Deno)
// with the service-role key — never ship this to the browser.
//
// Pipeline:
//   1. allocate-node      → rpc allocate_hosting_node() (atomic slot claim)
//   2. create-domain      → WHM AddonDomain::addaddondomain
//   3. create-database    → WHM Mysql::create_database
//   4. create-user        → WHM Mysql::create_user
//   5. grant-privileges   → WHM Mysql::set_privileges_on_database
//   6. complete           → insert user_sites row
//
// On failure the completed WHM steps are rolled back best-effort and the
// allocated slot is released via rpc release_hosting_node().

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HostingNodeRecord {
  id: string
  cpanel_username: string
  primary_domain: string
  current_slots: number
  max_slots: number
  status: 'active' | 'full'
}

export interface ProvisionedSiteRecord {
  id: string
  user_id: string
  node_id: string
  site_domain: string
  db_name: string
  db_user: string
  document_root: string
  status: string
  created_at: string
  updated_at: string
}

export type ProvisioningStepId =
  | 'select-node'
  | 'create-domain'
  | 'create-database'
  | 'create-user'
  | 'grant-privileges'
  | 'install-wordpress'
  | 'setup-nodejs-app'
  | 'enable-ssl'
  | 'complete'

export type ProvisioningStepState =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'

export interface ProvisioningStep {
  id: ProvisioningStepId
  label: string
  description: string
  state: ProvisioningStepState
}

export interface ProvisionSiteInput {
  userId: string
  siteDomain: string
  siteType?: 'wordpress' | 'nextjs' | 'static' | 'nodejs'
  database?: 'none' | 'mysql' | 'postgresql'
}

export interface ProvisionSiteResult {
  site: ProvisionedSiteRecord
  steps: ProvisioningStep[]
  nodeSummary: {
    primaryDomain: string
    currentSlots: number
    maxSlots: number
  }
}

export class ProvisioningError extends Error {
  readonly steps: ProvisioningStep[]

  constructor(message: string, steps: ProvisioningStep[]) {
    super(message)
    this.name = 'ProvisioningError'
    this.steps = steps
  }
}

// ─── Environment ──────────────────────────────────────────────────────────────

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WHM_HOST: z.string().min(1),
  WHM_PORT: z.coerce.number().int().positive().default(2087),
  WHM_API_USERNAME: z.string().min(1).default('root'),
  WHM_MASTER_TOKEN: z.string().min(1),
  APP_ENV: z.enum(['development', 'test', 'production']).default('production'),
  MOCK_WHM_REQUESTS: z.string().default('false'),
  WORDPRESS_INSTALLER_URL: z.string().url().optional(),
  WORDPRESS_INSTALLER_TOKEN: z.string().min(20).optional(),
})

type ProvisionerEnv = z.infer<typeof envSchema>

export type EnvSource = Record<string, string | undefined>

export function loadProvisionerEnv(source: EnvSource): ProvisionerEnv {
  return envSchema.parse(source)
}

export function createSupabaseAdminClient(env: ProvisionerEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ─── WHM request plumbing ─────────────────────────────────────────────────────

const requestPath = '/json-api/cpanel'

interface WhmCallDefinition {
  name: string
  query: Record<string, string>
}

export interface WhmRequest {
  name: string
  method: 'GET'
  url: string
  headers: Record<string, string>
  query: Record<string, string>
}

export interface WhmResponse {
  ok: boolean
  status: number
  body: Record<string, unknown>
}

export type WhmRequestExecutor = (request: WhmRequest) => Promise<WhmResponse>

function buildWhmUrl(env: ProvisionerEnv, query: Record<string, string>) {
  const cleanHost = env.WHM_HOST.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim()
  const url = new URL(`https://${cleanHost}:${env.WHM_PORT}${requestPath}`)
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

function buildWhmHeaders(env: ProvisionerEnv) {
  return {
    Authorization: `whm ${env.WHM_API_USERNAME}:${env.WHM_MASTER_TOKEN}`,
    Accept: 'application/json',
  }
}

export function createFetchWhmExecutor(): WhmRequestExecutor {
  return async (request) => {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
      })
      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      return { ok: response.ok, status: response.status, body }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Real WHM fetch request ${request.name} failed:`, msg)
      return {
        ok: false,
        status: 502,
        body: { error: `Unable to connect to WHM server on node (Port 2087): ${msg}` },
      }
    }
  }
}

export function createMockWhmExecutor(latencyMs = 120): WhmRequestExecutor {
  return async (request) => {
    await new Promise((resolve) => setTimeout(resolve, latencyMs))

    const shouldFail = Object.values(request.query).some((value) =>
      value.toLowerCase().includes('fail'),
    )

    if (shouldFail) {
      return {
        ok: false,
        status: 422,
        body: {
          metadata: {
            reason: `Mocked failure for ${request.name}`,
            result: 0,
            version: 1,
          },
        },
      }
    }

    return {
      ok: true,
      status: 200,
      body: {
        metadata: { command: 'cpanel', reason: 'OK', result: 1, version: 1 },
      },
    }
  }
}

async function executeWhmCall(
  env: ProvisionerEnv,
  executor: WhmRequestExecutor,
  call: WhmCallDefinition,
) {
  const request: WhmRequest = {
    name: call.name,
    method: 'GET',
    url: buildWhmUrl(env, call.query),
    headers: buildWhmHeaders(env),
    query: call.query,
  }

  const response = await executor(request)

  if (!response.ok) {
    const errorDetail = (response.body?.error as string) || (response.body?.reason as string) || `HTTP ${response.status}`
    throw new Error(`${call.name} failed: ${errorDetail}`)
  }

  const cpanelResult = (response.body?.cpanelresult as Record<string, unknown>) || response.body
  if (cpanelResult?.error && typeof cpanelResult.error === 'string') {
    throw new Error(`${call.name} error: ${cpanelResult.error}`)
  }

  return response.body
}

// ─── Naming helpers ───────────────────────────────────────────────────────────

function sanitizeDomain(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
}

function toIdentifier(value: string) {
  return value.replace(/[^a-z0-9]/g, '')
}

function toRelativeDocumentRoot(domain: string) {
  return `maxmark_sites/${sanitizeDomain(domain)}`
}

function toAbsoluteDocumentRoot(domain: string) {
  return `/maxmark_sites/${sanitizeDomain(domain)}`
}

function buildAddonSubdomain(node: HostingNodeRecord, siteDomain: string) {
  const label = toIdentifier(siteDomain).slice(0, 24) || 'site'
  return `${label}.${node.primary_domain}`
}

function withCpanelPrefix(
  cpanelUsername: string,
  name: string,
  maxLength: number,
) {
  const prefix = `${cpanelUsername.toLowerCase().slice(0, 8)}_`
  const trimmed = toIdentifier(name).slice(
    0,
    Math.max(1, maxLength - prefix.length),
  )
  return `${prefix}${trimmed}`
}

function buildDatabaseNames(node: HostingNodeRecord, siteDomain: string) {
  const rawBase = toIdentifier(siteDomain).slice(0, 24) || 'wpsite'
  const rawDatabaseName = rawBase.slice(0, 12)
  const rawDatabaseUser = `${rawBase.slice(0, 8)}usr`

  return {
    rawDatabaseName,
    rawDatabaseUser,
    fullDatabaseName: withCpanelPrefix(node.cpanel_username, rawDatabaseName, 32),
    fullDatabaseUser: withCpanelPrefix(node.cpanel_username, rawDatabaseUser, 32),
  }
}

function generateDatabasePassword() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ─── WHM call builders ────────────────────────────────────────────────────────

function buildAddonDomainCall(
  node: HostingNodeRecord,
  siteDomain: string,
): WhmCallDefinition {
  return {
    name: 'AddonDomain::addaddondomain',
    query: {
      cpanel_jsonapi_user: node.cpanel_username.toLowerCase(),
      cpanel_jsonapi_apiversion: '2',
      cpanel_jsonapi_module: 'AddonDomain',
      cpanel_jsonapi_func: 'addaddondomain',
      dir: toRelativeDocumentRoot(siteDomain),
      newdomain: sanitizeDomain(siteDomain),
      subdomain: buildAddonSubdomain(node, siteDomain),
      ftp_is_optional: '1',
    },
  }
}

function buildDelAddonDomainCall(
  node: HostingNodeRecord,
  siteDomain: string,
): WhmCallDefinition {
  return {
    name: 'AddonDomain::deladdondomain',
    query: {
      cpanel_jsonapi_user: node.cpanel_username.toLowerCase(),
      cpanel_jsonapi_apiversion: '2',
      cpanel_jsonapi_module: 'AddonDomain',
      cpanel_jsonapi_func: 'deladdondomain',
      domain: sanitizeDomain(siteDomain),
      subdomain: buildAddonSubdomain(node, siteDomain),
    },
  }
}

function buildMysqlCall(
  node: HostingNodeRecord,
  func:
    | 'create_database'
    | 'create_user'
    | 'set_privileges_on_database'
    | 'delete_database'
    | 'delete_user',
  query: Record<string, string>,
): WhmCallDefinition {
  return {
    name: `Mysql::${func}`,
    query: {
      cpanel_jsonapi_user: node.cpanel_username.toLowerCase(),
      cpanel_jsonapi_apiversion: '3',
      cpanel_jsonapi_module: 'Mysql',
      cpanel_jsonapi_func: func,
      ...query,
    },
  }
}

function buildPostgresqlCall(
  node: HostingNodeRecord,
  func:
    | 'create_database'
    | 'create_user'
    | 'grant_all_privileges'
    | 'delete_database'
    | 'delete_user',
  query: Record<string, string>,
): WhmCallDefinition {
  return {
    name: `Postgresql::${func}`,
    query: {
      cpanel_jsonapi_user: node.cpanel_username.toLowerCase(),
      cpanel_jsonapi_apiversion: '3',
      cpanel_jsonapi_module: 'Postgresql',
      cpanel_jsonapi_func: func,
      ...query,
    },
  }
}

function buildAutoSslCall(node: HostingNodeRecord): WhmCallDefinition {
  return {
    name: 'SSL::start_autossl_check',
    query: {
      cpanel_jsonapi_user: node.cpanel_username.toLowerCase(),
      cpanel_jsonapi_apiversion: '3',
      cpanel_jsonapi_module: 'SSL',
      cpanel_jsonapi_func: 'start_autossl_check',
    },
  }
}

async function callWordPressInstaller(
  env: ProvisionerEnv,
  action: 'install' | 'remove',
  input: Record<string, string>,
) {
  if (env.MOCK_WHM_REQUESTS.toLowerCase() === 'true') return
  if (!env.WORDPRESS_INSTALLER_URL || !env.WORDPRESS_INSTALLER_TOKEN) {
    console.warn('WORDPRESS_INSTALLER_URL not configured. Skipping external installer step.')
    return
  }
  const url = new URL(env.WORDPRESS_INSTALLER_URL)
  if (url.protocol !== 'https:') throw new Error('The WordPress installer must use HTTPS.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WORDPRESS_INSTALLER_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...input }),
      signal: controller.signal,
    })
    const result = await response.json().catch(() => ({})) as { success?: boolean }
    if (!response.ok || result.success !== true) {
      throw new Error(`WordPress installer rejected the ${action} request.`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Step tracking ────────────────────────────────────────────────────────────

function createSteps(): ProvisioningStep[] {
  return [
    {
      id: 'select-node',
      label: 'Selecting an available node',
      description: 'Claiming a slot on the least-loaded active cPanel account.',
      state: 'pending',
    },
    {
      id: 'create-domain',
      label: 'Creating isolated domain root',
      description: "Provisioning the addon domain inside Maxmark's site root.",
      state: 'pending',
    },
    {
      id: 'create-database',
      label: 'Creating MySQL database',
      description: 'Allocating the WordPress database on the chosen node.',
      state: 'pending',
    },
    {
      id: 'create-user',
      label: 'Creating MySQL user',
      description: 'Generating a dedicated MySQL identity for the new site.',
      state: 'pending',
    },
    {
      id: 'grant-privileges',
      label: 'Granting database privileges',
      description: 'Applying the privilege set required by WordPress.',
      state: 'pending',
    },
    {
      id: 'install-wordpress',
      label: 'Installing WordPress',
      description: 'Writing WordPress core and connecting the isolated database.',
      state: 'pending',
    },
    {
      id: 'enable-ssl',
      label: 'Starting AutoSSL',
      description: 'Requesting certificate validation through cPanel AutoSSL.',
      state: 'pending',
    },
    {
      id: 'complete',
      label: 'Finalizing site record',
      description: 'Recording the finished site inside Supabase.',
      state: 'pending',
    },
  ]
}

function setStep(
  steps: ProvisioningStep[],
  id: ProvisioningStepId,
  state: ProvisioningStepState,
) {
  return steps.map((step) => (step.id === id ? { ...step, state } : step))
}

// ─── Node allocation ──────────────────────────────────────────────────────────

async function reserveSiteCapacity(
  supabase: SupabaseClient,
  userId: string,
  siteDomain: string,
): Promise<{ reservationId: string; node: HostingNodeRecord }> {
  const { data, error } = await supabase.rpc('reserve_site_capacity', {
    target_user_id: userId,
    target_site_domain: siteDomain,
  })

  if (error) {
    throw new Error(error.message || 'Unable to reserve hosting capacity.')
  }

  return data as { reservationId: string; node: HostingNodeRecord }
}

async function releaseSiteReservation(
  supabase: SupabaseClient,
  reservationId: string,
  userId: string,
) {
  const { error } = await supabase.rpc('release_site_reservation', {
    target_reservation_id: reservationId,
    target_user_id: userId,
  })

  if (error) {
    console.error(`release_site_reservation(${reservationId}) failed: ${error.message}`)
  }
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export interface ProvisionerDependencies {
  env: EnvSource
  supabase?: SupabaseClient
  executor?: WhmRequestExecutor
}

export async function provisionWordPressSite(
  input: ProvisionSiteInput,
  dependencies: ProvisionerDependencies,
): Promise<ProvisionSiteResult> {
  const env = loadProvisionerEnv(dependencies.env)
  const supabase = dependencies.supabase ?? createSupabaseAdminClient(env)
  const executor = dependencies.executor ?? createFetchWhmExecutor()

  let steps = createSteps()
  let node: HostingNodeRecord | null = null
  let reservationId: string | null = null
  let wordpressInstalled = false
  const rollbackCalls: WhmCallDefinition[] = []
  let currentStep: ProvisioningStepId = 'select-node'

  try {
    steps = setStep(steps, 'select-node', 'in_progress')
    const reservation = await reserveSiteCapacity(
      supabase,
      input.userId,
      sanitizeDomain(input.siteDomain),
    )
    node = reservation.node
    reservationId = reservation.reservationId
    steps = setStep(steps, 'select-node', 'completed')

    const normalizedDomain = sanitizeDomain(input.siteDomain)
    const databasePassword = generateDatabasePassword()
    const names = buildDatabaseNames(node, normalizedDomain)

    currentStep = 'create-domain'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(env, executor, buildAddonDomainCall(node, normalizedDomain))
    rollbackCalls.push(buildDelAddonDomainCall(node, normalizedDomain))
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'create-database'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(
      env,
      executor,
      buildMysqlCall(node, 'create_database', {
        name: names.rawDatabaseName,
        'prefix-size': '16',
      }),
    )
    rollbackCalls.push(
      buildMysqlCall(node, 'delete_database', { name: names.fullDatabaseName }),
    )
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'create-user'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(
      env,
      executor,
      buildMysqlCall(node, 'create_user', {
        name: names.rawDatabaseUser,
        password: databasePassword,
        'prefix-size': '16',
      }),
    )
    rollbackCalls.push(
      buildMysqlCall(node, 'delete_user', { name: names.fullDatabaseUser }),
    )
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'grant-privileges'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(
      env,
      executor,
      buildMysqlCall(node, 'set_privileges_on_database', {
        database: names.fullDatabaseName,
        user: names.fullDatabaseUser,
        privileges: 'ALL PRIVILEGES',
      }),
    )
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'install-wordpress'
    steps = setStep(steps, currentStep, 'in_progress')
    await callWordPressInstaller(env, 'install', {
      domain: normalizedDomain,
      documentRoot: toAbsoluteDocumentRoot(normalizedDomain),
      databaseName: names.fullDatabaseName,
      databaseUser: names.fullDatabaseUser,
      databasePassword,
    })
    wordpressInstalled = true
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'enable-ssl'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(env, executor, buildAutoSslCall(node))
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'complete'
    steps = setStep(steps, currentStep, 'in_progress')
    const { data: insertedSite, error: insertError } = await supabase.rpc(
      'complete_site_reservation',
      {
        target_reservation_id: reservationId,
        target_user_id: input.userId,
        site_values: {
          db_name: names.fullDatabaseName,
          db_user: names.fullDatabaseUser,
          document_root: toAbsoluteDocumentRoot(normalizedDomain),
          site_type: 'wordpress',
          db_type: 'mysql',
        },
      },
    )

    if (insertError) {
      throw new Error(`Unable to persist site inventory: ${insertError.message}`)
    }
    steps = setStep(steps, currentStep, 'completed')

    return {
      site: insertedSite as ProvisionedSiteRecord,
      steps,
      nodeSummary: {
        primaryDomain: node.primary_domain,
        currentSlots: node.current_slots,
        maxSlots: node.max_slots,
      },
    }
  } catch (error) {
    steps = setStep(steps, currentStep, 'failed')

    if (wordpressInstalled) {
      try {
        await callWordPressInstaller(env, 'remove', {
          domain: sanitizeDomain(input.siteDomain),
        })
      } catch (cleanupError) {
        console.error(
          'WordPress cleanup failed:',
          cleanupError instanceof Error ? cleanupError.message : cleanupError,
        )
      }
    }

    // Best-effort rollback: undo WHM resources in reverse order, then release
    // the slot claimed by allocate_hosting_node().
    for (const call of rollbackCalls.reverse()) {
      try {
        await executeWhmCall(env, executor, call)
      } catch (rollbackError) {
        console.error(
          `Rollback ${call.name} failed:`,
          rollbackError instanceof Error ? rollbackError.message : rollbackError,
        )
      }
    }

    if (reservationId) {
      await releaseSiteReservation(supabase, reservationId, input.userId)
    }

    throw new ProvisioningError(
      error instanceof Error ? error.message : 'Provisioning failed.',
      steps,
    )
  }
}

// ─── Static-site provisioning ─────────────────────────────────────────────────
// Steps: select-node → create-domain → enable-ssl → complete
// No MySQL database or WordPress installer needed.

function createStaticSteps(): ProvisioningStep[] {
  return [
    {
      id: 'select-node',
      label: 'Selecting an available node',
      description: 'Claiming a slot on the least-loaded active cPanel account.',
      state: 'pending',
    },
    {
      id: 'create-domain',
      label: 'Creating isolated domain root',
      description: "Provisioning the addon domain and document root on the cPanel account.",
      state: 'pending',
    },
    {
      id: 'enable-ssl',
      label: 'Starting AutoSSL',
      description: 'Requesting certificate validation through cPanel AutoSSL.',
      state: 'pending',
    },
    {
      id: 'complete',
      label: 'Finalizing site record',
      description: 'Recording the finished site inside Supabase.',
      state: 'pending',
    },
  ]
}

export async function provisionStaticSite(
  input: ProvisionSiteInput,
  dependencies: ProvisionerDependencies,
): Promise<ProvisionSiteResult> {
  const env = loadProvisionerEnv(dependencies.env)
  const supabase = dependencies.supabase ?? createSupabaseAdminClient(env)
  const executor = dependencies.executor ?? createFetchWhmExecutor()

  let steps = createStaticSteps()
  let node: HostingNodeRecord | null = null
  let reservationId: string | null = null
  const rollbackCalls: WhmCallDefinition[] = []
  let currentStep: ProvisioningStepId = 'select-node'
  const siteType = input.siteType ?? 'static'

  try {
    steps = setStep(steps, 'select-node', 'in_progress')
    const reservation = await reserveSiteCapacity(
      supabase,
      input.userId,
      sanitizeDomain(input.siteDomain),
    )
    node = reservation.node
    reservationId = reservation.reservationId
    steps = setStep(steps, 'select-node', 'completed')

    const normalizedDomain = sanitizeDomain(input.siteDomain)

    currentStep = 'create-domain'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(env, executor, buildAddonDomainCall(node, normalizedDomain))
    rollbackCalls.push(buildDelAddonDomainCall(node, normalizedDomain))
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'enable-ssl'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(env, executor, buildAutoSslCall(node))
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'complete'
    steps = setStep(steps, currentStep, 'in_progress')
    const { data: insertedSite, error: insertError } = await supabase.rpc(
      'complete_site_reservation',
      {
        target_reservation_id: reservationId,
        target_user_id: input.userId,
        site_values: {
          db_name: '',
          db_user: '',
          document_root: toAbsoluteDocumentRoot(normalizedDomain),
          site_type: siteType,
        },
      },
    )

    if (insertError) {
      throw new Error(`Unable to persist site inventory: ${insertError.message}`)
    }
    steps = setStep(steps, currentStep, 'completed')

    return {
      site: insertedSite as ProvisionedSiteRecord,
      steps,
      nodeSummary: {
        primaryDomain: node.primary_domain,
        currentSlots: node.current_slots,
        maxSlots: node.max_slots,
      },
    }
  } catch (error) {
    steps = setStep(steps, currentStep, 'failed')
    for (const call of rollbackCalls.reverse()) {
      try { await executeWhmCall(env, executor, call) } catch { /* best-effort */ }
    }
    if (reservationId) {
      await releaseSiteReservation(supabase, reservationId, input.userId)
    }
    throw new ProvisioningError(
      error instanceof Error ? error.message : 'Provisioning failed.',
      steps,
    )
  }
}

// ─── Node.js / Next.js provisioning ──────────────────────────────────────────
// Steps: select-node → create-domain → setup-nodejs-app → enable-ssl → complete
// No MySQL database or WordPress installer.

function createNodeSteps(
  siteType: 'wordpress' | 'nextjs' | 'static' | 'nodejs',
  database: 'none' | 'mysql' | 'postgresql' = 'none',
): ProvisioningStep[] {
  const steps: ProvisioningStep[] = [
    {
      id: 'select-node',
      label: 'Selecting an available node',
      description: 'Claiming a slot on the least-loaded active cPanel account.',
      state: 'pending',
    },
    {
      id: 'create-domain',
      label: 'Creating isolated domain root',
      description: 'Provisioning the addon domain on the cPanel account.',
      state: 'pending',
    },
  ]

  if (database === 'mysql') {
    steps.push(
      {
        id: 'create-database',
        label: 'Creating MySQL database',
        description: 'Allocating the MySQL database on the chosen node.',
        state: 'pending',
      },
      {
        id: 'create-user',
        label: 'Creating MySQL user',
        description: 'Generating a dedicated MySQL identity for the new site.',
        state: 'pending',
      },
      {
        id: 'grant-privileges',
        label: 'Granting database privileges',
        description: 'Applying the privilege set required for MySQL.',
        state: 'pending',
      },
    )
  } else if (database === 'postgresql') {
    steps.push(
      {
        id: 'create-database',
        label: 'Creating PostgreSQL database',
        description: 'Allocating the PostgreSQL database on the chosen node.',
        state: 'pending',
      },
      {
        id: 'create-user',
        label: 'Creating PostgreSQL user',
        description: 'Generating a dedicated PostgreSQL identity for the new site.',
        state: 'pending',
      },
      {
        id: 'grant-privileges',
        label: 'Granting database privileges',
        description: 'Applying the privilege set required for PostgreSQL.',
        state: 'pending',
      },
    )
  }

  if (siteType === 'nextjs' || siteType === 'nodejs') {
    steps.push({
      id: 'setup-nodejs-app',
      label: 'Configuring Node.js runtime',
      description: 'Registering the Node.js application in cPanel App Manager.',
      state: 'pending',
    })
  }

  steps.push(
    {
      id: 'enable-ssl',
      label: 'Starting AutoSSL',
      description: 'Requesting certificate validation through cPanel AutoSSL.',
      state: 'pending',
    },
    {
      id: 'complete',
      label: 'Finalizing site record',
      description: 'Recording the finished site inside Supabase.',
      state: 'pending',
    },
  )

  return steps
}

function buildNodejsAppCall(
  node: HostingNodeRecord,
  siteDomain: string,
): WhmCallDefinition {
  return {
    name: 'NodejsApp::create',
    query: {
      cpanel_jsonapi_user: node.cpanel_username.toLowerCase(),
      cpanel_jsonapi_apiversion: '3',
      cpanel_jsonapi_module: 'NodejsApp',
      cpanel_jsonapi_func: 'create',
      domain: sanitizeDomain(siteDomain),
      app_root: toRelativeDocumentRoot(siteDomain),
      startup_file: 'server.js',
    },
  }
}

export async function provisionNodeSite(
  input: ProvisionSiteInput,
  dependencies: ProvisionerDependencies,
): Promise<ProvisionSiteResult> {
  const env = loadProvisionerEnv(dependencies.env)
  const supabase = dependencies.supabase ?? createSupabaseAdminClient(env)
  const executor = dependencies.executor ?? createFetchWhmExecutor()

  const siteType = input.siteType ?? 'nodejs'
  const database = input.database ?? 'none'
  let steps = createNodeSteps(siteType, database)
  let node: HostingNodeRecord | null = null
  let reservationId: string | null = null
  const rollbackCalls: WhmCallDefinition[] = []
  let currentStep: ProvisioningStepId = 'select-node'

  try {
    steps = setStep(steps, 'select-node', 'in_progress')
    const reservation = await reserveSiteCapacity(
      supabase,
      input.userId,
      sanitizeDomain(input.siteDomain),
    )
    node = reservation.node
    reservationId = reservation.reservationId
    steps = setStep(steps, 'select-node', 'completed')

    const normalizedDomain = sanitizeDomain(input.siteDomain)
    const databasePassword = generateDatabasePassword()
    const names = buildDatabaseNames(node, normalizedDomain)

    currentStep = 'create-domain'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(env, executor, buildAddonDomainCall(node, normalizedDomain))
    rollbackCalls.push(buildDelAddonDomainCall(node, normalizedDomain))
    steps = setStep(steps, currentStep, 'completed')

    // Optional MySQL Database setup
    if (database === 'mysql') {
      currentStep = 'create-database'
      steps = setStep(steps, currentStep, 'in_progress')
      await executeWhmCall(
        env,
        executor,
        buildMysqlCall(node, 'create_database', {
          name: names.rawDatabaseName,
          'prefix-size': '16',
        }),
      )
      rollbackCalls.push(
        buildMysqlCall(node, 'delete_database', { name: names.fullDatabaseName }),
      )
      steps = setStep(steps, currentStep, 'completed')

      currentStep = 'create-user'
      steps = setStep(steps, currentStep, 'in_progress')
      await executeWhmCall(
        env,
        executor,
        buildMysqlCall(node, 'create_user', {
          name: names.rawDatabaseUser,
          password: databasePassword,
          'prefix-size': '16',
        }),
      )
      rollbackCalls.push(
        buildMysqlCall(node, 'delete_user', { name: names.fullDatabaseUser }),
      )
      steps = setStep(steps, currentStep, 'completed')

      currentStep = 'grant-privileges'
      steps = setStep(steps, currentStep, 'in_progress')
      await executeWhmCall(
        env,
        executor,
        buildMysqlCall(node, 'set_privileges_on_database', {
          database: names.fullDatabaseName,
          user: names.fullDatabaseUser,
          privileges: 'ALL PRIVILEGES',
        }),
      )
      steps = setStep(steps, currentStep, 'completed')
    } else if (database === 'postgresql') {
      currentStep = 'create-database'
      steps = setStep(steps, currentStep, 'in_progress')
      await executeWhmCall(
        env,
        executor,
        buildPostgresqlCall(node, 'create_database', {
          name: names.rawDatabaseName,
        }),
      )
      rollbackCalls.push(
        buildPostgresqlCall(node, 'delete_database', { name: names.fullDatabaseName }),
      )
      steps = setStep(steps, currentStep, 'completed')

      currentStep = 'create-user'
      steps = setStep(steps, currentStep, 'in_progress')
      await executeWhmCall(
        env,
        executor,
        buildPostgresqlCall(node, 'create_user', {
          name: names.rawDatabaseUser,
          password: databasePassword,
        }),
      )
      rollbackCalls.push(
        buildPostgresqlCall(node, 'delete_user', { name: names.fullDatabaseUser }),
      )
      steps = setStep(steps, currentStep, 'completed')

      currentStep = 'grant-privileges'
      steps = setStep(steps, currentStep, 'in_progress')
      await executeWhmCall(
        env,
        executor,
        buildPostgresqlCall(node, 'grant_all_privileges', {
          database: names.fullDatabaseName,
          user: names.fullDatabaseUser,
        }),
      )
      steps = setStep(steps, currentStep, 'completed')
    }

    if (siteType === 'nextjs' || siteType === 'nodejs') {
      currentStep = 'setup-nodejs-app'
      steps = setStep(steps, currentStep, 'in_progress')
      try {
        await executeWhmCall(env, executor, buildNodejsAppCall(node, normalizedDomain))
      } catch (nodeErr) {
        const message = nodeErr instanceof Error ? nodeErr.message : String(nodeErr)
        const moduleUnavailable = /unknown module|module.*not (?:found|available|installed|enabled)|not supported/i.test(
          message,
        )
        if (!moduleUnavailable) throw nodeErr
        console.warn('NodejsApp::create skipped (module unavailable):', message)
      }
      steps = setStep(steps, currentStep, 'completed')
    }

    currentStep = 'enable-ssl'
    steps = setStep(steps, currentStep, 'in_progress')
    await executeWhmCall(env, executor, buildAutoSslCall(node))
    steps = setStep(steps, currentStep, 'completed')

    currentStep = 'complete'
    steps = setStep(steps, currentStep, 'in_progress')
    const { data: insertedSite, error: insertError } = await supabase.rpc(
      'complete_site_reservation',
      {
        target_reservation_id: reservationId,
        target_user_id: input.userId,
        site_values: {
          db_name: database !== 'none' ? names.fullDatabaseName : '',
          db_user: database !== 'none' ? names.fullDatabaseUser : '',
          document_root: toAbsoluteDocumentRoot(normalizedDomain),
          site_type: siteType,
          db_type: database,
        },
      },
    )

    if (insertError) {
      throw new Error(`Unable to persist site inventory: ${insertError.message}`)
    }
    steps = setStep(steps, currentStep, 'completed')

    return {
      site: insertedSite as ProvisionedSiteRecord,
      steps,
      nodeSummary: {
        primaryDomain: node.primary_domain,
        currentSlots: node.current_slots,
        maxSlots: node.max_slots,
      },
    }
  } catch (error) {
    steps = setStep(steps, currentStep, 'failed')
    for (const call of rollbackCalls.reverse()) {
      try { await executeWhmCall(env, executor, call) } catch { /* best-effort */ }
    }
    if (reservationId) {
      await releaseSiteReservation(supabase, reservationId, input.userId)
    }
    throw new ProvisioningError(
      error instanceof Error ? error.message : 'Provisioning failed.',
      steps,
    )
  }
}

// ─── Unified dispatcher ───────────────────────────────────────────────────────

export async function provisionSite(
  input: ProvisionSiteInput,
  dependencies: ProvisionerDependencies,
): Promise<ProvisionSiteResult> {
  const siteType = input.siteType ?? 'wordpress'

  if (siteType === 'wordpress') {
    return provisionWordPressSite(input, dependencies)
  }

  if (siteType === 'static') {
    return provisionStaticSite(input, dependencies)
  }

  // 'nextjs' | 'nodejs'
  return provisionNodeSite(input, dependencies)
}

export interface DeprovisionSiteOptions {
  siteId: string
  userId: string
}

export async function deprovisionWordPressSite(
  options: DeprovisionSiteOptions,
  deps: ProvisionerDependencies,
): Promise<{ success: boolean; siteDomain: string }> {
  const supabase = deps.supabase ?? createSupabaseAdminClient(loadProvisionerEnv(deps.env))

  // 1. Fetch site record and attached hosting node
  const { data: site, error: siteError } = await supabase
    .from('user_sites')
    .select('*, hosting_nodes(*)')
    .eq('id', options.siteId)
    .single()

  if (siteError || !site) {
    throw new Error(`Site record ${options.siteId} not found or already deleted`)
  }

  if (!site.hosting_nodes) {
    throw new Error(
      `Site record ${options.siteId} (${site.site_domain}) has no linked hosting node — aborting deprovision rather than guessing an account.`,
    )
  }

  const node: HostingNodeRecord = site.hosting_nodes

  const executor = deps.executor ?? createFetchWhmExecutor()

  // 2. WHM: Delete Addon Domain from cPanel
  try {
    const delDomainCall = buildDelAddonDomainCall(node, site.site_domain)
    await executeWhmCall(deps.env, executor, delDomainCall)
  } catch (err) {
    console.warn(`WHM deladdondomain notice for ${site.site_domain}:`, err)
  }

  // 3. WHM: Delete Database & User (MySQL or PostgreSQL)
  const dbType = site.db_type || (site.db_name ? 'mysql' : 'none')
  if (site.db_name && dbType !== 'none') {
    const dbNames = buildDatabaseNames(node, site.site_domain)
    if (dbType === 'postgresql') {
      try {
        await executeWhmCall(deps.env, executor, buildPostgresqlCall(node, 'delete_database', { name: site.db_name }))
      } catch (err) {
        console.warn(`WHM PostgreSQL delete_database notice for ${site.site_domain}:`, err)
      }
      try {
        await executeWhmCall(deps.env, executor, buildPostgresqlCall(node, 'delete_user', { name: site.db_user || dbNames.fullDatabaseUser }))
      } catch (err) {
        console.warn(`WHM PostgreSQL delete_user notice for ${site.site_domain}:`, err)
      }
    } else {
      try {
        await executeWhmCall(deps.env, executor, buildMysqlCall(node, 'delete_database', { name: site.db_name }))
      } catch (err) {
        console.warn(`WHM MySQL delete_database notice for ${site.site_domain}:`, err)
      }
      try {
        await executeWhmCall(deps.env, executor, buildMysqlCall(node, 'delete_user', { name: site.db_user || dbNames.fullDatabaseUser }))
      } catch (err) {
        console.warn(`WHM MySQL delete_user notice for ${site.site_domain}:`, err)
      }
    }
  }

  // 5. Delete site record from Supabase user_sites
  const { error: deleteError } = await supabase
    .from('user_sites')
    .delete()
    .eq('id', options.siteId)

  if (deleteError) {
    throw new Error(`Failed to delete site record: ${deleteError.message}`)
  }

  // 6. Release node slot reservation
  try {
    await releaseSiteReservation(supabase, site.id, site.user_id)
  } catch (err) {
    console.warn('Slot release notice:', err)
  }

  return { success: true, siteDomain: site.site_domain }
}
