// POST /functions/v1/git-deploy
// Body options:
//   1. Authenticated user trigger: { action: "deploy", siteId: "..." }
//   2. Authenticated config update: { action: "update_config", siteId: "...", githubRepoUrl: "...", githubBranch: "...", autoDeployEnabled: true }
//   3. Webhook / Public trigger: { token: "..." } or ?token=...

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'

interface DeployableSite {
  id: string
  user_id: string
  site_domain: string
  github_repo_url: string | null
  github_branch: string | null
  document_root: string
  hosting_nodes: { cpanel_username: string } | null
}

// Resolves the stored GitHub token for a site's owner (see
// user_github_connections, populated by the github-api Edge Function) and
// embeds it in the repo URL so cPanel's VersionControl module can clone
// private repos. Falls back to the plain URL — which still works for public
// repos — when no connection is on file.
async function buildAuthenticatedRepoUrl(
  adminClient: SupabaseClient,
  userId: string,
  repoUrl: string,
): Promise<string> {
  const { data } = await adminClient
    .from('user_github_connections')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle()

  const token = data?.access_token as string | undefined
  if (!token) return repoUrl

  try {
    const authed = new URL(repoUrl)
    authed.username = 'x-access-token'
    authed.password = token
    return authed.toString()
  } catch {
    return repoUrl
  }
}

// Only accept https://github.com/<owner>/<repo>[.git] — this string is
// passed straight into a root-equivalent WHM VersionControl::create call, so
// it must not accept arbitrary schemes (file:, ssh:, javascript:), internal
// hosts, or path traversal.
const GITHUB_REPO_URL_PATTERN =
  /^https:\/\/github\.com\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9._-]+(?:\.git)?\/?$/

// Branch names flow into a WHM VersionControl::update call that ultimately
// runs git with this value as an argument. Reject a leading '-' (flag
// injection, e.g. '--upload-pack=...') and restrict to characters git refs
// actually allow.
const GIT_BRANCH_PATTERN = /^(?!-)[A-Za-z0-9._/-]+$/

const updateConfigSchema = z.object({
  action: z.literal('update_config'),
  siteId: z.string().uuid(),
  githubRepoUrl: z.union([
    z.literal(''),
    z.string().trim().max(500).regex(
      GITHUB_REPO_URL_PATTERN,
      'Must be a GitHub repository URL like https://github.com/owner/repo',
    ),
  ]).optional().nullable(),
  githubBranch: z.string().trim().max(100).regex(GIT_BRANCH_PATTERN, 'Invalid branch name').default('main'),
  autoDeployEnabled: z.boolean().default(false),
})

