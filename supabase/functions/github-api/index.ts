// POST /functions/v1/github-api
// Body:
//   1. Save token:        { action: "save_token", token: "ghp_..." }
//   2. Connection status: { action: "connection_status" }
//   3. Disconnect:        { action: "disconnect" }
//   4. List repos:        { action: "list_repos" }
//   5. List branches:     { action: "list_branches", owner: "...", repo: "..." }
//
// The GitHub access token is submitted once (via save_token) and stored
// server-side in user_github_connections — it is never returned to the
// client and never needs to be re-sent for list_repos/list_branches. This
// keeps a credential with full 'repo' scope (read/write on every repo,
// public and private) out of browser storage entirely.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts'

interface GitHubApiRepo {
  id: number
  name: string
  full_name: string
  owner?: { login: string; avatar_url: string }
  private: boolean
  html_url: string
  clone_url: string
  default_branch?: string
  updated_at: string
  description: string | null
}

interface GitHubApiBranch {
  name: string
  protected: boolean
}

const saveTokenSchema = z.object({
  action: z.literal('save_token'),
  token: z.string().min(1, 'GitHub access token is required').max(500),
})

const listBranchesSchema = z.object({
  action: z.literal('list_branches'),
  owner: z.string().min(1),
  repo: z.string().min(1),
})

async function getStoredToken(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('user_github_connections')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.access_token ?? null
}

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) {
    return errorResponse('Invalid or expired session', 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const bodyObj = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  // ── Action: Save Token ───────────────────────────────────────────────────────
  if (bodyObj.action === 'save_token') {
    const parse = saveTokenSchema.safeParse(bodyObj)
    if (!parse.success) {
      return errorResponse(parse.error.issues[0]?.message ?? 'Invalid request', 400)
    }

    const { error } = await adminClient
      .from('user_github_connections')
      .upsert(
        { user_id: user.id, access_token: parse.data.token, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )

    if (error) {
      return errorResponse(`Unable to save GitHub connection: ${error.message}`, 500)
    }

    return jsonResponse({ success: true, data: { connected: true } })
  }

  // ── Action: Connection Status ─────────────────────────────────────────────────
  if (bodyObj.action === 'connection_status') {
    const token = await getStoredToken(adminClient, user.id)
    return jsonResponse({ success: true, data: { connected: Boolean(token) } })
  }

  // ── Action: Disconnect ───────────────────────────────────────────────────────
  if (bodyObj.action === 'disconnect') {
    const { error } = await adminClient
      .from('user_github_connections')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      return errorResponse(`Unable to disconnect: ${error.message}`, 500)
    }

    return jsonResponse({ success: true, data: { connected: false } })
  }

  // ── Action: List Repositories ────────────────────────────────────────────────
  if (bodyObj.action === 'list_repos') {
    const token = await getStoredToken(adminClient, user.id)
    if (!token) {
      return errorResponse('No GitHub connection found. Connect your account first.', 400)
    }

    try {
      const ghRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Maxmark-Host-App',
        },
      })

      if (!ghRes.ok) {
        const ghErr = await ghRes.json().catch(() => ({}))
        return errorResponse(ghErr.message || `GitHub API returned status ${ghRes.status}`, ghRes.status)
      }

      const reposData = await ghRes.json() as GitHubApiRepo[]
      const repos = reposData.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        owner: r.owner?.login,
        ownerAvatar: r.owner?.avatar_url,
        private: r.private,
        htmlUrl: r.html_url,
        cloneUrl: r.clone_url,
        defaultBranch: r.default_branch || 'main',
        updatedAt: r.updated_at,
        description: r.description,
      }))

      return jsonResponse({ success: true, data: { repos } })
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : String(err), 500)
    }
  }

  // ── Action: List Branches ────────────────────────────────────────────────────
  if (bodyObj.action === 'list_branches') {
    const parse = listBranchesSchema.safeParse(bodyObj)
    if (!parse.success) {
      return errorResponse(parse.error.issues[0]?.message ?? 'Invalid request', 400)
    }

    const token = await getStoredToken(adminClient, user.id)
    if (!token) {
      return errorResponse('No GitHub connection found. Connect your account first.', 400)
    }

    try {
      const ghRes = await fetch(`https://api.github.com/repos/${parse.data.owner}/${parse.data.repo}/branches?per_page=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Maxmark-Host-App',
        },
      })

      if (!ghRes.ok) {
        const ghErr = await ghRes.json().catch(() => ({}))
        return errorResponse(ghErr.message || `GitHub API returned status ${ghRes.status}`, ghRes.status)
      }

      const branchesData = await ghRes.json() as GitHubApiBranch[]
      const branches = branchesData.map((b) => ({
        name: b.name,
        protected: b.protected,
      }))

      return jsonResponse({ success: true, data: { branches } })
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : String(err), 500)
    }
  }

  return errorResponse('Unsupported action', 400)
})
