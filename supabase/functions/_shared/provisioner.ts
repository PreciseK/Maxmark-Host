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
  const url = new URL(`https://${env.WHM_HOST}:${env.WHM_PORT}${requestPath}`)
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
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
    })
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    return { ok: response.ok, status: response.status, body }
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
    throw new Error(`${call.name} failed with HTTP ${response.status}`)
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

async function allocateHostingNode(
  supabase: SupabaseClient,
): Promise<HostingNodeRecord> {
  const { data, error } = await supabase.rpc('allocate_hosting_node')

  if (error) {
    throw new Error(`Unable to allocate hosting capacity: ${error.message}`)
  }

  return data as HostingNodeRecord
}

async function releaseHostingNode(supabase: SupabaseClient, nodeId: string) {
  const { error } = await supabase.rpc('release_hosting_node', {
    target_node_id: nodeId,
  })

  if (error) {
    console.error(`release_hosting_node(${nodeId}) failed: ${error.message}`)
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
  const rollbackCalls: WhmCallDefinition[] = []
  let currentStep: ProvisioningStepId = 'select-node'

  try {
    steps = setStep(steps, 'select-node', 'in_progress')
    node = await allocateHostingNode(supabase)
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

    currentStep = 'complete'
    steps = setStep(steps, currentStep, 'in_progress')
    // id / created_at / updated_at are generated by Postgres.
    const { data: insertedSite, error: insertError } = await supabase
      .from('user_sites')
      .insert({
        user_id: input.userId,
        node_id: node.id,
        site_domain: normalizedDomain,
        db_name: names.fullDatabaseName,
        db_user: names.fullDatabaseUser,
        document_root: toAbsoluteDocumentRoot(normalizedDomain),
        status: 'active',
      })
      .select()
      .single()

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

    if (node) {
      await releaseHostingNode(supabase, node.id)
    }

    throw new ProvisioningError(
      error instanceof Error ? error.message : 'Provisioning failed.',
      steps,
    )
  }
}