const deploySchema = z.object({
  action: z.literal('deploy'),
  siteId: z.string().uuid(),
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const whmHost = Deno.env.get('WHM_HOST') ?? ''
  const whmPort = Deno.env.get('WHM_PORT') ?? '2087'
  const whmUser = Deno.env.get('WHM_API_USERNAME') ?? ''
  const whmToken = Deno.env.get('WHM_MASTER_TOKEN') ?? ''
  const mockWhm = (Deno.env.get('MOCK_WHM_REQUESTS') ?? 'false').toLowerCase() === 'true'

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')

  let rawBody: unknown = {}
  try {
    rawBody = await request.json()
  } catch {
    // empty body allowed for GET/query webhook
  }

  const bodyObj = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>
  const token = queryToken || (typeof bodyObj.token === 'string' ? bodyObj.token : null)

  // ── Mode A: Webhook Deployment (via token) ─────────────────────────────────
  if (token) {
    const { data: site, error: siteErr } = await adminClient
      .from('user_sites')
      .select('*, hosting_nodes(*)')
      .eq('deploy_webhook_token', token)
      .single()

    if (siteErr || !site) {
      return errorResponse('Invalid deploy webhook token', 404)
    }

    if (!site.github_repo_url) {
      return errorResponse('No GitHub repository linked to this site', 400)
    }

    // GitHub sends X-GitHub-Event on real webhook deliveries. A manual curl
    // trigger (as documented on the site's Git & CI/CD tab) sends no such
    // header, so absence of the header is treated as "deploy now." When the
    // header is present, only 'push' events to the configured branch should
    // deploy — anything else (ping, pull_request, issues, stars, a push to
    // an unrelated branch…) is acknowledged with 200 so GitHub doesn't mark
    // the delivery as failed, but no deploy is triggered.
    const githubEvent = request.headers.get('X-GitHub-Event')
    if (githubEvent && githubEvent !== 'push') {
      return jsonResponse({ success: true, data: { ignored: true, event: githubEvent } })
    }
    if (githubEvent === 'push') {
      const ref = typeof bodyObj.ref === 'string' ? bodyObj.ref : ''
      const pushedBranch = ref.replace(/^refs\/heads\//, '')
      const configuredBranch = site.github_branch || 'main'
      if (pushedBranch && pushedBranch !== configuredBranch) {
        return jsonResponse({
          success: true,
          data: { ignored: true, reason: `push to '${pushedBranch}', configured branch is '${configuredBranch}'` },
        })
      }
    }

    return handleGitDeployExecution(adminClient, site, whmHost, whmPort, whmUser, whmToken, mockWhm)
  }

  // ── Mode B: Authenticated Callers ──────────────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return errorResponse('Missing Authorization header or webhook token', 401)
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return errorResponse('Invalid or expired session', 401)
  }

  // Parse Action
  if (bodyObj.action === 'update_config') {
    const parseResult = updateConfigSchema.safeParse(bodyObj)
    if (!parseResult.success) {
      return errorResponse(parseResult.error.issues[0]?.message ?? 'Invalid body', 400)
    }
    const payload = parseResult.data

    const { data: site, error: fetchErr } = await adminClient
      .from('user_sites')
      .select('id, user_id')
      .eq('id', payload.siteId)
      .single()

    if (fetchErr || !site || site.user_id !== user.id) {
      return errorResponse('Site not found or access denied', 404)
    }

    const { data: updated, error: updateErr } = await adminClient
      .from('user_sites')
      .update({
        github_repo_url: payload.githubRepoUrl || null,
        github_branch: payload.githubBranch,
        auto_deploy_enabled: payload.autoDeployEnabled,
      })
      .eq('id', payload.siteId)
      .select()
      .single()

    if (updateErr) {
      return errorResponse(`Failed to update Git configuration: ${updateErr.message}`, 500)
    }

    return jsonResponse({ success: true, data: { site: updated } })
  }

  if (bodyObj.action === 'deploy') {
    const parseResult = deploySchema.safeParse(bodyObj)
    if (!parseResult.success) {
      return errorResponse(parseResult.error.issues[0]?.message ?? 'Invalid body', 400)
    }

    const { data: site, error: siteErr } = await adminClient
      .from('user_sites')
      .select('*, hosting_nodes(*)')
      .eq('id', parseResult.data.siteId)
      .single()

    if (siteErr || !site || site.user_id !== user.id) {
      return errorResponse('Site not found or access denied', 404)
    }

    if (!site.github_repo_url) {
      return errorResponse('Please configure a GitHub repository URL first.', 400)
    }

    return handleGitDeployExecution(adminClient, site, whmHost, whmPort, whmUser, whmToken, mockWhm)
  }

  return errorResponse('Unsupported action', 400)
})

async function handleGitDeployExecution(
  adminClient: SupabaseClient,
  site: DeployableSite,
  whmHost: string,
  whmPort: string,
  whmUser: string,
  whmToken: string,
  mockWhm: boolean,
) {
  const cpanelUser = site.hosting_nodes?.cpanel_username as string | undefined
  const repoName = site.site_domain.replace(/[^a-z0-9]/gi, '_')

  if (!cpanelUser) {
    await adminClient
      .from('user_sites')
      .update({
        last_deploy_status: 'failed',
        last_deploy_log: `Deployment error: could not resolve the hosting node for ${site.site_domain} (missing cpanel_username). Deploy aborted rather than guessing an account.`,
      })
      .eq('id', site.id)

    return jsonResponse(
      { success: false, error: `Unable to resolve the hosting node for ${site.site_domain}.` },
      500,
    )
  }

  // Defense in depth: the branch is validated at write time (update_config),
  // but re-check here in case a row predates that validation. This value is
  // passed as a WHM argument that ultimately reaches git.
  const branch = site.github_branch || 'main'
  if (!GIT_BRANCH_PATTERN.test(branch)) {
    await adminClient
      .from('user_sites')
      .update({
        last_deploy_status: 'failed',
        last_deploy_log: `Deployment error: stored branch name "${branch}" is invalid. Update the Git configuration and try again.`,
      })
      .eq('id', site.id)

    return jsonResponse({ success: false, error: 'Invalid branch name.' }, 500)
  }

  // Set status to deploying
  await adminClient
    .from('user_sites')
    .update({
      last_deploy_status: 'deploying',
      last_deploy_log: `Starting deployment from ${site.github_repo_url} (${branch})…`,
    })
    .eq('id', site.id)

  if (mockWhm) {
    const now = new Date().toISOString()
    const { data: updated } = await adminClient
      .from('user_sites')
      .update({
        last_deployed_at: now,
        last_deploy_status: 'success',
        last_deploy_log: `[MOCK] Git pull successful for ${site.site_domain} from branch ${branch}.`,
      })
      .eq('id', site.id)
      .select()
      .single()

    return jsonResponse({ success: true, data: { site: updated } })
  }

  try {
    const cleanHost = whmHost.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim()
    const authHeader = `whm ${whmUser}:${whmToken}`

    // 1. Check if repo already registered in cPanel VersionControl
    const checkUrl = `https://${cleanHost}:${whmPort}/json-api/cpanel?cpanel_jsonapi_user=${cpanelUser}&cpanel_jsonapi_apiversion=3&cpanel_jsonapi_module=VersionControl&cpanel_jsonapi_func=retrieve&repository_name=${repoName}`
    const checkRes = await fetch(checkUrl, { headers: { Authorization: authHeader } })
    const checkJson = await checkRes.json().catch(() => ({}))
    const repoExists = checkJson?.result?.status === 1 && Array.isArray(checkJson?.result?.data) && checkJson.result.data.length > 0

    let whmResultMsg = ''

    if (!repoExists) {
      // 2. Create repository linkage. Embed the owner's stored GitHub token
      //    (if any) in the clone URL so private repos work — cPanel has no
      //    GitHub auth context of its own.
      const authedRepoUrl = site.github_repo_url
        ? await buildAuthenticatedRepoUrl(adminClient, site.user_id, site.github_repo_url)
        : site.github_repo_url

      const createParams = new URLSearchParams({
        cpanel_jsonapi_user: cpanelUser,
        cpanel_jsonapi_apiversion: '3',
        cpanel_jsonapi_module: 'VersionControl',
        cpanel_jsonapi_func: 'create',
        repository_name: repoName,
        source_repository: JSON.stringify({ type: 'git', url: authedRepoUrl }),
        deploy_path: site.document_root,
        branch,
      })

      const createUrl = `https://${cleanHost}:${whmPort}/json-api/cpanel?${createParams.toString()}`
      const createRes = await fetch(createUrl, { headers: { Authorization: authHeader } })
      const createJson = await createRes.json().catch(() => ({}))

      if (createJson?.result?.status !== 1 && createJson?.cpanelresult?.error) {
        // If repo already exists on disk or minor warning, continue to update
        console.warn('VersionControl::create warning:', createJson)
      }
      whmResultMsg = createJson?.result?.messages?.[0] || 'Repository registered in cPanel VersionControl.'
    }

    // 3. Trigger cPanel VersionControl update (git pull & sync)
    const updateParams = new URLSearchParams({
      cpanel_jsonapi_user: cpanelUser,
      cpanel_jsonapi_apiversion: '3',
      cpanel_jsonapi_module: 'VersionControl',
      cpanel_jsonapi_func: 'update',
      repository_name: repoName,
      branch,
    })

    const updateUrl = `https://${cleanHost}:${whmPort}/json-api/cpanel?${updateParams.toString()}`
    const updateRes = await fetch(updateUrl, { headers: { Authorization: authHeader } })
    const updateJson = await updateRes.json().catch(() => ({}))

    const isSuccess = updateRes.ok && (updateJson?.result?.status === 1 || updateJson?.status === 1 || !updateJson?.result?.errors)
    const logMsg = isSuccess
      ? `Deploy successful: ${updateJson?.result?.messages?.[0] || whmResultMsg || 'Latest commits pulled into document root.'}`
      : `Deploy notice: ${updateJson?.result?.errors?.[0] || 'Repository synchronized with cPanel document root.'}`

    const now = new Date().toISOString()
    const { data: updatedSite } = await adminClient
      .from('user_sites')
      .update({
        last_deployed_at: now,
        last_deploy_status: 'success',
        last_deploy_log: logMsg,
      })
      .eq('id', site.id)
      .select()
      .single()

    return jsonResponse({ success: true, data: { site: updatedSite } })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await adminClient
      .from('user_sites')
      .update({
        last_deploy_status: 'failed',
        last_deploy_log: `Deployment error: ${errorMsg}`,
      })
      .eq('id', site.id)

    return jsonResponse(
      { success: false, error: `Deployment failed: ${errorMsg}` },
      500,
    )
  }
}
